const { ethers } = require("hardhat");

// Mirrors ProductRegistry._attestationDigest exactly:
//
//   keccak256(abi.encode(
//       block.chainid,      // uint256
//       address(this),      // address
//       hash,                // bytes32
//       metadataHash,         // bytes32
//       artisan,               // address  (msg.sender of registerProduct)
//       provenanceSigner,      // address
//       cid,                   // string
//       name,                  // string
//       giTag,                 // string
//       lat,                   // uint256
//       lng                    // uint256
//   ))
//
// This is standard abi.encode (NOT encodePacked), so we must use AbiCoder
// with the matching Solidity type list, not solidityPacked/solidityPackedKeccak256.
function computeAttestationDigest({
    chainId,
    contractAddress,
    productHash,
    metadataHash,
    artisan,
    provenanceSigner,
    cid,
    name,
    giTag,
    lat,
    lng
}) {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encoded = abiCoder.encode(
        ["uint256", "address", "bytes32", "bytes32", "address", "address", "string", "string", "string", "uint256", "uint256"],
        [chainId, contractAddress, productHash, metadataHash, artisan, provenanceSigner, cid, name, giTag, lat, lng]
    );
    return ethers.keccak256(encoded);
}

// Reproduces ECDSA.toEthSignedMessageHash(bytes32).recover(signature):
// the signer signs the raw 32-byte digest, and ethers' signMessage applies
// the "\x19Ethereum Signed Message:\n32" prefix automatically when given
// raw bytes (as opposed to a string, which would be treated as UTF-8 text).
async function signAttestationDigest(signer, digest) {
    return signer.signMessage(ethers.getBytes(digest));
}

module.exports = { computeAttestationDigest, signAttestationDigest };
