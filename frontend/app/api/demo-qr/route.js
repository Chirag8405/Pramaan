import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function sanitizeSecret(value) {
    const raw = String(value || "").trim();
    const text = raw.replace(/^['\"]|['\"]$/g, "").trim();
    if (!text) {
        return "";
    }
    return text.startsWith("0x") ? text : "0x" + text;
}

export async function GET() {
    let productHash = String(process.env.NEXT_PUBLIC_DEMO_PRODUCT_HASH || "").trim();
    let signer = "";
    let source = "env";

    try {
        const demoFile = path.join(process.cwd(), "..", "blockchain", "demo-tx.sepolia.json");
        const raw = await fs.readFile(demoFile, "utf8");
        const parsed = JSON.parse(raw);

        if (parsed?.productHash) {
            productHash = String(parsed.productHash).trim();
            source = "blockchain/demo-tx.sepolia.json";
        }

        if (parsed?.signer) {
            signer = String(parsed.signer).trim();
        }
    } catch (_error) {
        // Ignore missing demo file and fallback to environment variables.
    }

    const secret = sanitizeSecret(
        process.env.DEMO_SCAN_SECRET ||
        process.env.NEXT_PUBLIC_DEMO_SCAN_SECRET ||
        ""
    );

    if (!secret) {
        return NextResponse.json(
            { error: "demo scan secret not configured" },
            { status: 500 }
        );
    }

    return NextResponse.json({
        productHash,
        signer,
        secret,
        hasSecret: Boolean(secret),
        source
    });
}
