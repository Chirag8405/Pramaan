"use client";

import { ethers } from "ethers";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { appendEvidenceEntry } from "../../../src/utils/evidence";
import { checkpointScanNonce, isScanNonceUsed, verifyProduct } from "../../../src/utils/contract";
import { CHAIN_ID, PRODUCT_REGISTRY_ADDRESS } from "../../../src/utils/constants";

const AUTH_MESSAGE = "Authentic Pramaan Scan";
const ZERO_HASH = "0x" + "00".repeat(32);

function normalizeHexParam(value) {
    const raw = String(value || "").trim();
    const unquoted = raw.replace(/^['\"]|['\"]$/g, "").trim();
    if (!unquoted) {
        return "";
    }
    return unquoted.startsWith("0x") ? unquoted : "0x" + unquoted;
}

function shortAddress(address) {
    if (!address) {
        return "-";
    }
    return address.slice(0, 6) + "..." + address.slice(-4);
}

function normalizeNonce(value) {
    const text = String(value || "").trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(text)) {
        return "";
    }
    return text;
}

function randomNonce() {
    return ethers.utils.hexlify(ethers.utils.randomBytes(32));
}

function buildAttestationDigest(record, hash) {
    return ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(
            [
                "uint256",
                "address",
                "bytes32",
                "bytes32",
                "address",
                "address",
                "string",
                "string",
                "string",
                "uint256",
                "uint256"
            ],
            [
                CHAIN_ID,
                PRODUCT_REGISTRY_ADDRESS,
                hash,
                record.metadataHash,
                record.artisan,
                record.provenanceSigner,
                record.ipfsCid,
                record.productName,
                record.giTag,
                record.origin_lat,
                record.origin_lng
            ]
        )
    );
}

export default function ProductHashVerifyPage() {
    const params = useParams();
    const searchParams = useSearchParams();

    const productHash = useMemo(() => {
        const raw = params?.productHash;
        return Array.isArray(raw) ? raw[0] : raw || "";
    }, [params]);

    const signatureFromUrl = normalizeHexParam(searchParams.get("sig") || "");
    const nonceFromUrl = normalizeNonce(searchParams.get("nonce") || "");

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [checkpointLoading, setCheckpointLoading] = useState(false);
    const [scanNonce, setScanNonce] = useState("");
    const [details, setDetails] = useState(null);
    const [checkpointState, setCheckpointState] = useState({
        checkedUsed: null,
        checkpointed: false,
        replayed: null,
        txUrl: ""
    });

    useEffect(() => {
        let cancelled = false;

        async function verifyFromChain() {
            setLoading(true);
            setError("");

            try {
                if (!productHash) {
                    throw new Error("Missing product hash in URL.");
                }

                if (!ethers.utils.isHexString(productHash) || ethers.utils.hexDataLength(productHash) !== 32) {
                    throw new Error("Invalid product hash format. Expected bytes32 hex string.");
                }

                if (!PRODUCT_REGISTRY_ADDRESS) {
                    throw new Error("Product registry address is not configured in environment variables.");
                }

                const { record } = await verifyProduct(productHash);
                const provenanceSigner = String(record.provenanceSigner || ethers.constants.AddressZero);

                const activeNonce = nonceFromUrl || randomNonce();
                const nonceAlreadyUsed = Boolean(await isScanNonceUsed(productHash, activeNonce));

                const hasMetadataHash = String(record.metadataHash || ZERO_HASH).toLowerCase() !== ZERO_HASH;
                const hasDeviceSignature = String(record.deviceSignature || "0x") !== "0x";

                const attestationDigest = buildAttestationDigest(record, productHash);

                let recoveredFromDeviceSignature = ethers.constants.AddressZero;
                let deviceSignatureMatches = false;
                if (hasDeviceSignature) {
                    recoveredFromDeviceSignature = ethers.utils.verifyMessage(
                        ethers.utils.arrayify(attestationDigest),
                        record.deviceSignature
                    );
                    deviceSignatureMatches = recoveredFromDeviceSignature.toLowerCase() === provenanceSigner.toLowerCase();
                }

                let recoveredFromSignature = ethers.constants.AddressZero;
                let signatureMatches = false;
                if (signatureFromUrl) {
                    const challenge = AUTH_MESSAGE + ":" + productHash + ":" + activeNonce;
                    recoveredFromSignature = ethers.utils.verifyMessage(challenge, signatureFromUrl);
                    signatureMatches = recoveredFromSignature.toLowerCase() === provenanceSigner.toLowerCase();
                }

                const verified = Boolean(deviceSignatureMatches && hasMetadataHash);

                if (!cancelled) {
                    setScanNonce(activeNonce);
                    setCheckpointState({
                        checkedUsed: nonceAlreadyUsed,
                        checkpointed: false,
                        replayed: null,
                        txUrl: ""
                    });
                    setDetails({
                        productHash,
                        verified,
                        hasMetadataHash,
                        hasDeviceSignature,
                        deviceSignatureMatches,
                        signatureMatches,
                        signatureProvided: Boolean(signatureFromUrl),
                        provenanceSigner,
                        recoveredFromDeviceSignature,
                        recoveredFromSignature,
                        productName: record.productName,
                        giTag: record.giTag,
                        metadataHash: record.metadataHash
                    });
                }
            } catch (err) {
                if (!cancelled) {
                    setError(err?.shortMessage || err?.reason || err?.message || "Verification failed.");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        verifyFromChain();

        return () => {
            cancelled = true;
        };
    }, [productHash, signatureFromUrl, nonceFromUrl]);

    async function onCheckpointNonce() {
        if (!details || !scanNonce) {
            return;
        }

        setCheckpointLoading(true);
        setError("");

        try {
            const result = await checkpointScanNonce(details.productHash, scanNonce);
            const txHash = result?.receipt?.transactionHash || result?.receipt?.hash || "";
            const replayed = Boolean(result?.replayed);

            setCheckpointState({
                checkedUsed: checkpointState.checkedUsed,
                checkpointed: true,
                replayed,
                txUrl: txHash ? "https://sepolia.etherscan.io/tx/" + txHash : ""
            });

            if (txHash) {
                appendEvidenceEntry({
                    action: "Nonce Checkpoint",
                    productHash: details.productHash,
                    txUrl: "https://sepolia.etherscan.io/tx/" + txHash,
                    notes: replayed ? "Replay detected for nonce " + scanNonce : "First scan for nonce " + scanNonce
                });
            }
        } catch (err) {
            setError(err?.shortMessage || err?.reason || err?.message || "Could not checkpoint nonce.");
        } finally {
            setCheckpointLoading(false);
        }
    }

    return (
        <main className="min-h-screen bg-[radial-gradient(circle_at_top,#131917_0%,#0b0f0e_55%,#000000_100%)] px-4 py-8 text-[#f3f6f4]">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
                <div className="rounded-3xl border border-[#26312b] bg-[#131917]/90 p-6 shadow-[0_18px_70px_rgba(0,0,0,0.55)] backdrop-blur">
                    <p className="m-0 text-xs uppercase tracking-[0.28em] text-[#34d399]/80">Pramaan Hardware Handshake</p>
                    <h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight md:text-6xl">Scan Integrity Check</h1>
                    <p className="mt-3 text-[#aebbb5]">
                        We compare a recovered signer from the QR's signature with the on-chain provenance signer for this product.
                    </p>
                </div>

                {loading && (
                    <div className="rounded-3xl border border-[#35443c] bg-[#1a211e] p-10 text-center">
                        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-[#35443c] border-t-[#34d399]" />
                        <p className="m-0 text-xl font-semibold text-[#f3f6f4]">Verifying hardware signature...</p>
                    </div>
                )}

                {!loading && error && (
                    <div className="rounded-3xl border border-[#4a1f1f] bg-[#3a1414] p-8 text-[#f87171]">
                        <p className="m-0 text-3xl font-black">Verification Error</p>
                        <p className="mt-2 text-base text-[#f87171]">{error}</p>
                    </div>
                )}

                {!loading && !error && details && details.verified && (
                    <div className="rounded-3xl border-2 border-[#34d399] bg-[#0f2e22] p-8 shadow-[0_0_65px_rgba(16,185,129,0.28)]">
                        <p className="m-0 text-center text-6xl md:text-8xl">✅</p>
                        <h2 className="mt-3 text-center font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-[#4ade80] md:text-6xl">Attestation Verified</h2>
                        <p className="mt-3 text-center text-lg text-[#4ade80]">
                            On-chain device attestation matches the configured provenance signer.
                        </p>
                    </div>
                )}

                {!loading && !error && details && !details.verified && (
                    <div className="rounded-3xl border-2 border-[#f87171] bg-[#3a1414] p-8 shadow-[0_0_65px_rgba(244,63,94,0.3)]">
                        <p className="m-0 text-center text-6xl md:text-8xl">❌</p>
                        <h2 className="mt-3 text-center font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-[#f87171] md:text-6xl">Attestation Failed</h2>
                        <p className="mt-3 text-center text-lg text-[#f87171]">
                            Metadata hash or device signature does not satisfy the expected provenance check.
                        </p>
                    </div>
                )}

                {!loading && !error && details && (
                    <div className="grid gap-4 rounded-3xl border border-[#26312b] bg-[#131917]/90 p-6 md:grid-cols-2">
                        <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-4 md:col-span-2">
                            <p className="m-0 text-xs uppercase tracking-widest text-[#8a9891]">Product</p>
                            <p className="m-0 text-xl font-bold text-[#f3f6f4]">
                                {details.productName || "Unnamed Product"}
                                {details.giTag ? " (" + details.giTag + ")" : ""}
                            </p>
                        </div>

                        <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-4">
                            <p className="m-0 text-xs uppercase tracking-widest text-[#8a9891]">Product Hash</p>
                            <p className="m-0 break-all font-mono text-sm text-[#f3f6f4]">{details.productHash}</p>
                        </div>

                        <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-4">
                            <p className="m-0 text-xs uppercase tracking-widest text-[#8a9891]">Expected Provenance Signer</p>
                            <p className="m-0 break-all font-mono text-sm text-[#f3f6f4]" title={details.provenanceSigner}>
                                {shortAddress(details.provenanceSigner)}
                            </p>
                        </div>

                        <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-4 md:col-span-2">
                            <p className="m-0 text-xs uppercase tracking-widest text-[#8a9891]">Recovered From Device Signature</p>
                            <p className="m-0 break-all font-mono text-sm text-[#f3f6f4]" title={details.recoveredFromDeviceSignature}>
                                {shortAddress(details.recoveredFromDeviceSignature)}
                            </p>
                        </div>

                        <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-4">
                            <p className="m-0 text-xs uppercase tracking-widest text-[#8a9891]">Metadata Hash Anchored</p>
                            <p className="m-0 text-sm text-[#f3f6f4]">{details.hasMetadataHash ? "Yes" : "No"}</p>
                        </div>

                        <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-4">
                            <p className="m-0 text-xs uppercase tracking-widest text-[#8a9891]">Device Signature Present</p>
                            <p className="m-0 text-sm text-[#f3f6f4]">{details.hasDeviceSignature ? "Yes" : "No"}</p>
                        </div>

                        <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-4 md:col-span-2">
                            <p className="m-0 text-xs uppercase tracking-widest text-[#8a9891]">Scan Nonce</p>
                            <p className="m-0 break-all font-mono text-sm text-[#f3f6f4]">{scanNonce}</p>
                            <p className="m-0 mt-2 text-sm text-[#aebbb5]">
                                Pre-check: {checkpointState.checkedUsed ? "Nonce already seen (possible replay)." : "Nonce not seen yet."}
                            </p>
                            {details.signatureProvided && (
                                <p className="m-0 mt-1 text-sm text-[#aebbb5]">
                                    QR signature challenge: {details.signatureMatches ? "matched provenance signer" : "did not match provenance signer"}
                                </p>
                            )}
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                                <button
                                    type="button"
                                    onClick={onCheckpointNonce}
                                    disabled={checkpointLoading}
                                    className="rounded-lg border border-[#1f4a38] px-3 py-2 text-sm font-semibold text-[#34d399] hover:bg-[#131917] disabled:opacity-60"
                                >
                                    {checkpointLoading ? "Checkpointing..." : "Checkpoint This Scan On-Chain"}
                                </button>
                                {checkpointState.checkpointed && (
                                    <span className="text-sm text-[#f3f6f4]">
                                        Result: {checkpointState.replayed ? "Replay detected" : "Fresh scan recorded"}
                                    </span>
                                )}
                                {checkpointState.txUrl && (
                                    <a href={checkpointState.txUrl} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[#34d399] no-underline">
                                        View checkpoint tx
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                <div>
                    <Link href="/verify" className="text-sm font-semibold text-[#34d399] no-underline hover:text-[#4ade80]">
                        Back to scan and manual verify
                    </Link>
                </div>
            </div>
        </main>
    );
}
