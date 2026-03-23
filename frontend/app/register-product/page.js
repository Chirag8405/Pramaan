"use client";

import { useState } from "react";
import { connectWallet, registerProduct } from "../../src/utils/contract";
import { uploadToIPFS } from "../../src/utils/ipfs";
import { hashProduct } from "../../src/utils/hash";

export default function RegisterProductPage() {
  const [form, setForm] = useState({
    name: "",
    giTag: "",
    lat: "",
    lng: ""
  });
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();

    if (!file) {
      setStatus("Please select a product file/image first.");
      return;
    }

    setLoading(true);

    try {
      await connectWallet();
      setStatus("Uploading file to IPFS...");
      const cid = await uploadToIPFS(file);

      setStatus("Hashing product file...");
      const productHash = await hashProduct(file);

      setStatus("Submitting on-chain registration...");
      const receipt = await registerProduct(
        productHash,
        cid,
        form.name.trim(),
        form.giTag.trim(),
        Number(form.lat),
        Number(form.lng)
      );

      setStatus("Product registered. Tx hash: " + receipt.transactionHash + " | CID: " + cid);
    } catch (error) {
      setStatus(error?.shortMessage || error?.message || "Product registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Register Product</h1>
      <p style={{ margin: 0, color: "#466" }}>Upload product proof, hash it, pin to IPFS, then register on-chain.</p>

      <form onSubmit={onSubmit} style={formStyle}>
        <input
          required
          placeholder="Product Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={inputStyle}
        />
        <input
          required
          placeholder="GI Tag"
          value={form.giTag}
          onChange={(e) => setForm({ ...form, giTag: e.target.value })}
          style={inputStyle}
        />
        <input
          required
          type="number"
          placeholder="Origin Latitude"
          value={form.lat}
          onChange={(e) => setForm({ ...form, lat: e.target.value })}
          style={inputStyle}
        />
        <input
          required
          type="number"
          placeholder="Origin Longitude"
          value={form.lng}
          onChange={(e) => setForm({ ...form, lng: e.target.value })}
          style={inputStyle}
        />
        <input type="file" required onChange={(e) => setFile(e.target.files?.[0] || null)} style={inputStyle} />

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Processing..." : "Register Product"}
        </button>
      </form>

      {status && <p style={{ margin: 0, color: "#355" }}>{status}</p>}
    </section>
  );
}

const formStyle = {
  display: "grid",
  gap: 10,
  maxWidth: 560,
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
