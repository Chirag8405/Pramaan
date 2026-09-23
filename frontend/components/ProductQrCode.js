"use client";

import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Button } from "./ui/button";
import { buildVerifyUrl } from "../src/utils/url";

export default function ProductQrCode({ productHash, size = 180 }) {
  const canvasWrapperRef = useRef(null);
  const verifyUrl = buildVerifyUrl(productHash);

  function handleDownload() {
    const canvas = canvasWrapperRef.current?.querySelector("canvas");
    if (!canvas) {
      return;
    }

    const link = document.createElement("a");
    link.download = "product-" + String(productHash || "").slice(0, 10) + "-qr.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="grid gap-2 rounded-xl border border-[#26312b] bg-[#131917] p-3" style={{ width: "fit-content" }}>
      <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">
        Scan to Verify (Retailer QR)
      </p>
      <div ref={canvasWrapperRef} className="rounded-lg bg-white p-3" style={{ width: "fit-content" }}>
        <QRCodeCanvas value={verifyUrl} size={size} level="M" />
      </div>
      <p className="m-0 max-w-[220px] break-all font-mono text-xs text-[#8a9891]">
        {verifyUrl}
      </p>
      <Button type="button" variant="secondary" className="w-fit" onClick={handleDownload}>
        Download QR
      </Button>
    </div>
  );
}
