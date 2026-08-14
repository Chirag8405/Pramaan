const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

function loadDeployment(networkName) {
  const artifactPath = path.join(__dirname, "..", `deployed.${networkName}.json`);
  if (!fs.existsSync(artifactPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function verifyContract(address, constructorArguments) {
  try {
    await hre.run("verify:verify", {
      address,
      constructorArguments
    });
    console.log("[ok] Verified:", address);
  } catch (error) {
    const msg = String(error?.message || error);
    if (msg.toLowerCase().includes("already verified")) {
      console.log("[ok] Already verified:", address);
      return;
    }
    throw error;
  }
}

async function main() {
  if (!process.env.ETHERSCAN_API_KEY) {
    console.warn("ETHERSCAN_API_KEY is not set; skipping contract verification.");
    return;
  }

  const networkName = hre.network.name;
  const deployed = loadDeployment(networkName);

  if (!deployed) {
    console.warn(`No deployment artifact found for ${networkName}; skipping verification.`);
    return;
  }

  if (!deployed.ArtisanRegistry || !deployed.ProductRegistry) {
    console.warn("Deployment artifact missing contract addresses; skipping verification.");
    return;
  }

  await verifyContract(deployed.ArtisanRegistry, []);
  await verifyContract(deployed.ProductRegistry, [deployed.ArtisanRegistry]);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
