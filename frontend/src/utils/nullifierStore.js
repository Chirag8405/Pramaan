import { Redis } from "@upstash/redis";

// Anti-replay ledger for Anon Aadhaar nullifiers: ties one Aadhaar identity to one wallet
// forever (app/api/verify-aadhaar/route.js is the only caller). This previously lived as a
// flat JSON file at blockchain/aadhaar-nullifiers.json with an in-process write lock, which
// does not work once the route runs as a Vercel serverless function -- that path sits outside
// the deployed project root, and serverless instances have no persistent or shared local
// filesystem (each cold start gets a fresh, largely read-only disk). Redis (Vercel KV or
// Upstash) gives every instance the same durable, atomically-updatable store instead.
//
// Accepts either naming convention so it works with either Vercel Marketplace integration:
// - KV_REST_API_URL / KV_REST_API_TOKEN (Vercel KV)
// - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (Upstash for Redis, connected directly)
const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = REST_URL && REST_TOKEN ? new Redis({ url: REST_URL, token: REST_TOKEN }) : null;

export function isNullifierStoreConfigured() {
    return redis !== null;
}

function keyFor(nullifier) {
    return `aadhaar:nullifier:${nullifier}`;
}

function parseEntry(raw) {
    if (!raw) {
        return null;
    }
    return typeof raw === "string" ? JSON.parse(raw) : raw;
}

// Atomically claims a nullifier for a wallet, or reports why it couldn't.
// Returns { kind: "claimed" | "already-confirmed" | "in-progress" | "conflict" }.
//
// The claim itself (`SET ... NX`) is atomic at the Redis level, so two concurrent requests
// for the same nullifier -- even landing on two different serverless instances -- cannot
// both win it. That's the guarantee the old in-process lock could only provide within a
// single warm instance.
export async function claimNullifier(nullifier, walletAddress) {
    const key = keyFor(nullifier);
    const pendingRecord = { walletAddress, status: "pending", timestamp: new Date().toISOString() };

    const created = await redis.set(key, JSON.stringify(pendingRecord), { nx: true });
    if (created) {
        return { kind: "claimed" };
    }

    const existingEntry = parseEntry(await redis.get(key));

    if (!existingEntry) {
        // The key existed for the NX check above but is gone now (e.g. a concurrent
        // release raced us) -- one retry is enough to resolve that window.
        const createdOnRetry = await redis.set(key, JSON.stringify(pendingRecord), { nx: true });
        return createdOnRetry ? { kind: "claimed" } : { kind: "conflict" };
    }

    if (existingEntry.walletAddress !== walletAddress) {
        return { kind: "conflict" };
    }
    if (existingEntry.status === "confirmed") {
        return { kind: "already-confirmed" };
    }
    if (existingEntry.status === "pending") {
        return { kind: "in-progress" };
    }

    // Defensive: same wallet, unrecognized status -- reclaim it.
    await redis.set(key, JSON.stringify(pendingRecord));
    return { kind: "claimed" };
}

// Releases a claim this same wallet holds in "pending" state, so a failed verification
// attempt (bad signer config, reverted tx, RPC failure) never leaves the nullifier stuck
// forever and blocks a legitimate retry.
export async function releaseNullifierClaim(nullifier, walletAddress) {
    const key = keyFor(nullifier);
    const entry = parseEntry(await redis.get(key));
    if (entry && entry.status === "pending" && entry.walletAddress === walletAddress) {
        await redis.del(key);
    }
}

// Transitions a claimed nullifier to "confirmed" -- only call this after the on-chain
// markAadhaarVerified call has actually succeeded.
export async function confirmNullifier(nullifier, walletAddress, txHash) {
    const key = keyFor(nullifier);
    await redis.set(
        key,
        JSON.stringify({
            walletAddress,
            status: "confirmed",
            verifiedAt: new Date().toISOString(),
            txHash: txHash || ""
        })
    );
}
