"use client";

import { useEffect, useState } from "react";
import { clearEvidence, loadEvidence, toMarkdown } from "../../src/utils/evidence";

export default function EvidencePage() {
  const [evidence, setEvidence] = useState({ network: "sepolia", generatedAt: "", entries: [] });
  const [status, setStatus] = useState("");

  function refresh() {
    setEvidence(loadEvidence());
  }

  useEffect(() => {
    refresh();
  }, []);

  async function copyMarkdown() {
    const markdown = toMarkdown(evidence);
    try {
      await navigator.clipboard.writeText(markdown);
      setStatus("Evidence markdown copied.");
    } catch (_error) {
      setStatus("Could not copy markdown.");
    }
  }

  function onClear() {
    clearEvidence();
    refresh();
    setStatus("Evidence cleared.");
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Demo Evidence</h1>
      <p style={{ margin: 0, color: "#466" }}>
        Judge-ready transaction proof captured from artisan/register/transfer/nonce-checkpoint/verify flows.
      </p>
      <p style={{ margin: 0, color: "#355" }}>Network: {evidence.network}</p>
      <p style={{ margin: 0, color: "#355" }}>Generated: {evidence.generatedAt || "-"}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={refresh} style={buttonStyle}>Refresh</button>
        <button type="button" onClick={copyMarkdown} style={buttonStyle}>Copy Markdown</button>
        <button type="button" onClick={onClear} style={buttonDanger}>Clear</button>
      </div>

      {status && <p style={{ margin: 0, color: "#355" }}>{status}</p>}

      <div style={{ display: "grid", gap: 10 }}>
        {evidence.entries.length === 0 && <div style={cardStyle}>No evidence entries yet.</div>}

        {evidence.entries.map((item) => (
          <div key={item.id} style={cardStyle}>
            <strong style={{ color: "#1f6d50" }}>{item.action}</strong>
            <div style={{ color: "#577" }}>{item.timestamp}</div>
            <div style={monoText}>Product Hash: {item.productHash || "-"}</div>
            <div>
              Tx: {item.txUrl ? <a href={item.txUrl} target="_blank" rel="noreferrer" style={linkStyle}>{item.txUrl}</a> : "-"}
            </div>
            <div style={{ color: "#355" }}>Notes: {item.notes || "-"}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const cardStyle = {
  background: "#fff",
  border: "1px solid #d9ebe4",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 6
};

const monoText = {
  color: "#355",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  wordBreak: "break-all"
};

const buttonStyle = {
  background: "#1D9E75",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer"
};

const buttonDanger = {
  background: "#a23b3b",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer"
};

const linkStyle = {
  color: "#176f52",
  fontWeight: 700,
  textDecoration: "none"
};
