"use client";

import { useState } from "react";
import { connectWallet, transferProduct } from "../../src/utils/contract";

export default function TransferPage() {
  const [hash, setHash] = useState("");
  const [newOwnerAddress, setNewOwnerAddress] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function onTransfer(event) {
    event.preventDefault();
    setLoading(true);
    setStatus("Preparing transfer...");

    try {
      await connectWallet();
      const receipt = await transferProduct(hash.trim(), newOwnerAddress.trim());
      setStatus("Transfer successful. Tx hash: " + receipt.transactionHash);
    } catch (error) {
      setStatus(error?.shortMessage || error?.message || "Transfer failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Transfer Product Ownership</h1>
      <p style={{ margin: 0, color: "#466" }}>Transfers update handler trail and trigger quadratic royalty payout.</p>

      <form onSubmit={onTransfer} style={formStyle}>
        <input
          required
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          placeholder="Product hash (0x...)"
          style={inputStyle}
        />
        <input
          required
          value={newOwnerAddress}
          onChange={(e) => setNewOwnerAddress(e.target.value)}
          placeholder="New owner wallet address"
          style={inputStyle}
        />

        <button disabled={loading} type="submit" style={buttonStyle}>
          {loading ? "Transferring..." : "Transfer Product"}
        </button>
      </form>

      {status && <p style={{ margin: 0, color: "#355" }}>{status}</p>}
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
