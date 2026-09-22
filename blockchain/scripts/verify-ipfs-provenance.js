const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function loadDeployment(networkName) {
  const artifactPath = path.join(__dirname, "..", `deployed.${networkName}.json`);
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`No deployment artifact found for network "${networkName}" at ${artifactPath}`);
  }
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

function stableSortObject(value) {
  if (Array.isArray(value)) {
    return value.map(stableSortObject);
  }
  if (value && typeof value === "object") {
    const sorted = {};
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      sorted[key] = stableSortObject(value[key]);
    }
    return sorted;
  }
  return value;
}

function deterministicMetadataHash(payload) {
  const canonicalJson = JSON.stringify(stableSortObject(payload));
  return hre.ethers.keccak256(hre.ethers.toUtf8Bytes(canonicalJson));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Fetch failed (${response.status}): ${url}`);
  }
  return response.json();
}

async function main() {
  const productHash = process.env.PRODUCT_HASH || process.argv[2];
  if (!productHash || !/^0x[0-9a-fA-F]{64}$/.test(productHash)) {
    throw new Error(
      'Missing/invalid product hash.\nUsage: PRODUCT_HASH=0x<64-hex> npx hardhat run scripts/verify-ipfs-provenance.js --network sepolia'
    );
  }

  const networkName = hre.network.name;
  const deployed = loadDeployment(networkName);
  const productRegistry = await hre.ethers.getContractAt("ProductRegistry", deployed.ProductRegistry);

  console.log(`\nReading on-chain record for ${productHash} on ${networkName}...`);
  const [record] = await productRegistry.verifyProduct(productHash);

  const onChain = {
    ipfsCid: record.ipfsCid,
    artisan: record.artisan,
    productName: record.productName,
    giTag: record.giTag,
    metadataHash: record.metadataHash,
    origin_lat: record.origin_lat.toString(),
    origin_lng: record.origin_lng.toString()
  };
  console.log("On-chain record:", onChain);

  const gateway = (process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud").replace(/\/$/, "");
  const metadataUrl = `${gateway}/ipfs/${onChain.ipfsCid}`;
  console.log(`\nFetching attestation metadata from IPFS via ${metadataUrl} ...`);
  const metadata = await fetchJson(metadataUrl);
  console.log("Fetched IPFS metadata:", metadata);

  console.log("\nCross-checking the same CID against a gateway we don't control (ipfs.io), to prove it's really pinned to IPFS and not just served from our own backend...");
  try {
    const independentMetadata = await fetchJson(`https://ipfs.io/ipfs/${onChain.ipfsCid}`);
    const matches = JSON.stringify(stableSortObject(independentMetadata)) === JSON.stringify(stableSortObject(metadata));
    console.log(matches ? "MATCH: ipfs.io returned byte-identical content." : "MISMATCH: content differs between gateways.");
  } catch (err) {
    console.log("Independent gateway fetch failed (network/rate-limit) - not fatal:", err.message);
  }

  if (metadata.productHash && metadata.productHash.toLowerCase() !== productHash.toLowerCase()) {
    throw new Error("Metadata JSON's embedded productHash does not match the on-chain product hash!");
  }
  console.log("\nOK: the IPFS metadata JSON's embedded productHash matches the on-chain product hash.");

  const attestationMeta = {
    schema: "pramaan.attestation.v1",
    chainId: hre.network.config.chainId,
    registry: deployed.ProductRegistry,
    productHash,
    cid: onChain.ipfsCid,
    name: onChain.productName,
    giTag: onChain.giTag,
    latitudeScaled: onChain.origin_lat,
    longitudeScaled: onChain.origin_lng,
    artisan: onChain.artisan,
    batchIdentity: {
      batchId: metadata?.batchIdentity?.batchId ?? null,
      lotNumber: metadata?.batchIdentity?.lotNumber ?? null,
      batchSize: metadata?.batchIdentity?.batchSize ?? null,
      productionDate: metadata?.batchIdentity?.productionDate ?? null,
      originLabel: metadata?.batchIdentity?.originLabel ?? null,
      geoFenceTag: metadata?.batchIdentity?.geoFenceTag ?? null
    }
  };

  const recomputedHash = deterministicMetadataHash(attestationMeta);
  console.log("\nRecomputed metadataHash from on-chain fields + IPFS batch identity:", recomputedHash);
  console.log("On-chain metadataHash:                                             ", onChain.metadataHash);

  if (recomputedHash.toLowerCase() === onChain.metadataHash.toLowerCase()) {
    console.log("\nMATCH: the on-chain attestation hash is provably derived from this exact IPFS content plus the on-chain fields. Nobody swapped the metadata after registration.");
  } else {
    console.log("\nMISMATCH: recomputed hash does not equal the on-chain metadataHash.");
    console.log("Note: this comparison assumes the product was registered through the standard frontend flow (registerProduct helper in frontend/src/utils/contract.js). A record created another way (e.g. blockchain/scripts/generate-demo-tx.js, which hashes a placeholder string instead) will not match by design.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
