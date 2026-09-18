"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "./ui/button";
import { getArtisan, getConnectedAddressIfAvailable, isVerifiedArtisan } from "../src/utils/contract";

export default function GetStartedButton() {
    const [href, setHref] = useState("/artisan");

    useEffect(() => {
        let active = true;

        async function resolveDestination() {
            // Passive only — never prompt a connection just from loading the
            // homepage. If nothing is already connected this stays "/artisan",
            // which is the correct first step for a fresh visitor anyway.
            const existing = getConnectedAddressIfAvailable();
            if (!existing) {
                return;
            }

            try {
                const [artisanRecord, verified] = await Promise.all([
                    getArtisan(existing),
                    isVerifiedArtisan(existing)
                ]);

                if (!active) {
                    return;
                }

                const isRegistered = Number(artisanRecord?.registeredAt || 0) > 0;
                if (isRegistered && Boolean(verified)) {
                    setHref("/register-product");
                }
            } catch (_error) {
                // Any read failure falls back to the safe default: /artisan.
            }
        }

        void resolveDestination();

        return () => {
            active = false;
        };
    }, []);

    return (
        <Link href={href}>
            <Button size="lg" className="gap-2">
                Get Started
                <ArrowRight size={16} />
            </Button>
        </Link>
    );
}
