"use client";

import { AnonAadhaarProvider } from "@anon-aadhaar/react";

// Must agree with src/utils/aadhaarConfig.js's server-side flag (same default:
// test mode unless explicitly set to "false") -- both sides need to pick the
// same pubkey hash (test vs production UIDAI key), or a proof generated
// against one key silently fails verification against the other.
const USE_TEST_AADHAAR = process.env.NEXT_PUBLIC_ANON_AADHAAR_USE_TEST_MODE !== "false";

export default function Providers({ children }) {
    return <AnonAadhaarProvider _useTestAadhaar={USE_TEST_AADHAAR}>{children}</AnonAadhaarProvider>;
}
