export const ARTISAN_ABI = [
  {
    inputs: [
      { internalType: "string", name: "name", type: "string" },
      { internalType: "string", name: "craft", type: "string" },
      { internalType: "string", name: "giRegion", type: "string" },
      { internalType: "uint8", name: "craftScore", type: "uint8" }
    ],
    name: "registerArtisan",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "wallet", type: "address" }],
    name: "isVerifiedArtisan",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "wallet", type: "address" }],
    name: "getArtisan",
    outputs: [
      {
        components: [
          { internalType: "address", name: "wallet", type: "address" },
          { internalType: "string", name: "name", type: "string" },
          { internalType: "string", name: "craft", type: "string" },
          { internalType: "string", name: "giRegion", type: "string" },
          { internalType: "uint8", name: "craftScore", type: "uint8" },
          { internalType: "uint256", name: "registeredAt", type: "uint256" },
          { internalType: "bool", name: "verified", type: "bool" }
        ],
        internalType: "struct ArtisanRegistry.ArtisanRecord",
        name: "",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  }
];

export const PRODUCT_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "productHash", type: "bytes32" },
      { indexed: true, internalType: "address", name: "artisan", type: "address" },
      { indexed: false, internalType: "string", name: "giTag", type: "string" }
    ],
    name: "ProductRegistered",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "productHash", type: "bytes32" },
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      { indexed: false, internalType: "uint256", name: "transferCount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "royaltyBps", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "royaltyAmount", type: "uint256" }
    ],
    name: "ProductTransferred",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "bytes32", name: "productHash", type: "bytes32" },
      { indexed: true, internalType: "bytes32", name: "nonce", type: "bytes32" },
      { indexed: true, internalType: "address", name: "scanner", type: "address" },
      { indexed: false, internalType: "bool", name: "replayed", type: "bool" },
      { indexed: false, internalType: "uint256", name: "timestamp", type: "uint256" }
    ],
    name: "ProductScanCheckpoint",
    type: "event"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "hash", type: "bytes32" },
      { internalType: "string", name: "cid", type: "string" },
      { internalType: "string", name: "name", type: "string" },
      { internalType: "string", name: "giTag", type: "string" },
      { internalType: "bytes32", name: "metadataHash", type: "bytes32" },
      { internalType: "address", name: "provenanceSigner", type: "address" },
      { internalType: "bytes", name: "deviceSignature", type: "bytes" },
      { internalType: "uint256", name: "lat", type: "uint256" },
      { internalType: "uint256", name: "lng", type: "uint256" }
    ],
    name: "registerProduct",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "hash", type: "bytes32" },
      { internalType: "address", name: "newOwner", type: "address" }
    ],
    name: "transferProduct",
    outputs: [],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "hash", type: "bytes32" },
      { internalType: "bytes32", name: "nonce", type: "bytes32" }
    ],
    name: "checkpointScanNonce",
    outputs: [{ internalType: "bool", name: "replayed", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "bytes32", name: "hash", type: "bytes32" },
      { internalType: "bytes32", name: "nonce", type: "bytes32" }
    ],
    name: "isScanNonceUsed",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "bytes32", name: "hash", type: "bytes32" }],
    name: "verifyProduct",
    outputs: [
      {
        components: [
          { internalType: "bytes32", name: "productHash", type: "bytes32" },
          { internalType: "string", name: "ipfsCid", type: "string" },
          { internalType: "address", name: "artisan", type: "address" },
          { internalType: "address", name: "provenanceSigner", type: "address" },
          { internalType: "string", name: "productName", type: "string" },
          { internalType: "string", name: "giTag", type: "string" },
          { internalType: "bytes32", name: "metadataHash", type: "bytes32" },
          { internalType: "bytes", name: "deviceSignature", type: "bytes" },
          { internalType: "uint256", name: "origin_lat", type: "uint256" },
          { internalType: "uint256", name: "origin_lng", type: "uint256" },
          { internalType: "uint256", name: "registeredAt", type: "uint256" },
          { internalType: "uint256", name: "transferCount", type: "uint256" },
          { internalType: "address[]", name: "handlers", type: "address[]" },
          { internalType: "bool[]", name: "handlerVerified", type: "bool[]" }
        ],
        internalType: "struct ProductRegistry.ProductRecord",
        name: "",
        type: "tuple"
      },
      { internalType: "uint8", name: "terroir", type: "uint8" }
    ],
    stateMutability: "view",
    type: "function"
  }
];
