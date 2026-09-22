import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { artifactUrls, deserialize, init, verify } from "@anon-aadhaar/core";
import { ARTISAN_ABI } from "../../../src/utils/abi";
import { ARTISAN_REGISTRY_ADDRESS, CHAIN_ID, RPC_URL } from "../../../src/utils/constants";
import { ANON_AADHAAR_USE_TEST_MODE } from "../../../src/utils/aadhaarConfig";
import { claimNullifier, confirmNullifier, isNullifierStoreConfigured, releaseNullifierClaim } from "../../../src/utils/nullifierStore";

export const runtime = "nodejs";

// Constructed once at module load, not per-request. Two reasons:
// 1. A plain JsonRpcProvider pays a network-detection handshake (eth_chainId) on first
//    use; under this route's bundled runtime that handshake was observed failing
//    outright ("could not detect network" / NETWORK_ERROR / noNetwork) even though the
//    RPC endpoint itself was reachable and healthy from a plain Node process at the same
//    moment. StaticJsonRpcProvider skips that handshake entirely by taking the network
//    (chainId) up front, since we already know it — this avoids the failure mode rather
//    than retrying a call we don't need to make.
// 2. Reusing one provider/signer/contract across requests means this setup cost (and any
//    connection warm-up) is paid once per server lifetime instead of on every call.
const provider = RPC_URL
    ? new ethers.providers.StaticJsonRpcProvider(RPC_URL, { chainId: CHAIN_ID, name: "sepolia" })
    : null;
const backendSignerKey = process.env.AADHAAR_VERIFIER_SIGNER_PRIVATE_KEY;
const signer = provider && backendSignerKey ? new ethers.Wallet(backendSignerKey, provider) : null;
const artisanRegistry =
    signer && ARTISAN_REGISTRY_ADDRESS ? new ethers.Contract(ARTISAN_REGISTRY_ADDRESS, ARTISAN_ABI, signer) : null;

// Every read this route does (signer authorization, signer balance, target artisan lookup,
// and the callStatic preflight below) is intentionally connected to `provider` directly,
// NOT to `signer`. A Wallet-connected contract's calls route through ethers'
// Signer.call() -> populateTransaction(), which behaves differently from a plain
// Provider's call() in ways that were repeatedly implicated this session: every local
// reproduction of this route's on-chain failures decoded cleanly using a
// Provider-connected contract (with an explicit `from` override where the caller's
// identity mattered), while the equivalent Signer-connected calls in this route's actual
// production runtime kept coming back as an undecoded, contentless CALL_EXCEPTION for at
// least three different underlying conditions -- strongly suggesting the Signer.call()
// path itself is unreliable in this specific serverless runtime, not the RPC endpoint or
// the on-chain state being queried. Reads never need signing capability anyway, so there's
// no downside to sidestepping that path entirely; only the real send below (which must
// actually sign) still needs the Signer-connected `artisanRegistry`.
//
// `aadhaarVerifier` is a public mapping on ArtisanRegistry, so Solidity auto-generates this
// getter -- it's just not part of the app-wide ARTISAN_ABI (which only lists the functions
// the rest of the frontend actually calls). Combined with ARTISAN_ABI here (rather than
// adding it to the shared ABI, since nothing else needs it) so one reader contract covers
// every read this route does.
const artisanRegistryReader =
    provider && ARTISAN_REGISTRY_ADDRESS
        ? new ethers.Contract(
              ARTISAN_REGISTRY_ADDRESS,
              [...ARTISAN_ABI, "function aadhaarVerifier(address) view returns (bool)"],
              provider
          )
        : null;

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// ethers reports a call that reverted with no decodable data (out-of-gas-style failure,
// or -- as observed repeatedly on this exact route in production -- a genuine transient
// hiccup somewhere between this serverless runtime and the RPC endpoint) using this exact
// generic wording, regardless of the real cause. A real, deterministic require() revert
// always comes back with the actual message text instead (confirmed repeatedly via local
// reproduction against this same contract/RPC).
function isUndecodedCallException(error) {
    return (
        error?.code === "CALL_EXCEPTION" &&
        /missing revert data/i.test(String(error?.reason || error?.message || ""))
    );
}

// Wraps a plain read-only call with a short retry-with-backoff. These reads have no
// legitimate reason to fail -- any failure observed here so far has been this same
// transient runtime hiccup, not a real on-chain condition (a real one just returns the
// requested data). Retrying resolves that far more reliably than surfacing it to the user
// as an opaque error for what the chain would have answered cleanly a moment later.
async function withRpcRetry(fn, label, attempts = 3, backoffsMs = [300, 900]) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            // Per-attempt, not just the final failure -- so if every attempt still fails
            // despite the retry, the log shows what actually happened each time instead of
            // only the last one.
            console.error(
                `[verify-aadhaar] ${label} attempt ${attempt + 1}/${attempts} failed:`,
                error?.code,
                error?.message
            );
            if (attempt < attempts - 1) {
                await delay(backoffsMs[attempt] ?? backoffsMs[backoffsMs.length - 1]);
            }
        }
    }
    throw lastError;
}

// Like withRpcRetry, but only retries the specific undecoded-exception case -- a real,
// decoded revert reason (e.g. a genuine "artisan flagged" from a race with the diagnostic
// checks above) is deterministic and would just fail identically on retry, so it's
// rethrown immediately instead of adding retry latency for no benefit.
async function withUndecodedCallRetry(fn, attempts = 3, backoffsMs = [300, 900]) {
    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            console.error(
                `[verify-aadhaar] callstatic-preflight attempt ${attempt + 1}/${attempts} failed:`,
                error?.code,
                error?.reason || error?.message
            );
            const retryable = attempt < attempts - 1 && (error?.code !== "CALL_EXCEPTION" || isUndecodedCallException(error));
            if (!retryable) {
                throw error;
            }
            await delay(backoffsMs[attempt] ?? backoffsMs[backoffsMs.length - 1]);
        }
    }
    throw lastError;
}

// Explicit EIP-1559 fee fields and gasLimit so ethers never has to call getFeeData()
// (eth_getBlockByNumber) or estimateGas (eth_estimateGas) to fill them in itself. Those
// calls were observed failing ("missing response" / SERVER_ERROR) specifically inside
// this route's runtime even though the RPC endpoint was otherwise healthy — supplying
// these directly means markAadhaarVerified only ever needs the small, cheap RPC calls
// (nonce fetch, send, receipt poll), not a full "latest" block fetch.
//
// No gas-parameter convention exists elsewhere in this codebase to match (frontend
// contract.js and the blockchain/scripts/* write calls all rely on default estimation),
// so these are fixed values calibrated once via a standalone script against live Sepolia
// data, not fetched per-request:
//   - measured baseFee ~0.96 gwei, ethers' own default maxFeePerGas ~3.4 gwei
//   - measured estimateGas for this exact call: 50,353
// maxFeePerGas is set well above the observed baseFee (headroom for spikes; this is
// testnet ETH, overpaying costs nothing) and gasLimit is ~2.4x the measured estimate.
const MARK_VERIFIED_GAS_OVERRIDES = {
    maxFeePerGas: ethers.utils.parseUnits("50", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits("2", "gwei"),
    gasLimit: 120000
};

// Two ways this call fails for reasons that have nothing to do with the specific request:
// the signer was never granted verifier status, or it doesn't hold enough Sepolia ETH to
// cover MARK_VERIFIED_GAS_OVERRIDES' worst case. Checking both directly (cheap reads, no
// gas) up front gives a clear, actionable message instead of leaning on ethers to decode
// an on-chain failure for these specific cases -- which is unreliable here: including
// explicit gas fields in a call (required to route around the estimateGas/getFeeData RPC
// fragility documented above) makes Alchemy run its own affordability check
// ("insufficient funds for gas * price + value") before the EVM ever runs, and ethers
// reports that as a bare, undecoded "missing revert data in call exception" rather than a
// normal decoded revert reason.
async function diagnosePermanentSignerIssue() {
    const [isAuthorized, balance] = await Promise.all([
        withRpcRetry(() => artisanRegistryReader.aadhaarVerifier(signer.address), "signer-authorization-check"),
        withRpcRetry(() => provider.getBalance(signer.address), "signer-balance-check")
    ]);

    const worstCaseCost = ethers.BigNumber.from(MARK_VERIFIED_GAS_OVERRIDES.gasLimit).mul(
        MARK_VERIFIED_GAS_OVERRIDES.maxFeePerGas
    );

    // Both checked and reported together (not one-then-the-other) so a completely fresh,
    // never-set-up signer wallet gets one complete fix list instead of discovering the
    // second problem only after fixing and redeploying for the first.
    const problems = [];
    if (!isAuthorized) {
        problems.push(
            `is not a granted Aadhaar verifier on ArtisanRegistry (run ` +
            "scripts/grant-aadhaar-verifier.js for this address)"
        );
    }
    if (balance.lt(worstCaseCost)) {
        problems.push(
            `has insufficient Sepolia ETH (has ${ethers.utils.formatEther(balance)} ETH, ` +
            `needs at least ${ethers.utils.formatEther(worstCaseCost)} ETH for gas -- fund this address)`
        );
    }

    if (problems.length === 0) {
        return null;
    }
    return `Backend signer ${signer.address} ${problems.join(" and ")}.`;
}

// Same reasoning as diagnosePermanentSignerIssue, but for the per-request target: this
// wallet must already be a registered artisan -- markAadhaarVerified requires
// artisans[artisan].registeredAt != 0, and reverts with "ArtisanRegistry: artisan not
// found" otherwise (a real, observed cause of failures here: a user can reach this route
// before ever calling registerArtisan). Checking directly, rather than relying on the
// callStatic preflight below to decode that revert, sidesteps an observed unreliability --
// the exact same revert decoded cleanly (via ethers' `reason` field) in a local
// reproduction against the same RPC endpoint and contract, but came back as an undecoded
// "missing revert data in call exception" when this route's own Wallet-connected
// callStatic hit it in production. Root cause not fully understood, but this direct read
// is unaffected by it either way.
async function diagnoseTargetArtisanIssue(walletAddress) {
    const profile = await withRpcRetry(() => artisanRegistryReader.getArtisan(walletAddress), "target-artisan-lookup");
    if (ethers.BigNumber.from(profile.registeredAt).isZero()) {
        return "This wallet is not registered as an artisan yet. Register as an artisan first, then verify Aadhaar.";
    }
    if (profile.isFraudulent) {
        return "This artisan identity has been flagged and cannot be Aadhaar-verified.";
    }
    return null;
}

// Preflight simulation (callStatic costs no gas, and omits gas fields so it doesn't hit
// the affordability-check ambiguity above) before ever sending a real transaction. A
// mined-but-reverted transaction only ever surfaces as ethers' generic "transaction
// failed" from tx.wait() -- it does not decode or attach the require() reason the way a
// pre-send callStatic does. Without this preflight, a PERMANENT failure (artisan not
// registered, artisan flagged fraudulent) would burn real Sepolia ETH on three doomed send
// attempts below and still end up reported as an opaque "transaction failed". A revert
// here means the real send would fail identically every time, so it's a fast-fail, not
// something to retry. Mirrors the eth_call preflight frontend/src/utils/contract.js's
// writeWithEstimatedGas already does for browser-wallet writes -- this route just never
// had the equivalent for its own server-side send.
//
// Anything that isn't a decoded revert (network hiccup, timeout) is inconclusive on its
// own, so it falls through to the real send, which has its own retry loop for genuine
// transient RPC hiccups on the actual send/wait calls.

// Tags a thrown error with which stage produced it, purely for the server-side log line
// below -- so any future failure is immediately attributable without another round trip
// of speculation (as this exact route has needed more than once).
function taggedError(error, stage) {
    const tagged = error instanceof Error ? error : new Error(String(error));
    tagged.stage = stage;
    return tagged;
}

async function markAadhaarVerifiedWithRetry(walletAddress, attempts = 3, backoffsMs = [500, 1500]) {
    let permanentIssue;
    let targetIssue;
    try {
        [permanentIssue, targetIssue] = await Promise.all([
            diagnosePermanentSignerIssue(),
            diagnoseTargetArtisanIssue(walletAddress)
        ]);
    } catch (error) {
        // A diagnostic read itself failing (after withRpcRetry already exhausted its own
        // retries) is distinct from either diagnostic cleanly returning a real problem
        // message below -- tag it so the log doesn't show "unknown" the way it did before
        // this retry/tagging existed for this specific path.
        throw taggedError(error, "diagnostics-read-failed");
    }
    if (permanentIssue) {
        throw taggedError(new Error(permanentIssue), "signer-diagnostics");
    }
    if (targetIssue) {
        throw taggedError(new Error(targetIssue), "target-diagnostics");
    }

    try {
        await withUndecodedCallRetry(() =>
            artisanRegistryReader.callStatic.markAadhaarVerified(walletAddress, { from: signer.address })
        );
    } catch (error) {
        if (error?.code === "CALL_EXCEPTION") {
            throw taggedError(error, "callstatic-preflight");
        }
    }

    let lastError;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
            const tx = await artisanRegistry.markAadhaarVerified(walletAddress, MARK_VERIFIED_GAS_OVERRIDES);
            return await tx.wait();
        } catch (error) {
            lastError = error;
            if (attempt < attempts - 1) {
                await delay(backoffsMs[attempt] ?? backoffsMs[backoffsMs.length - 1]);
            }
        }
    }
    throw taggedError(lastError, "send");
}

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

        if (!isNullifierStoreConfigured()) {
            return NextResponse.json({ error: "Aadhaar nullifier store is not configured." }, { status: 503 });
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

        // Claim-then-verify-then-confirm-or-release: the claim below is a single atomic
        // Redis operation (SET ... NX), so two concurrent requests for the same nullifier
        // — even landing on two different serverless instances — cannot both proceed.
        // Everything after this point (on-chain call) runs unlocked; only the claim itself
        // needs to be atomic.
        const claimOutcome = await claimNullifier(nullifier, walletAddress);

        if (claimOutcome.kind === "conflict") {
            return NextResponse.json(
                {
                    error:
                        "This Aadhaar identity has already verified a different wallet. " +
                        "Each Aadhaar identity may verify only one wallet."
                },
                { status: 409 }
            );
        }

        if (claimOutcome.kind === "already-confirmed") {
            // Same wallet re-submitting an already-confirmed nullifier: treat as
            // idempotent success rather than re-sending an on-chain transaction
            // (markAadhaarVerified itself is idempotent on-chain too — it just
            // re-sets the flag to true — but skipping the tx avoids burning gas
            // on a redundant call).
            return NextResponse.json({ verified: true, walletAddress, alreadyRecorded: true }, { status: 200 });
        }

        if (claimOutcome.kind === "in-progress") {
            return NextResponse.json(
                {
                    error:
                        "Verification for this Aadhaar identity and wallet is already in progress. " +
                        "Please try again shortly."
                },
                { status: 409 }
            );
        }

        // claimOutcome.kind === "claimed" — this request won the claim, proceed.
        // From here on, ANY early return must release the pending claim first (by
        // deleting the entry), so a failed attempt never leaves the nullifier stuck
        // in "pending" forever and blocks a legitimate retry.
        async function releaseClaim() {
            await releaseNullifierClaim(nullifier, walletAddress);
        }

        if (!provider) {
            await releaseClaim();
            return NextResponse.json({ error: "RPC endpoint is not configured." }, { status: 503 });
        }
        if (!backendSignerKey) {
            await releaseClaim();
            return NextResponse.json(
                { error: "Backend Aadhaar verifier signer is not configured." },
                { status: 503 }
            );
        }
        if (!ARTISAN_REGISTRY_ADDRESS) {
            await releaseClaim();
            return NextResponse.json({ error: "ArtisanRegistry address is not configured." }, { status: 503 });
        }

        let receipt;
        try {
            receipt = await markAadhaarVerifiedWithRetry(walletAddress);
        } catch (error) {
            await releaseClaim();
            const detail =
                error?.reason ||
                error?.error?.message ||
                error?.shortMessage ||
                error?.message ||
                "Unknown error";
            // The response body only reaches this route's own caller (the browser), not
            // Vercel's function logs -- log server-side too so an on-chain failure is
            // diagnosable via `vercel logs` without needing the client's response body.
            //
            // error.transactionHash is only ever set when a real transaction was actually
            // broadcast and mined (tx.wait() failure) -- it's absent for a callStatic/call
            // failure (including diagnosePermanentSignerIssue's own reads, and the no-gas
            // preflight simulation). That distinction is exactly what's needed to tell
            // apart "the preflight/diagnostic checks passed but the real send still
            // reverted on-chain for some other reason" from "one of those checks itself
            // failed in an unexpected way" -- both of which can otherwise surface as this
            // same undecoded ethers message.
            console.error(
                "[verify-aadhaar] on-chain call failed for",
                walletAddress,
                "- stage:",
                error?.stage || "unknown",
                "- detail:",
                detail,
                "- code:",
                error?.code,
                "- signer:",
                signer?.address,
                "- had a real mined transaction:",
                Boolean(error?.transactionHash),
                "- transactionHash:",
                error?.transactionHash
            );
            return NextResponse.json(
                { error: "On-chain verification call failed.", detail },
                { status: 502 }
            );
        }

        // Transition the existing "pending" entry to "confirmed" only AFTER the on-chain
        // call succeeds, so a failed transaction never leaves a confirmed nullifier behind.
        await confirmNullifier(nullifier, walletAddress, receipt?.transactionHash);

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
