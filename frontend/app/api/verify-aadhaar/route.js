import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { artifactUrls, deserialize, init, verify } from "@anon-aadhaar/core";
import { ARTISAN_ABI } from "../../../src/utils/abi";
import { ARTISAN_REGISTRY_ADDRESS, RPC_URL } from "../../../src/utils/constants";
import { ANON_AADHAAR_USE_TEST_MODE } from "../../../src/utils/aadhaarConfig";

export const runtime = "nodejs";

// Off-chain nullifier store: a flat JSON file under blockchain/, matching this repo's
// existing convention for deploy/demo state (deployed.json, demo-tx.sepolia.json).
// At this project's scale (a handful of artisans in a demo/course context, single
// server process) a plain JSON file with a simple in-process write lock is sufficient;
// this is NOT tamper-proof or auditable the way on-chain state is (documented tradeoff
// — see the design discussion this route came out of). Anyone with filesystem access to
// the server, or anyone able to call markAadhaarVerified directly as a granted verifier
// outside this route, bypasses this check entirely.
const NULLIFIER_STORE_PATH = path.join(process.cwd(), "..", "blockchain", "aadhaar-nullifiers.json");

// Anon Aadhaar's verify key is a small JSON file, not the multi-MB wasm/zkey (those are
// prover-only, not needed for verification). It is not bundled in either @anon-aadhaar
// package — verify() fetches it over the network from Anon Aadhaar's hosted S3 bucket on
// first use. That means this route has a real, if modest, external dependency: the first
// request after a cold start pays one extra network round-trip to fetch vkey.json. It is
// cached in-process after that (both by our own initPromise below and by whatever the SDK
// itself caches internally), so subsequent requests in the same server lifetime do not
// refetch it. If that S3 endpoint is ever unreachable, verification fails until it is —
// there is no bundled offline fallback in the SDK as of the installed version.
let initPromise = null;

async function ensureInitialized() {
    if (!initPromise) {
        initPromise = init({
            wasmURL: artifactUrls.v2.wasm,
            zkeyURL: artifactUrls.v2.chunked,
            vkeyURL: artifactUrls.v2.vk,
            artifactsOrigin: 0 // ArtifactsOrigin.server
        });
    }
    return initPromise;
}

async function readNullifierStore() {
    try {
        const raw = await fs.readFile(NULLIFIER_STORE_PATH, "utf8");
        return JSON.parse(raw);
    } catch (error) {
        if (error?.code === "ENOENT") {
            return {};
        }
        throw error;
    }
}

async function writeNullifierStore(store) {
    await fs.writeFile(NULLIFIER_STORE_PATH, JSON.stringify(store, null, 2) + "\n", "utf8");
}

// Serializes concurrent writes within this process so two near-simultaneous requests
// can't both read the same "not yet used" state and race to write it back.
let writeQueue = Promise.resolve();
function withStoreLock(fn) {
    const result = writeQueue.then(fn, fn);
    writeQueue = result.then(
        () => undefined,
        () => undefined
    );
    return result;
}

function normalizeAddress(value) {
    try {
        return ethers.utils.getAddress(String(value || "").trim());
    } catch (_error) {
        return null;
    }
}

export async function POST(req) {
    try {
        const body = await req.json();
        const serializedProof = body?.serializedProof;
        const walletAddress = normalizeAddress(body?.walletAddress);

        if (!serializedProof || typeof serializedProof.pcd !== "string") {
            return NextResponse.json({ error: "Missing or invalid serializedProof." }, { status: 400 });
        }
        if (!walletAddress) {
            return NextResponse.json({ error: "Missing or invalid walletAddress." }, { status: 400 });
        }

        await ensureInitialized();

        let pcd;
        try {
            pcd = await deserialize(serializedProof.pcd);
        } catch (_error) {
            return NextResponse.json({ error: "Could not deserialize the submitted proof." }, { status: 400 });
        }

        let isValid;
        try {
            isValid = await verify(pcd, ANON_AADHAAR_USE_TEST_MODE);
        } catch (error) {
            return NextResponse.json(
                { error: "Proof verification failed.", detail: error instanceof Error ? error.message : "Unknown error" },
                { status: 400 }
            );
        }

        if (!isValid) {
            return NextResponse.json({ error: "Proof did not pass verification." }, { status: 400 });
        }

        const nullifier = String(pcd?.proof?.nullifier || "").trim();
        if (!nullifier) {
            return NextResponse.json({ error: "Verified proof did not contain a nullifier." }, { status: 400 });
        }

        // One locked read decides all three outcomes: a different wallet already used
        // this nullifier (conflict), this same wallet already did (idempotent success,
        // no need to re-send a transaction), or neither (proceed to verify on-chain).
        const existingEntry = await withStoreLock(async () => {
            const store = await readNullifierStore();
            return store[nullifier] || null;
        });

        if (existingEntry && existingEntry.walletAddress !== walletAddress) {
            return NextResponse.json(
                {
                    error:
                        "This Aadhaar identity has already verified a different wallet. " +
                        "Each Aadhaar identity may verify only one wallet."
                },
                { status: 409 }
            );
        }

        if (existingEntry && existingEntry.walletAddress === walletAddress) {
            // Same wallet re-submitting an already-recorded nullifier: treat as
            // idempotent success rather than re-sending an on-chain transaction
            // (markAadhaarVerified itself is idempotent on-chain too — it just
            // re-sets the flag to true — but skipping the tx avoids burning gas
            // on a redundant call).
            return NextResponse.json({ verified: true, walletAddress, alreadyRecorded: true }, { status: 200 });
        }

        const backendSignerKey = process.env.AADHAAR_VERIFIER_SIGNER_PRIVATE_KEY;
        if (!backendSignerKey) {
            return NextResponse.json(
                { error: "Backend Aadhaar verifier signer is not configured." },
                { status: 503 }
            );
        }
        if (!ARTISAN_REGISTRY_ADDRESS) {
            return NextResponse.json({ error: "ArtisanRegistry address is not configured." }, { status: 503 });
        }

        const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
        const signer = new ethers.Wallet(backendSignerKey, provider);
        const artisanRegistry = new ethers.Contract(ARTISAN_REGISTRY_ADDRESS, ARTISAN_ABI, signer);

        let receipt;
        try {
            const tx = await artisanRegistry.markAadhaarVerified(walletAddress);
            receipt = await tx.wait();
        } catch (error) {
            const detail =
                error?.reason ||
                error?.error?.message ||
                error?.shortMessage ||
                error?.message ||
                "Unknown error";
            return NextResponse.json(
                { error: "On-chain verification call failed.", detail },
                { status: 502 }
            );
        }

        // Record the nullifier -> wallet mapping only AFTER the on-chain call succeeds,
        // so a failed transaction never burns the nullifier for a legitimate retry.
        await withStoreLock(async () => {
            const store = await readNullifierStore();
            store[nullifier] = {
                walletAddress,
                verifiedAt: new Date().toISOString(),
                txHash: receipt?.transactionHash || ""
            };
            await writeNullifierStore(store);
        });

        return NextResponse.json(
            { verified: true, walletAddress, txHash: receipt?.transactionHash || "" },
            { status: 200 }
        );
    } catch (error) {
        return NextResponse.json(
            { error: "Aadhaar verification failed.", detail: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
