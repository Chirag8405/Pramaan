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

export default function HomePage() {
    return (
        <section className="grid gap-8">
            <Card className="overflow-hidden border-[#d8cab5] bg-linear-to-br from-[#fff8ef] via-[#f7f2e9] to-[#eef6f2]">
                <CardHeader className="gap-4">
                    <Badge variant="warm" className="w-fit">
                        Pranaam - Sovereign Traceability System
                    </Badge>
                    <CardTitle className="text-3xl leading-tight md:text-5xl">
                        Build Trust for Every Handmade Product
                    </CardTitle>
                    <CardDescription className="max-w-3xl text-base md:text-lg">
                        Pranaam helps artisans prove origin, certify craft integrity, and receive fair long-term royalties through
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
                    <CardTitle>Why Pranaam</CardTitle>
                    <CardDescription>
                        Because trust in handcrafted products should be cryptographically verifiable, economically fair, and easy
                        for everyday users to understand.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-[#e2d3be] bg-[#fff7ee] p-4">
                        <div className="mb-2 flex items-center gap-2 font-semibold text-[#8b4d33]">
                            <Leaf size={16} />
                            Preserve Craft Heritage
                        </div>
                        <p className="text-sm text-slate-600">
                            Give traditional artisans a digital trust layer without forcing them to share more data than needed.
                        </p>
                    </div>
                    <div className="rounded-xl border border-[#d4e4dd] bg-[#f1f9f5] p-4">
                        <div className="mb-2 flex items-center gap-2 font-semibold text-[#205746]">
                            <BadgeCheck size={16} />
                            Reduce Supply Chain Fraud
                        </div>
                        <p className="text-sm text-slate-600">
                            Make origin and handling auditable, so buyers and retailers can verify product authenticity confidently.
                        </p>
                    </div>
                    <div className="rounded-xl border border-[#dae2e7] bg-[#f7fafc] p-4">
                        <div className="mb-2 flex items-center gap-2 font-semibold text-[#345061]">
                            <ShieldCheck size={16} />
                            Reward Honest Networks
                        </div>
                        <p className="text-sm text-slate-600">
                            Incentivize verified behavior with dynamic payouts and slash trust for fraudulent endorsements.
                        </p>
                    </div>
                </CardContent>
            </Card>

            <section id="core-features" className="grid gap-4">
                <h2 className="text-2xl font-bold text-[#20473d]">Core Features</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {features.map((feature) => {
                        const Icon = feature.icon;
                        return (
                            <Card key={feature.title}>
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2 text-xl">
                                        <Icon size={18} />
                                        {feature.title}
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <p className="text-sm text-slate-600">{feature.description}</p>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            </section>

            <section className="grid gap-4">
                <h2 className="text-2xl font-bold text-[#20473d]">Get Started Step-by-Step</h2>
                <p className="text-sm text-slate-600">Follow this guided journey across Artisan, Product, Transfer, and Verify pages.</p>
                <div className="grid gap-3">
                    {steps.map((step) => (
                        <Card key={step.number}>
                            <CardContent className="pt-6">
                                <div className="flex items-start gap-4">
                                    <div className="mt-0.5 rounded-full border border-[#c7ddd5] bg-[#edf7f3] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#2d5d50]">
                                        {step.number}
                                    </div>
                                    <div className="grid gap-1">
                                        <div className="text-lg font-semibold text-[#20473d]">{step.title}</div>
                                        <div className="text-sm text-slate-600">{step.description}</div>
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
