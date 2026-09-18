"use client";

import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
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
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[#f3f6f4]">
          Demo Evidence
        </h1>
        <p className="m-0 text-[#aebbb5]">
          Judge-ready transaction proof captured from artisan/register/transfer/nonce-checkpoint/verify flows.
        </p>
        <p className="m-0 text-[#aebbb5]">Network: {evidence.network}</p>
        <p className="m-0 text-[#aebbb5]">Generated: {evidence.generatedAt || "-"}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button suppressHydrationWarning type="button" onClick={refresh}>Refresh</Button>
        <Button suppressHydrationWarning type="button" onClick={copyMarkdown} variant="secondary">Copy Markdown</Button>
        <Button suppressHydrationWarning type="button" onClick={onClear} variant="destructive">
          Clear
        </Button>
      </div>

      {status && <p className="m-0 text-[#aebbb5]">{status}</p>}

      <div className="grid gap-3">
        {evidence.entries.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-[#aebbb5]">No evidence entries yet.</CardContent>
          </Card>
        )}

        {evidence.entries.map((item) => (
          <Card key={item.id}>
            <CardContent className="grid gap-1.5 pt-6">
              <strong className="text-[#4ade80]">{item.action}</strong>
              <div className="text-[#8a9891]">{item.timestamp}</div>
              <div className="break-all font-mono text-sm text-[#aebbb5]">Product Hash: {item.productHash || "-"}</div>
              <div className="text-[#aebbb5]">
                Tx:{" "}
                {item.txUrl ? (
                  <a
                    href={item.txUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-[#34d399] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#34d399] rounded"
                  >
                    {item.txUrl}
                  </a>
                ) : (
                  "-"
                )}
              </div>
              <div className="text-[#aebbb5]">Notes: {item.notes || "-"}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
