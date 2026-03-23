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

async function ensureVerifiedArtisan(artisanRegistry, signerAddress) {
  const result = {
    registrationTx: "",
    aadhaarTx: ""
  };

  const profile = await artisanRegistry.getArtisan(signerAddress);
  if (!profile?.registeredAt || profile.registeredAt === 0n) {
    const registerTx = await artisanRegistry.registerArtisan(
      "Demo Artisan",
      "Blue Pottery",
      "Jaipur",
      85
    );
    await registerTx.wait();
    result.registrationTx = registerTx.hash;
  }

  const isVerified = await artisanRegistry.isVerifiedArtisan(signerAddress);
  if (!isVerified) {
    const aadhaarTx = await artisanRegistry.markAadhaarVerified(signerAddress);
    await aadhaarTx.wait();
    result.aadhaarTx = aadhaarTx.hash;
  }

  const verifiedNow = await artisanRegistry.isVerifiedArtisan(signerAddress);
  if (!verifiedNow) {
    throw new Error("Signer is not verified after onboarding checks");
  }

  return result;
}

async function main() {
  const networkName = hre.network.name;
  const [signer] = await hre.ethers.getSigners();

  const deployed = loadDeployment(networkName);
  const artisanRegistry = await hre.ethers.getContractAt("ArtisanRegistry", deployed.ArtisanRegistry);
  const productRegistry = await hre.ethers.getContractAt("ProductRegistry", deployed.ProductRegistry);

  const artisanSetup = await ensureVerifiedArtisan(
    artisanRegistry,
    signer.address
  );

  const productHash = hre.ethers.hexlify(hre.ethers.randomBytes(32));
  const metadataHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`metadata:${productHash}`));
  const nonce = hre.ethers.hexlify(hre.ethers.randomBytes(32));
  const cid = "bafybeigdyrztfaketestcidforjudgepacket123456789";
  const productName = "Demo Product Batch";
  const giTag = "Blue Pottery";
  const lat = 26912345;
  const lng = 75412345;

  const attestationEncoded = hre.ethers.AbiCoder.defaultAbiCoder().encode(
    [
      "uint256",
      "address",
      "bytes32",
      "bytes32",
      "address",
      "address",
      "string",
      "string",
      "string",
      "uint256",
      "uint256"
    ],
    [
      BigInt(hre.network.config.chainId || 0),
      deployed.ProductRegistry,
      productHash,
      metadataHash,
      signer.address,
      signer.address,
      cid,
      productName,
      giTag,
      lat,
      lng
    ]
  );
  const attestationDigest = hre.ethers.keccak256(attestationEncoded);
  const deviceSignature = await signer.signMessage(hre.ethers.getBytes(attestationDigest));

  const registerTx = await productRegistry.registerProduct(
    productHash,
    cid,
    productName,
    giTag,
    metadataHash,
    signer.address,
    deviceSignature,
    lat,
    lng
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
      artisanRegistration: artisanSetup.registrationTx,
      aadhaarVerification: artisanSetup.aadhaarTx,
      productRegistration: registerTx.hash,
      transfer: transferTx.hash,
      nonceCheckpoint: checkpointTx.hash
    },
    links: {
      artisanRegistration: artisanSetup.registrationTx ? `${explorerBase}/tx/${artisanSetup.registrationTx}` : "",
      aadhaarVerification: artisanSetup.aadhaarTx ? `${explorerBase}/tx/${artisanSetup.aadhaarTx}` : "",
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
  if (output.links.aadhaarVerification || output.tx.aadhaarVerification) {
    console.log("Aadhaar verification tx:", output.links.aadhaarVerification || output.tx.aadhaarVerification);
  }
  console.log("Product registration tx:", output.links.productRegistration);
  console.log("Transfer tx:", output.links.transfer);
  console.log("Nonce checkpoint tx:", output.links.nonceCheckpoint);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
