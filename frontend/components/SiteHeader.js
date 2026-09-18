"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { connectWallet, getConnectedAddressIfAvailable } from "../src/utils/contract";

const navItems = [
    { href: "/artisan", label: "Artisan" },
    { href: "/register-product", label: "Register Product" },
    { href: "/retailer-verify", label: "Retailer Verify" },
    { href: "/verify", label: "Verify" },
    { href: "/transfer", label: "Transfer" }
];

const opsItems = [
    { href: "/monitor", label: "Monitor" },
    { href: "/checklist", label: "Checklist" },
    { href: "/evidence", label: "Evidence" }
];

function truncateAddress(address) {
    if (!address) {
        return "";
    }
    return address.slice(0, 6) + "..." + address.slice(-4);
}

function WalletStatus() {
    const [address, setAddress] = useState("");
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let mounted = true;

        // Passive only — must never prompt on mount. Every page that renders
        // this header would otherwise fire its own connection request the
        // instant it loads.
        const existing = getConnectedAddressIfAvailable();
        if (mounted && existing) {
            setAddress(existing);
        }

        if (typeof window !== "undefined" && window.ethereum?.on) {
            const onAccountsChanged = (accounts) => {
                const next = Array.isArray(accounts) && accounts[0] ? String(accounts[0]) : "";
                setAddress(next);
            };

            window.ethereum.on("accountsChanged", onAccountsChanged);

            return () => {
                mounted = false;
                try {
                    window.ethereum.removeListener("accountsChanged", onAccountsChanged);
                } catch (_error) {
                    // Ignore listener cleanup errors.
                }
            };
        }

        return () => {
            mounted = false;
        };
    }, []);

    async function onConnect() {
        if (connecting) {
            return;
        }

        setConnecting(true);
        setError("");
        try {
            const result = await connectWallet();
            setAddress(result.address);
        } catch (err) {
            const raw = String(err?.shortMessage || err?.message || "");
            const message = raw.toLowerCase().includes("already pending")
                ? "A wallet request is already open — check MetaMask."
                : raw || "Could not connect wallet.";
            setError(message);
        } finally {
            setConnecting(false);
        }
    }

    return (
        <div className="relative flex shrink-0 items-center gap-2">
            <Badge variant="neutral" className="hidden sm:inline-flex">
                Sepolia
            </Badge>
            {address ? (
                <span className="inline-flex items-center gap-2 rounded-lg border border-[#26312b] bg-[#131917] px-3 py-2 text-sm font-medium text-[#aebbb5]">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#34d399]" />
                    <span className="font-mono">{truncateAddress(address)}</span>
                </span>
            ) : (
                <Button type="button" size="default" onClick={onConnect} disabled={connecting}>
                    {connecting ? "Connecting..." : "Connect Wallet"}
                </Button>
            )}

            {error && (
                <div
                    role="alert"
                    className="absolute right-0 top-[calc(100%+8px)] z-40 flex w-72 items-start gap-2 rounded-lg border border-[#4a1f1f] bg-[#3a1414] p-3 text-sm text-[#f87171] shadow-lg"
                >
                    <span className="flex-1">{error}</span>
                    <button
                        type="button"
                        onClick={() => setError("")}
                        aria-label="Dismiss"
                        className="shrink-0 rounded text-[#f87171] hover:text-[#fca5a5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34d399] focus-visible:ring-offset-2 focus-visible:ring-offset-[#3a1414]"
                    >
                        ×
                    </button>
                </div>
            )}
        </div>
    );
}

export default function SiteHeader() {
    const pathname = usePathname();

    return (
        <header className="sticky top-0 z-30 border-b border-[#1c2622] bg-[#0b0f0e]/95 backdrop-blur">
            <div className="mx-auto w-full max-w-7xl px-4 md:px-6">
                <div className="flex flex-wrap items-center justify-between gap-4 py-4">
                    <div className="flex min-w-0 items-center gap-6">
                        <Link
                            href="/"
                            className="shrink-0 font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight text-[#34d399] no-underline"
                        >
                            Pramaan
                        </Link>
                        <nav className="flex items-center gap-1 overflow-x-auto">
                            {navItems.map((item) => {
                                const active = pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        aria-current={active ? "page" : undefined}
                                        className={
                                            "shrink-0 rounded-md border-b-2 px-3 py-2 text-sm font-medium no-underline transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34d399] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e] " +
                                            (active
                                                ? "border-[#34d399] bg-[#131917] text-[#f3f6f4]"
                                                : "border-transparent text-[#aebbb5] hover:bg-[#131917] hover:text-[#f3f6f4]")
                                        }
                                    >
                                        {item.label}
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>

                    <WalletStatus />
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[#1c2622] py-2 text-xs">
                    <span className="shrink-0 font-medium uppercase tracking-wide text-[#5d6b65]">Ops</span>
                    {opsItems.map((item, index) => (
                        <span key={item.href} className="flex items-center gap-x-3">
                            {index > 0 && <span className="text-[#3a4741]">/</span>}
                            <Link
                                href={item.href}
                                aria-current={pathname === item.href ? "page" : undefined}
                                className={
                                    "shrink-0 rounded no-underline transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34d399] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b0f0e] " +
                                    (pathname === item.href ? "text-[#aebbb5]" : "text-[#7c8b84] hover:text-[#aebbb5]")
                                }
                            >
                                {item.label}
                            </Link>
                        </span>
                    ))}
                </div>
            </div>
        </header>
    );
}
