"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { connectWallet, getArtisan, getConnectedAddressIfAvailable, isVerifiedArtisan } from "../src/utils/contract";

const navGroups = [
    {
        label: "Makers",
        items: [
            { href: "/artisan", label: "Artisan" },
            { href: "/register-product", label: "Register Product" },
            { href: "/my-products", label: "My Products" }
        ]
    },
    {
        label: "Market",
        items: [
            { href: "/retailer-verify", label: "Retailer Verify" },
            { href: "/verify", label: "Verify" },
            { href: "/transfer", label: "Transfer" }
        ]
    },
    {
        label: "Activity",
        items: [
            { href: "/vouch", label: "Vouch" },
            { href: "/monitor", label: "Monitor" },
            { href: "/evidence", label: "Evidence" }
        ]
    }
];

// Single source of truth for "what wallet is connected right now," shared by
// the wallet pill and the Register Product readiness check below. Keeping
// this in one place (rather than each piece independently polling
// window.ethereum) means a connection made via the header's own button is
// reflected everywhere immediately, not just wherever an accountsChanged
// event happens to land first.
function useConnectedAddress() {
    const [address, setAddress] = useState("");

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

    return [address, setAddress];
}

// Whether `address` is already a verified, registered artisan — drives the
// soft "not ready yet" indicator on Register Product. Re-runs whenever the
// address itself changes, so it reacts immediately to a connect made via
// this header's own button, not only to a later accountsChanged event.
// null = not checked yet (no indicator), true/false once known.
function useArtisanReadiness(address) {
    const [ready, setReady] = useState(null);

    useEffect(() => {
        let active = true;

        if (!address) {
            setReady(false);
            return;
        }

        async function check() {
            try {
                const [artisanRecord, verified] = await Promise.all([
                    getArtisan(address),
                    isVerifiedArtisan(address)
                ]);

                if (!active) {
                    return;
                }

                const isRegistered = Number(artisanRecord?.registeredAt || 0) > 0;
                setReady(isRegistered && Boolean(verified));
            } catch (_error) {
                if (active) {
                    setReady(false);
                }
            }
        }

        void check();

        return () => {
            active = false;
        };
    }, [address]);

    return ready;
}

function truncateAddress(address) {
    if (!address) {
        return "";
    }
    return address.slice(0, 6) + "..." + address.slice(-4);
}

function WalletStatus({ address, setAddress }) {
    const [connecting, setConnecting] = useState(false);
    const [error, setError] = useState("");

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

function ScrollableNav({ pathname, artisanReady }) {
    const navRef = useRef(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    useEffect(() => {
        const el = navRef.current;
        if (!el) {
            return;
        }

        function updateFades() {
            setCanScrollLeft(el.scrollLeft > 4);
            setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
        }

        updateFades();
        el.addEventListener("scroll", updateFades, { passive: true });
        window.addEventListener("resize", updateFades);

        return () => {
            el.removeEventListener("scroll", updateFades);
            window.removeEventListener("resize", updateFades);
        };
    }, []);

    return (
        <div className="relative min-w-0">
            <nav ref={navRef} className="flex items-center gap-2 overflow-x-auto">
                {navGroups.map((group) => (
                    <div
                        key={group.label}
                        className="flex shrink-0 items-center gap-1 rounded-lg border border-[#1c2622] bg-[#0e1311] p-1"
                    >
                        {group.items.map((item) => {
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
                                    {item.href === "/register-product" && artisanReady === false && (
                                        <span
                                            className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-[#fbbf24] align-middle"
                                            title="Register as a verified artisan first"
                                        />
                                    )}
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>
            {canScrollLeft && (
                <div className="pointer-events-none absolute inset-y-0 left-0 flex w-8 items-center justify-start bg-gradient-to-r from-[#0b0f0e] to-transparent">
                    <ChevronLeft size={14} className="text-[#34d399]" />
                </div>
            )}
            {canScrollRight && (
                <div className="pointer-events-none absolute inset-y-0 right-0 flex w-8 items-center justify-end bg-gradient-to-l from-[#0b0f0e] to-transparent">
                    <ChevronRight size={14} className="text-[#34d399]" />
                </div>
            )}
        </div>
    );
}

export default function SiteHeader() {
    const pathname = usePathname();
    const [address, setAddress] = useConnectedAddress();
    const artisanReady = useArtisanReadiness(address);

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
                        <ScrollableNav pathname={pathname} artisanReady={artisanReady} />
                    </div>

                    <WalletStatus address={address} setAddress={setAddress} />
                </div>
            </div>
        </header>
    );
}
