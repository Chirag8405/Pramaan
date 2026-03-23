import Link from "next/link";
import Providers from "./providers";
import "./globals.css";

export const metadata = {
  title: "Pramaan",
  description: "Sovereign Traceability for Indian Craft"
};

const navItems = [
  { href: "/artisan", label: "Artisan" },
  { href: "/register-product", label: "Register Product" },
  { href: "/retailer-verify", label: "Retailer Verify" },
  { href: "/verify", label: "Verify" },
  { href: "/transfer", label: "Transfer" }
];

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="m-0 antialiased">
        <header className="sticky top-0 z-30 border-b border-[#dcebe5] bg-white/95 backdrop-blur">
          <nav className="mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-3 px-4 py-3 md:grid-cols-[1fr_auto] md:gap-6 md:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/" className="shrink-0 text-3xl font-extrabold leading-none tracking-tight text-[#1D9E75] no-underline">
                Pramaan
              </Link>
              <span className="truncate text-sm text-[#49665e]">Sovereign Traceability for Indian Craft</span>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 md:justify-end md:pb-0">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-[#cddfd8] bg-white px-5 py-2 text-sm font-semibold text-[#1f5b4b] no-underline transition hover:bg-[#f6fbf9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </header>
        <Providers>
          <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
