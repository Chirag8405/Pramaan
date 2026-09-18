import Link from "next/link";
import { ArrowRight, BadgeCheck, Fingerprint, Landmark, Leaf, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

const features = [
    {
        icon: Fingerprint,
        title: "Privacy-first Artisan Identity",
        description:
            "Anon Aadhaar verification confirms authenticity without exposing sensitive personal details to the platform."
    },
    {
        icon: Sparkles,
        title: "AI Proof of Craft",
        description:
            "Image intelligence scores workshop evidence and helps block low-confidence submissions before minting."
    },
    {
        icon: Landmark,
        title: "Dynamic Royalty Engine",
        description:
            "Quadratic royalty taper sustains artisan upside while preserving margin for secondary market growth."
    },
    {
        icon: ShieldCheck,
        title: "Trustable Provenance",
        description:
            "Every product journey remains queryable through a transparent trail from origin artisan to latest owner."
    }
];

const steps = [
    {
        number: "Step 1",
        title: "Identity and Trust Setup",
        description: "Register artisan profile and complete Anon Aadhaar verification."
    },
    {
        number: "Step 2",
        title: "Register Product Twin",
        description: "Upload product proof, pin assets to IPFS, and anchor product metadata."
    },
    {
        number: "Step 3",
        title: "Transfer and Royalty",
        description: "Simulate and execute secondary sale settlement with dynamic payout logic."
    },
    {
        number: "Step 4",
        title: "Public Provenance Check",
        description: "Anyone can verify product history and trust status from the explorer."
    }
];

const whyPramaan = [
    {
        icon: Leaf,
        iconColor: "#fbbf24",
        title: "Preserve Craft Heritage",
        description: "Give traditional artisans a digital trust layer without forcing them to share more data than needed."
    },
    {
        icon: BadgeCheck,
        iconColor: "#34d399",
        title: "Reduce Supply Chain Fraud",
        description: "Make origin and handling auditable, so buyers and retailers can verify product authenticity confidently."
    },
    {
        icon: ShieldCheck,
        iconColor: "#60a5fa",
        title: "Reward Honest Networks",
        description: "Incentivize verified behavior with dynamic payouts and slash trust for fraudulent endorsements."
    }
];

export default function HomePage() {
    return (
        <section className="grid gap-8">
            <Card className="overflow-hidden border-[#1f4a38] bg-linear-to-br from-[#10201a] via-[#0f1613] to-[#0b0f0e]">
                <CardHeader className="gap-4">
                    <Badge variant="warm" className="w-fit">
                        Pramaan - Sovereign Traceability System
                    </Badge>
                    <CardTitle
                        as="h1"
                        className="font-[family-name:var(--font-display)] text-3xl leading-tight tracking-tight md:text-5xl"
                    >
                        Build Trust for Every Handmade Product
                    </CardTitle>
                    <CardDescription className="max-w-3xl text-base md:text-lg">
                        Pramaan helps artisans prove origin, certify craft integrity, and receive fair long-term royalties through
                        privacy-preserving identity and on-chain provenance.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                    <Link href="/artisan">
                        <Button size="lg" className="gap-2">
                            Get Started
                            <ArrowRight size={16} />
                        </Button>
                    </Link>
                    <Link href="#core-features">
                        <Button size="lg" variant="secondary" type="button">
                            Explore Core Features
                        </Button>
                    </Link>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Why Pramaan</CardTitle>
                    <CardDescription>
                        Because trust in handcrafted products should be cryptographically verifiable, economically fair, and easy
                        for everyday users to understand.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                    {whyPramaan.map((item) => {
                        const Icon = item.icon;
                        return (
                            <div key={item.title} className="rounded-xl border border-[#26312b] bg-[#1a211e] p-4">
                                <div className="mb-2 flex items-center gap-2 font-semibold text-[#f3f6f4]">
                                    <Icon size={16} color={item.iconColor} />
                                    {item.title}
                                </div>
                                <p className="text-sm text-[#aebbb5]">{item.description}</p>
                            </div>
                        );
                    })}
                </CardContent>
            </Card>

            <section id="core-features" className="grid gap-4">
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[#f3f6f4]">
                    Core Features
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {features.map((feature) => {
                        const Icon = feature.icon;
                        return (
                            <Card key={feature.title}>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-xl">
                                        <Icon size={18} color="#34d399" />
                                        {feature.title}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-[#aebbb5]">{feature.description}</p>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </section>

            <section className="grid gap-4">
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-[#f3f6f4]">
                    Get Started Step-by-Step
                </h2>
                <p className="text-sm text-[#aebbb5]">Follow this guided journey across Artisan, Product, Transfer, and Verify pages.</p>
                <div className="grid gap-3">
                    {steps.map((step) => (
                        <Card key={step.number}>
                            <CardContent className="pt-6">
                                <div className="flex items-start gap-4">
                                    <div className="mt-0.5 rounded-full border border-[#1f4a38] bg-[#0f2e22] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#4ade80]">
                                        {step.number}
                                    </div>
                                    <div className="grid gap-1">
                                        <div className="text-lg font-semibold text-[#f3f6f4]">{step.title}</div>
                                        <div className="text-sm text-[#aebbb5]">{step.description}</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </section>
        </section>
    );
}
