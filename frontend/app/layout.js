import { Inter, Space_Grotesk } from "next/font/google";
import Providers from "./providers";
import SiteHeader from "../components/SiteHeader";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap"
});

export const metadata = {
  title: "Pramaan",
  description: "Sovereign Traceability for Indian Craft"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable + " " + spaceGrotesk.variable}>
      <body className="m-0 antialiased">
        <SiteHeader />
        <Providers>
          <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6 md:py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
