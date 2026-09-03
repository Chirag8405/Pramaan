const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

function loadDeployment(networkName) {
    const preferredPath = path.join(__dirname, "..", `deployed.${networkName}.json`);
    const fallbackPath = path.join(__dirname, "..", "deployed.json");
    const filePath = fs.existsSync(preferredPath) ? preferredPath : fallbackPath;

    if (!fs.existsSync(filePath)) {
        throw new Error(`No deployment artifact found at ${preferredPath} or ${fallbackPath}.`);
    }

    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

async function main() {
    // `hardhat run` (Hardhat v2) takes exactly one positional argument — the script
    // path — and has no mechanism to forward extra CLI args into the script itself, so
    // process.argv can't carry this. An env var is the standard, reliable way to pass a
    // parameter into a Hardhat script.
    const backendSignerAddress = process.env.AADHAAR_VERIFIER_ADDRESS;
    if (!backendSignerAddress) {
        throw new Error(
            "Usage: AADHAAR_VERIFIER_ADDRESS=0xYourAddress npx hardhat run scripts/grant-aadhaar-verifier.js --network sepolia"
        );
    }

    const normalizedAddress = hre.ethers.getAddress(backendSignerAddress); // throws if malformed

    const networkName = hre.network.name;
    const deployment = loadDeployment(networkName);
    if (!deployment.ArtisanRegistry) {
        throw new Error(`No ArtisanRegistry address found in the deployment artifact for network "${networkName}".`);
    }

    const [signer] = await hre.ethers.getSigners();
    console.log("Network:", networkName);
    console.log("ArtisanRegistry:", deployment.ArtisanRegistry);
    console.log("Calling as (should be contract owner):", signer.address);
    console.log("Granting verifier status to:", normalizedAddress);

    const artisanRegistry = await hre.ethers.getContractAt("ArtisanRegistry", deployment.ArtisanRegistry, signer);

    // Fail fast with a clear message if the configured PRIVATE_KEY isn't actually the
    // owner, rather than letting the transaction revert with a bare require string.
    const owner = await artisanRegistry.owner();
    if (owner.toLowerCase() !== signer.address.toLowerCase()) {
        throw new Error(
            `Configured PRIVATE_KEY (${signer.address}) is not the ArtisanRegistry owner (${owner}). ` +
            "setAadhaarVerifier will revert with 'Ownable: caller is not the owner'."
        );
    }

    const alreadyGranted = await artisanRegistry.aadhaarVerifier(normalizedAddress);
    if (alreadyGranted) {
        console.log("[ok] Already granted — aadhaarVerifier(address) already reads true. No transaction sent.");
        return;
    }

    const tx = await artisanRegistry.setAadhaarVerifier(normalizedAddress, true);
    console.log("Transaction sent:", tx.hash);

    const receipt = await tx.wait();
    console.log("Confirmed in block:", receipt.blockNumber);

    const nowGranted = await artisanRegistry.aadhaarVerifier(normalizedAddress);
    console.log("aadhaarVerifier(" + normalizedAddress + ") now reads:", nowGranted);

    if (!nowGranted) {
        throw new Error("Transaction confirmed but aadhaarVerifier() still reads false — investigate before proceeding.");
    }

    console.log("[ok] Backend signer granted Aadhaar verifier status.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
