"use client";

import { Info } from "lucide-react";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";

const TERROIR_EXPLANATION =
  "On-chain trust score for this specific product. It starts from the AI photo-authenticity check at registration, then adjusts as the product changes hands — dropping if an unverified handler joins the chain or if custody moves suspiciously fast.";

function getScoreMeta(rawScore) {
  const score = Math.max(0, Math.min(100, Number(rawScore) || 0));

  if (score >= 80) {
    return {
      score,
      status: "Authentic",
      color: "#4ade80",
      bg: "#0f2e22"
    };
  }

  if (score >= 50) {
    return {
      score,
      status: "Caution",
      color: "#fbbf24",
      bg: "#332408"
    };
  }

  return {
    score,
    status: "Compromised",
    color: "#f87171",
    bg: "#3a1414"
  };
}

export default function TerritorScore({ score }) {
  const meta = getScoreMeta(score);

  return (
    <Card>
      <CardContent className="grid gap-4 p-4">
        <div className="flex items-center gap-3">
          <div
            style={{
              width: 74,
              height: 74,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: meta.bg,
              color: meta.color,
              border: "2px solid " + meta.color,
              fontWeight: 800,
              fontSize: 22
            }}
          >
            {meta.score}
          </div>
          <div className="grid gap-1">
            <div className="flex items-center gap-1.5 text-sm text-[#aebbb5]">
              Terroir Score
              <Info
                size={13}
                className="cursor-help text-[#8a9891]"
                aria-label={TERROIR_EXPLANATION}
                title={TERROIR_EXPLANATION}
              />
            </div>
            <div className="text-[1.2rem] font-bold" style={{ color: meta.color }}>{meta.status}</div>
            <Badge variant="neutral" className="w-fit">Live Integrity Signal</Badge>
          </div>
        </div>

        <p className="m-0 text-xs text-[#8a9891]">{TERROIR_EXPLANATION}</p>

        <div>
          <div
            style={{
              width: "100%",
              height: 12,
              borderRadius: 999,
              background: "#1a211e",
              overflow: "hidden",
              border: "1px solid #26312b"
            }}
          >
            <div
              style={{
                width: meta.score + "%",
                height: "100%",
                background: meta.color,
                transition: "width 240ms ease"
              }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
