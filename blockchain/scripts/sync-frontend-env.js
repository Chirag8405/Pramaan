const fs = require("fs");
const path = require("path");

function loadDeployment(networkName) {
  const blockchainRoot = path.join(__dirname, "..");
  const preferredPath = path.join(blockchainRoot, `deployed.${networkName}.json`);
  const fallbackPath = path.join(blockchainRoot, "deployed.json");

  const filePath = fs.existsSync(preferredPath) ? preferredPath : fallbackPath;

  if (!fs.existsSync(filePath)) {
    throw new Error("No deployment artifact found. Run deployment first.");
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return { data, filePath };
}

function main() {
  const networkName = process.argv[2] || "sepolia";
  const { data, filePath } = loadDeployment(networkName);

  if (!data.ArtisanRegistry || !data.ProductRegistry) {
    throw new Error("Deployment artifact is missing contract addresses.");
  }

  const frontendEnvPath = path.join(__dirname, "..", "..", "frontend", ".env.local");
  const nextPublicRpc = process.env.NEXT_PUBLIC_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

  const envContent = [
    `NEXT_PUBLIC_ARTISAN_REGISTRY_ADDRESS=${data.ArtisanRegistry}`,
    `NEXT_PUBLIC_PRODUCT_REGISTRY_ADDRESS=${data.ProductRegistry}`,
    `NEXT_PUBLIC_RPC_URL=${nextPublicRpc}`,
    ""
  ].join("\n");

  fs.writeFileSync(frontendEnvPath, envContent);

  console.log("Using deployment artifact:", filePath);
  console.log("Wrote frontend env:", frontendEnvPath);
}

main();
