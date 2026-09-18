"use client";

import QrRedirectScanner from "../../components/QrRedirectScanner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";

export default function RetailerVerifyPage() {
    return (
        <section className="grid gap-6">
            <div className="grid gap-2">
                <h1 className="m-0 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[#f3f6f4]">
                    Scan to Verify
                </h1>
                <p className="m-0 text-[#aebbb5]">
                    Point your camera at a product's QR code to check it against its provenance record instantly.
                </p>
            </div>

            <Card className="max-w-4xl border-[#26312b] bg-[#131917] text-[#f3f6f4]">
                <CardHeader className="pb-2">
                    <CardTitle className="text-[#f3f6f4]">Scan At Counter</CardTitle>
                    <CardDescription className="text-[#aebbb5]">
                        Open your camera and scan the product's QR code to see its verification result.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <QrRedirectScanner />
                </CardContent>
            </Card>
        </section>
    );
}
