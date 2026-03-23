import Link from "next/link";

const checklistItems = [
  { label: "Artisan Flow", href: "/artisan" },
  { label: "Register Product", href: "/register-product" },
  { label: "Transfer", href: "/transfer" },
  { label: "Verify", href: "/verify" },
  { label: "Attack Demo", href: "/verify" },
  { label: "Live Monitor", href: "/monitor" },
  { label: "Evidence", href: "/evidence" }
];

export default function ChecklistPage() {
  return (
    <section style={{ display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Quick Demo Checklist</h1>
      <p style={{ margin: 0, color: "#466" }}>
        Open each flow directly while presenting to judges.
      </p>

      <div style={{ display: "grid", gap: 10, maxWidth: 760 }}>
        {checklistItems.map((item, index) => (
          <div key={item.href} style={cardStyle}>
            <div style={{ color: "#355", fontWeight: 700 }}>{index + 1}. {item.label}</div>
            <Link href={item.href} style={linkStyle}>{item.href}</Link>
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

const linkStyle = {
  color: "#176f52",
  fontWeight: 700,
  textDecoration: "none"
};
