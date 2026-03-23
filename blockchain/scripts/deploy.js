const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const EXPLORER_BY_CHAIN = {
    11155111: "https://sepolia.etherscan.io"
};

async function main() {
    const network = await hre.ethers.provider.getNetwork();
    const chainId = Number(network.chainId);
    const explorerBase = EXPLORER_BY_CHAIN[chainId] || "";

    const ArtisanRegistry = await hre.ethers.getContractFactory("ArtisanRegistry");
    const artisanRegistry = await ArtisanRegistry.deploy();
    await artisanRegistry.waitForDeployment();
    const artisanRegistryAddress = await artisanRegistry.getAddress();
    const artisanDeployTxHash = artisanRegistry.deploymentTransaction()?.hash || "";

    // For hackathon flow: deployer acts as marketplace initially.
    const [deployer] = await hre.ethers.getSigners();

    const DynamicRoyalty = await hre.ethers.getContractFactory("DynamicRoyalty");
    const dynamicRoyalty = await DynamicRoyalty.deploy(
        deployer.address,
        deployer.address,
        artisanRegistryAddress
    );
    await dynamicRoyalty.waitForDeployment();
    const dynamicRoyaltyAddress = await dynamicRoyalty.getAddress();

    const ProductNFT = await hre.ethers.getContractFactory("ProductNFT");
    const productNFT = await ProductNFT.deploy(artisanRegistryAddress, dynamicRoyaltyAddress);
    await productNFT.waitForDeployment();
    const productNFTAddress = await productNFT.getAddress();

    const EscrowMarketplace = await hre.ethers.getContractFactory("EscrowMarketplace");
    const escrowMarketplace = await EscrowMarketplace.deploy(
        productNFTAddress,
        dynamicRoyaltyAddress,
        2 * 24 * 60 * 60,
        3 * 24 * 60 * 60
    );
    await escrowMarketplace.waitForDeployment();
    const escrowMarketplaceAddress = await escrowMarketplace.getAddress();

    // Authorize ProductNFT to register token minters in the royalty engine.
    const setRegistrarTx = await dynamicRoyalty.setMinterRegistrar(productNFTAddress);
    await setRegistrarTx.wait();

    // Escrow marketplace becomes the settlement entrypoint for secondary sales.
    const setMarketplaceTx = await dynamicRoyalty.setMarketplace(escrowMarketplaceAddress);
    await setMarketplaceTx.wait();

    const ProductRegistry = await hre.ethers.getContractFactory("ProductRegistry");
    const productRegistry = await ProductRegistry.deploy(artisanRegistryAddress);
    await productRegistry.waitForDeployment();
    const productRegistryAddress = await productRegistry.getAddress();
    const productDeployTxHash = productRegistry.deploymentTransaction()?.hash || "";

    console.log("ArtisanRegistry deployed at:", artisanRegistryAddress);
    console.log("DynamicRoyalty deployed at:", dynamicRoyaltyAddress);
    console.log("ProductNFT deployed at:", productNFTAddress);
    console.log("EscrowMarketplace deployed at:", escrowMarketplaceAddress);
    console.log("ProductRegistry deployed at:", productRegistryAddress);
    if (artisanDeployTxHash) {
        console.log("ArtisanRegistry deploy tx:", artisanDeployTxHash);
    }
    if (productDeployTxHash) {
        console.log("ProductRegistry deploy tx:", productDeployTxHash);
    }

    const networkName = hre.network.name;
    const deployedPath = path.join(__dirname, "..", "deployed.json");
    const networkDeployedPath = path.join(__dirname, "..", `deployed.${networkName}.json`);
    const deployed = {
        network: networkName,
        chainId,
        ArtisanRegistry: artisanRegistryAddress,
        DynamicRoyalty: dynamicRoyaltyAddress,
        ProductNFT: productNFTAddress,
        EscrowMarketplace: escrowMarketplaceAddress,
        ProductRegistry: productRegistryAddress,
        deployTx: {
            ArtisanRegistry: artisanDeployTxHash,
            ProductRegistry: productDeployTxHash
        },
        explorer: {
            baseUrl: explorerBase,
            ArtisanRegistry: explorerBase ? `${explorerBase}/address/${artisanRegistryAddress}` : "",
            ProductRegistry: explorerBase ? `${explorerBase}/address/${productRegistryAddress}` : "",
            ArtisanRegistryTx: explorerBase && artisanDeployTxHash ? `${explorerBase}/tx/${artisanDeployTxHash}` : "",
            ProductRegistryTx: explorerBase && productDeployTxHash ? `${explorerBase}/tx/${productDeployTxHash}` : ""
        },
        deployedAt: new Date().toISOString()
    };

    fs.writeFileSync(deployedPath, JSON.stringify(deployed, null, 2));
    fs.writeFileSync(networkDeployedPath, JSON.stringify(deployed, null, 2));
    console.log("Deployment addresses saved to:", deployedPath);
    console.log("Network artifact saved to:", networkDeployedPath);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});