import Link from "next/link";

export const metadata = {
  title: "Pramaan",
  description: "Sovereign Traceability for Indian Craft"
};

const navItems = [
  { href: "/artisan", label: "Artisan" },
  { href: "/register-product", label: "Register Product" },
  { href: "/verify", label: "Verify" },
  { href: "/transfer", label: "Transfer" }
];

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Segoe UI, sans-serif", background: "#f6fbf9" }}>
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 20,
            background: "white",
            borderBottom: "1px solid #dcebe5"
          }}
        >
          <nav
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              padding: "14px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap"
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <Link href="/" style={{ textDecoration: "none", color: "#1D9E75", fontWeight: 800, fontSize: 24 }}>
                Pramaan
              </Link>
              <span style={{ color: "#466", fontSize: 13 }}>Sovereign Traceability for Indian Craft</span>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    textDecoration: "none",
                    color: "#184f43",
                    background: "#e8f5f1",
                    border: "1px solid #c8e7dd",
                    borderRadius: 999,
                    padding: "8px 14px",
                    fontSize: 14,
                    fontWeight: 600
                  }}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </header>
        <main style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 20px 40px" }}>{children}</main>
      </body>
    </html>
  );
}
