"use client";

import { useState } from "react";
import { connectWallet, registerArtisan } from "../../src/utils/contract";

export default function ArtisanPage() {
  const [form, setForm] = useState({
    name: "",
    craft: "",
    giRegion: "",
    craftScore: 60
  });
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function onConnect() {
    try {
      const result = await connectWallet();
      setWallet(result.address);
      setMessage("Wallet connected.");
    } catch (error) {
      setMessage(error?.message || "Failed to connect wallet.");
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("Submitting artisan registration...");

    try {
      const receipt = await registerArtisan(
        form.name.trim(),
        form.craft.trim(),
        form.giRegion.trim(),
        Number(form.craftScore)
      );
      setMessage("Artisan registered. Tx hash: " + receipt.transactionHash);
    } catch (error) {
      setMessage(error?.shortMessage || error?.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Register as Artisan</h1>
      <p style={{ margin: 0, color: "#466" }}>Only submissions with craft score 60+ pass the on-chain gate.</p>

      <button onClick={onConnect} style={buttonStyle}>
        {wallet ? "Connected: " + wallet.slice(0, 8) + "..." : "Connect Wallet"}
      </button>

      <form onSubmit={onSubmit} style={formStyle}>
        <input
          required
          placeholder="Artisan name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={inputStyle}
        />
        <input
          required
          placeholder="Craft (e.g. Banarasi Silk)"
          value={form.craft}
          onChange={(e) => setForm({ ...form, craft: e.target.value })}
          style={inputStyle}
        />
        <input
          required
          placeholder="GI Region"
          value={form.giRegion}
          onChange={(e) => setForm({ ...form, giRegion: e.target.value })}
          style={inputStyle}
        />
        <input
          required
          type="number"
          min={0}
          max={100}
          placeholder="Craft Score"
          value={form.craftScore}
          onChange={(e) => setForm({ ...form, craftScore: e.target.value })}
          style={inputStyle}
        />

        <button disabled={loading} type="submit" style={buttonStyle}>
          {loading ? "Submitting..." : "Register Artisan"}
        </button>
      </form>

      {message && <p style={{ margin: 0, color: "#355" }}>{message}</p>}
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
