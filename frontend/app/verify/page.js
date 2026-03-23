"use client";

import { useState } from "react";
import TerritorScore from "../../components/TerritorScore";
import { verifyProduct } from "../../src/utils/contract";

export default function VerifyPage() {
  const [hash, setHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState(null);

  async function onVerify(event) {
    event.preventDefault();
    setLoading(true);
    setStatus("Reading on-chain verification...");

    try {
      const data = await verifyProduct(hash.trim());
      setResult(data);
      setStatus("Verification complete.");
    } catch (error) {
      setResult(null);
      setStatus(error?.shortMessage || error?.message || "Verification failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Verify Product</h1>
      <p style={{ margin: 0, color: "#466" }}>Enter a product hash (bytes32) to fetch provenance and terroir trust.</p>

      <form onSubmit={onVerify} style={formStyle}>
        <input
          required
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          placeholder="0x..."
          style={inputStyle}
        />
        <button disabled={loading} type="submit" style={buttonStyle}>
          {loading ? "Verifying..." : "Verify Product"}
        </button>
      </form>

      {status && <p style={{ margin: 0, color: "#355" }}>{status}</p>}

      {result && (
        <div style={{ display: "grid", gap: 12, maxWidth: 680 }}>
          <TerritorScore score={result.terroir} />
          <div style={{ background: "#fff", border: "1px solid #d9ebe4", borderRadius: 12, padding: 14 }}>
            <h3 style={{ marginTop: 0 }}>Record</h3>
            <p style={textStyle}>Product Name: {result.record.productName}</p>
            <p style={textStyle}>GI Tag: {result.record.giTag}</p>
            <p style={textStyle}>IPFS CID: {result.record.ipfsCid}</p>
            <p style={textStyle}>Artisan: {result.record.artisan}</p>
            <p style={textStyle}>Transfer Count: {String(result.record.transferCount)}</p>
          </div>
        </div>
      )}
    </section>
  );
}

const formStyle = {
  display: "grid",
  gap: 10,
  maxWidth: 680,
  background: "#fff",
  border: "1px solid #d9ebe4",
  borderRadius: 12,
  padding: 14
};

const inputStyle = {
  border: "1px solid #cfe2db",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14
};

const buttonStyle = {
  background: "#1D9E75",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
  width: "fit-content"
};

const textStyle = { margin: "4px 0", color: "#355" };
