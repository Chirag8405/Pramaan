// Server-only shared config for Anon Aadhaar test/production mode.
//
// NEXT_PUBLIC_ANON_AADHAAR_USE_TEST_MODE drives the client widget (app/providers.js),
// since it must be inlined into the browser bundle. ANON_AADHAAR_USE_TEST_MODE (no
// NEXT_PUBLIC_ prefix) drives the backend verifier (app/api/verify-aadhaar/route.js).
// Both control the SAME decision — which pubkeyHash (test vs production UIDAI key) a
// proof is checked against — so if they ever disagree, a proof generated against one
// key would silently fail (or worse, pass against the wrong assumption) when verified
// against the other. This module is imported only by server-side code (the API route),
// since NEXT_PUBLIC_ANON_AADHAAR_USE_TEST_MODE is not readable in a browser bundle
// unless it was inlined at build time for THIS module too — importing it from a
// "use client" file would read undefined here, which is why this check lives
// server-side, where both vars are actually readable.
//
// Both default to test mode (true) unless explicitly set to the string "false", so a
// missing/misconfigured env var fails toward the safe demo mode rather than toward
// unknowingly expecting production Aadhaar holders.

function resolveTestModeFlag(rawValue) {
    return rawValue !== "false";
}

const clientFlag = resolveTestModeFlag(process.env.NEXT_PUBLIC_ANON_AADHAAR_USE_TEST_MODE);
const serverFlag = resolveTestModeFlag(process.env.ANON_AADHAAR_USE_TEST_MODE);

if (clientFlag !== serverFlag) {
    throw new Error(
        "Anon Aadhaar test/production mode mismatch: " +
        `NEXT_PUBLIC_ANON_AADHAAR_USE_TEST_MODE resolves to ${clientFlag} but ` +
        `ANON_AADHAAR_USE_TEST_MODE resolves to ${serverFlag}. ` +
        "Both must be set to the same value (or both left unset) so the frontend proof " +
        "widget and the backend verifier agree on which pubkey hash to check against. " +
        "Fix frontend/.env.local before starting the server."
    );
}

export const ANON_AADHAAR_USE_TEST_MODE = serverFlag;
