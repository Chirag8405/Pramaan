const fs = require("fs");
const path = require("path");

function parseEnv(raw) {
  const env = {};
  const lines = String(raw || "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    env[key] = value;
  }
  return env;
}

function loadDeployment(networkName) {
  const blockchainRoot = path.join(__dirname, "..");
  const preferredPath = path.join(blockchainRoot, `deployed.${networkName}.json`);
  const fallbackPath = path.join(blockchainRoot, "deployed.json");
  const filePath = fs.existsSync(preferredPath) ? preferredPath : fs.existsSync(fallbackPath) ? fallbackPath : null;

  if (!filePath) {
    return { data: null, filePath: null };
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return { data, filePath };
}

// Keys this script owns and will overwrite on every run, sourced from the deployment
// artifact and RPC/chain config. Every OTHER key already present in .env.local (Pinata
// secrets, demo keys, currency metadata, etc.) is preserved untouched.
const MANAGED_ADDRESS_KEYS = {
  ArtisanRegistry: "NEXT_PUBLIC_ARTISAN_REGISTRY_ADDRESS",
  ProductRegistry: "NEXT_PUBLIC_PRODUCT_REGISTRY_ADDRESS",
  ProductNFT: "NEXT_PUBLIC_PRODUCT_NFT_ADDRESS",
  DynamicRoyalty: "NEXT_PUBLIC_DYNAMIC_ROYALTY_ADDRESS",
  EscrowMarketplace: "NEXT_PUBLIC_ESCROW_MARKETPLACE_ADDRESS"
};

function main() {
  const networkName = process.argv[2] || "sepolia";
  const { data, filePath } = loadDeployment(networkName);

  if (!data) {
    console.warn("No deployment artifact found. Writing frontend env with RPC defaults only.");
  } else if (!data.ArtisanRegistry || !data.ProductRegistry) {
    console.warn("Deployment artifact is missing some contract addresses. Writing whatever is available.");
  }

  const frontendEnvPath = path.join(__dirname, "..", "..", "frontend", ".env.local");
  const existingEnv = fs.existsSync(frontendEnvPath)
    ? parseEnv(fs.readFileSync(frontendEnvPath, "utf8"))
    : {};

  const nextPublicRpc =
    process.env.NEXT_PUBLIC_RPC_URL ||
    existingEnv.NEXT_PUBLIC_RPC_URL ||
    "https://ethereum-sepolia-rpc.publicnode.com";
  const nextPublicWsRpc =
    process.env.NEXT_PUBLIC_WS_RPC_URL ||
    existingEnv.NEXT_PUBLIC_WS_RPC_URL ||
    "wss://ethereum-sepolia-rpc.publicnode.com";
  const nextPublicModelUrl =
    process.env.NEXT_PUBLIC_CRAFT_MODEL_INFERENCE_URL ||
    existingEnv.NEXT_PUBLIC_CRAFT_MODEL_INFERENCE_URL ||
    "";
  const nextPublicVercelUrl =
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    existingEnv.NEXT_PUBLIC_VERCEL_URL ||
    "";
  const nextPublicChainId =
    (data && data.chainId ? String(data.chainId) : "") ||
    existingEnv.NEXT_PUBLIC_CHAIN_ID ||
    "11155111";

  // Merge: start from every key already in .env.local, then overwrite only the keys
  // this script owns. Nothing pre-existing is dropped.
  const mergedEnv = { ...existingEnv };

  for (const [deployedKey, envKey] of Object.entries(MANAGED_ADDRESS_KEYS)) {
    if (data && data[deployedKey]) {
      mergedEnv[envKey] = data[deployedKey];
    }
  }

  mergedEnv.NEXT_PUBLIC_RPC_URL = nextPublicRpc;
  mergedEnv.NEXT_PUBLIC_WS_RPC_URL = nextPublicWsRpc;
  mergedEnv.NEXT_PUBLIC_CRAFT_MODEL_INFERENCE_URL = nextPublicModelUrl;
  mergedEnv.NEXT_PUBLIC_VERCEL_URL = nextPublicVercelUrl;
  mergedEnv.NEXT_PUBLIC_CHAIN_ID = nextPublicChainId;

  const changedKeys = Object.keys(mergedEnv).filter((key) => existingEnv[key] !== mergedEnv[key]);

  const envContent =
    Object.entries(mergedEnv)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n") + "\n";

  fs.writeFileSync(frontendEnvPath, envContent);

  console.log("Using deployment artifact:", filePath);
  console.log("Wrote frontend env:", frontendEnvPath);
  console.log("Keys changed:", changedKeys.length ? changedKeys.join(", ") : "(none)");
  console.log(
    "Keys preserved unchanged:",
    Object.keys(existingEnv).filter((k) => !changedKeys.includes(k)).length
  );
}

main();
