const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadDeployment(networkName) {
  const artifactPath = path.join(__dirname, "..", `deployed.${networkName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Missing deployment artifact: ${artifactPath}`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function getDeploymentStartBlock(provider, deployTxHash) {
  if (!deployTxHash) {
    return 0;
  }
  const receipt = await provider.getTransactionReceipt(deployTxHash);
  return receipt?.blockNumber ?? 0;
}

async function getOrCreateArtisanRegistrationTx(artisanRegistry, signerAddress, fromBlock) {
  const alreadyVerified = await artisanRegistry.isVerifiedArtisan(signerAddress);

  if (!alreadyVerified) {
    const tx = await artisanRegistry.registerArtisan(
      "Demo Artisan",
      "Blue Pottery",
      "Jaipur",
      85
    );
    await tx.wait();
    return tx.hash;
  }

  const filter = artisanRegistry.filters.ArtisanRegistered(signerAddress);
  const events = await artisanRegistry.queryFilter(filter, fromBlock, "latest");
  const latest = events[events.length - 1];
  return latest?.transactionHash || "";
}

async function main() {
  const networkName = hre.network.name;
  const provider = hre.ethers.provider;
  const [signer] = await hre.ethers.getSigners();

  const deployed = loadDeployment(networkName);
  const artisanRegistry = await hre.ethers.getContractAt("ArtisanRegistry", deployed.ArtisanRegistry);
  const productRegistry = await hre.ethers.getContractAt("ProductRegistry", deployed.ProductRegistry);

  const fromBlock = await getDeploymentStartBlock(provider, deployed?.deployTx?.ArtisanRegistry);

  const artisanRegistrationTx = await getOrCreateArtisanRegistrationTx(
    artisanRegistry,
    signer.address,
    fromBlock
  );

  const productHash = hre.ethers.hexlify(hre.ethers.randomBytes(32));
  const metadataHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`metadata:${productHash}`));
  const nonce = hre.ethers.hexlify(hre.ethers.randomBytes(32));

  const registerTx = await productRegistry.registerProduct(
    productHash,
    "bafybeigdyrztfaketestcidforjudgepacket123456789",
    "Demo Product Batch",
    "Blue Pottery",
    metadataHash,
    signer.address,
    "0x1234",
    26912345,
    75412345
  );
  await registerTx.wait();

  const transferTx = await productRegistry.transferProduct(
    productHash,
    "0x1000000000000000000000000000000000000001",
    { value: 0 }
  );
  await transferTx.wait();

  const checkpointTx = await productRegistry.checkpointScanNonce(productHash, nonce);
  await checkpointTx.wait();

  const explorerBase = deployed?.explorer?.baseUrl || "https://sepolia.etherscan.io";
  const output = {
    network: networkName,
    signer: signer.address,
    productHash,
    nonce,
    tx: {
      artisanRegistration: artisanRegistrationTx,
      productRegistration: registerTx.hash,
      transfer: transferTx.hash,
      nonceCheckpoint: checkpointTx.hash
    },
    links: {
      artisanRegistration: artisanRegistrationTx ? `${explorerBase}/tx/${artisanRegistrationTx}` : "",
      productRegistration: `${explorerBase}/tx/${registerTx.hash}`,
      transfer: `${explorerBase}/tx/${transferTx.hash}`,
      nonceCheckpoint: `${explorerBase}/tx/${checkpointTx.hash}`
    },
    generatedAt: new Date().toISOString()
  };

  const outPath = path.join(__dirname, "..", `demo-tx.${networkName}.json`);
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log("Demo tx artifact written:", outPath);
  console.log("Artisan registration tx:", output.links.artisanRegistration || output.tx.artisanRegistration);
  console.log("Product registration tx:", output.links.productRegistration);
  console.log("Transfer tx:", output.links.transfer);
  console.log("Nonce checkpoint tx:", output.links.nonceCheckpoint);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
