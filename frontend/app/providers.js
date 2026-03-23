"use client";

import { AnonAadhaarProvider } from "@anon-aadhaar/react";

export default function Providers({ children }) {
    return <AnonAadhaarProvider _useTestAadhaar={true}>{children}</AnonAadhaarProvider>;
}
