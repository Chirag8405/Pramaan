import Link from "next/link";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";

const checklistItems = [
  { label: "Artisan Flow", href: "/artisan" },
  { label: "Register Product", href: "/register-product" },
  { label: "Transfer", href: "/transfer" },
  { label: "Retailer Verify", href: "/retailer-verify", note: "Register a product to get its QR, or view an existing product's QR after a completed transfer, then scan it on Retailer Verify." },
  { label: "Verify", href: "/verify", note: "Look up a product hash and see its trust trail." },
  {
    label: "Attack Demo: Nonce Replay",
    href: "/verify",
    note: "On the Verify page, checkpoint the same hash + scan nonce twice — the second checkpoint reports \"Replay detected,\" demonstrating the anti-replay protection."
  },
  { label: "Live Monitor", href: "/monitor" },
  { label: "Evidence", href: "/evidence" }
];

export default function ChecklistPage() {
  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[#f3f6f4]">
          Quick Demo Checklist
        </h1>
        <p className="m-0 text-[#aebbb5]">Open each flow directly while presenting to judges.</p>
      </div>

      <div className="grid max-w-2xl gap-3">
        {checklistItems.map((item, index) => (
          <Card key={item.href + index}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
              <div className="flex items-center gap-3">
                <Badge>{index + 1}</Badge>
                <div className="grid gap-0.5">
                  <span className="font-semibold text-[#f3f6f4]">{item.label}</span>
                  {item.note && <span className="text-xs text-[#8a9891]">{item.note}</span>}
                </div>
              </div>
              <Link
                href={item.href}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#35443c] bg-[#131917] px-4 py-2 text-sm font-semibold text-[#34d399] no-underline transition hover:bg-[#1a211e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34d399] focus-visible:ring-offset-2 focus-visible:ring-offset-[#131917]"
              >
                {item.href}
              </Link>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
