const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const ArtisanRegistry = await hre.ethers.getContractFactory("ArtisanRegistry");
    const artisanRegistry = await ArtisanRegistry.deploy();
    await artisanRegistry.waitForDeployment();
    const artisanRegistryAddress = await artisanRegistry.getAddress();

    const ProductRegistry = await hre.ethers.getContractFactory("ProductRegistry");
    const productRegistry = await ProductRegistry.deploy(artisanRegistryAddress);
    await productRegistry.waitForDeployment();
    const productRegistryAddress = await productRegistry.getAddress();

    console.log("ArtisanRegistry deployed at:", artisanRegistryAddress);
    console.log("ProductRegistry deployed at:", productRegistryAddress);

    const deployedPath = path.join(__dirname, "..", "deployed.json");
    const deployed = {
        network: hre.network.name,
        ArtisanRegistry: artisanRegistryAddress,
        ProductRegistry: productRegistryAddress,
        deployedAt: new Date().toISOString()
    };

    fs.writeFileSync(deployedPath, JSON.stringify(deployed, null, 2));
    console.log("Deployment addresses saved to:", deployedPath);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});