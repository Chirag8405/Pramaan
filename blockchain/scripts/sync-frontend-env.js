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

  const envContent = [
    `NEXT_PUBLIC_ARTISAN_REGISTRY_ADDRESS=${data?.ArtisanRegistry || ""}`,
    `NEXT_PUBLIC_PRODUCT_REGISTRY_ADDRESS=${data?.ProductRegistry || ""}`,
    `NEXT_PUBLIC_RPC_URL=${nextPublicRpc}`,
    `NEXT_PUBLIC_WS_RPC_URL=${nextPublicWsRpc}`,
    `NEXT_PUBLIC_CRAFT_MODEL_INFERENCE_URL=${nextPublicModelUrl}`,
    `NEXT_PUBLIC_VERCEL_URL=${nextPublicVercelUrl}`,
    ""
  ].join("\n");

  fs.writeFileSync(frontendEnvPath, envContent);

  console.log("Using deployment artifact:", filePath);
  console.log("Wrote frontend env:", frontendEnvPath);
}

main();
