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

function parseEnvValue(envText, key) {
    const lines = String(envText || "").split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }
        if (!trimmed.startsWith(key + "=")) {
            continue;
        }
        const value = trimmed.slice((key + "=").length).trim();
        const hashIndex = value.indexOf("#");
        const cleanValue = hashIndex >= 0 ? value.slice(0, hashIndex).trim() : value;
        return cleanValue.replace(/^['\"]|['\"]$/g, "").trim();
    }
    return "";
}

export async function GET() {
    let productHash = String(process.env.NEXT_PUBLIC_DEMO_PRODUCT_HASH || "").trim();
    let signer = "";
    let source = "env";
    let localPrivateKey = "";

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

    try {
        const blockchainEnvFile = path.join(process.cwd(), "..", "blockchain", ".env");
        const envRaw = await fs.readFile(blockchainEnvFile, "utf8");
        localPrivateKey = parseEnvValue(envRaw, "PRIVATE_KEY");
    } catch (_error) {
        // Ignore if blockchain .env does not exist.
    }

    const secret = sanitizeSecret(
        process.env.DEMO_SCAN_SECRET ||
        process.env.NEXT_PUBLIC_DEMO_SCAN_SECRET ||
        process.env.PRIVATE_KEY ||
        localPrivateKey ||
        ""
    );

    return NextResponse.json({
        productHash,
        signer,
        secret,
        hasSecret: Boolean(secret),
        source
    });
}
