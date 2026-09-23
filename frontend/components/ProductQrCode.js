"use client";

import { QRCodeSVG } from "qrcode.react";
import { buildVerifyUrl } from "../src/utils/url";

export default function ProductQrCode({ productHash, size = 180 }) {
  const verifyUrl = buildVerifyUrl(productHash);

  return (
    <div className="grid gap-2 rounded-xl border border-[#26312b] bg-[#131917] p-3" style={{ width: "fit-content" }}>
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">
        Scan to Verify (Retailer QR)
      </p>
      <div className="rounded-lg bg-white p-3" style={{ width: "fit-content" }}>
        <QRCodeSVG value={verifyUrl} size={size} />
      </div>
      <p className="m-0 max-w-[220px] break-all font-mono text-[10px] text-[#8a9891]">
        {verifyUrl}
      </p>
    </div>
  );
}
