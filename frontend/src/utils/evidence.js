const STORAGE_KEY = "pramaan_demo_evidence_v1";

function nowIso() {
  return new Date().toISOString();
}

export function loadEvidence() {
  if (typeof window === "undefined") {
    return { network: "sepolia", generatedAt: nowIso(), entries: [] };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { network: "sepolia", generatedAt: nowIso(), entries: [] };
    }
    const parsed = JSON.parse(raw);
    return {
      network: parsed.network || "sepolia",
      generatedAt: parsed.generatedAt || nowIso(),
      entries: Array.isArray(parsed.entries) ? parsed.entries : []
    };
  } catch (_error) {
    return { network: "sepolia", generatedAt: nowIso(), entries: [] };
  }
}

export function appendEvidenceEntry(entry) {
  if (typeof window === "undefined") {
    return;
  }

  const state = loadEvidence();
  state.generatedAt = nowIso();
  state.entries.unshift({
    id: String(Date.now()) + "-" + Math.random().toString(16).slice(2, 8),
    timestamp: nowIso(),
    ...entry
  });

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearEvidence() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(STORAGE_KEY);
}

export function toMarkdown(evidence) {
  const lines = [];
  lines.push("# Pramaan Demo Evidence");
  lines.push("");
  lines.push("- Network: " + (evidence.network || "sepolia"));
  lines.push("- Generated: " + (evidence.generatedAt || nowIso()));
  lines.push("");
  lines.push("## Transactions");
  lines.push("");

  if (!Array.isArray(evidence.entries) || evidence.entries.length === 0) {
    lines.push("No entries recorded yet.");
    return lines.join("\n");
  }

  for (const item of evidence.entries) {
    lines.push("### " + (item.action || "Action"));
    lines.push("");
    lines.push("- Time: " + (item.timestamp || ""));
    lines.push("- Product Hash: " + (item.productHash || "-"));
    lines.push("- Tx: " + (item.txUrl || "-"));
    lines.push("- Notes: " + (item.notes || "-"));
    lines.push("");
  }

  return lines.join("\n");
}
