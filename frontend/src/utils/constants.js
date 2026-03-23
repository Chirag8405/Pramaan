const PLACEHOLDER_ADDRESS = "PASTE_ADDRESS_HERE";
const PLACEHOLDER_RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY";

function normalizeEnv(value) {
    return typeof value === "string" ? value.trim() : "";
}

function envOrFallback(value, fallback) {
    const normalized = normalizeEnv(value);
    return normalized || fallback;
}

export const ARTISAN_REGISTRY_ADDRESS = envOrFallback(
    process.env.NEXT_PUBLIC_ARTISAN_REGISTRY_ADDRESS,
    PLACEHOLDER_ADDRESS
);

export const PRODUCT_REGISTRY_ADDRESS = envOrFallback(
    process.env.NEXT_PUBLIC_PRODUCT_REGISTRY_ADDRESS,
    PLACEHOLDER_ADDRESS
);

export const PRODUCT_NFT_ADDRESS = envOrFallback(
    process.env.NEXT_PUBLIC_PRODUCT_NFT_ADDRESS,
    PLACEHOLDER_ADDRESS
);

export const DYNAMIC_ROYALTY_ADDRESS = envOrFallback(
    process.env.NEXT_PUBLIC_DYNAMIC_ROYALTY_ADDRESS,
    PLACEHOLDER_ADDRESS
);

export const ESCROW_MARKETPLACE_ADDRESS = envOrFallback(
    process.env.NEXT_PUBLIC_ESCROW_MARKETPLACE_ADDRESS,
    PLACEHOLDER_ADDRESS
);

export const CHAIN_ID = Number(envOrFallback(process.env.NEXT_PUBLIC_CHAIN_ID, "11155111"));
export const RPC_URL = envOrFallback(process.env.NEXT_PUBLIC_RPC_URL, PLACEHOLDER_RPC_URL);
