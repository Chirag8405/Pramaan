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
          { internalType: "uint256", name: "registeredAt", type: "uint256" },
          { internalType: "bool", name: "isAadhaarVerified", type: "bool" },
          { internalType: "bool", name: "isFraudulent", type: "bool" },
          { internalType: "uint256", name: "reputationScore", type: "uint256" },
          { internalType: "uint256", name: "lockedReputation", type: "uint256" },
          { internalType: "uint256", name: "royaltyPenaltyBps", type: "uint256" }
        ],
        internalType: "struct ArtisanRegistry.ArtisanProfile",
        name: "",
        type: "tuple"
      }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "artisan", type: "address" }],
    name: "markAadhaarVerified",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "address", name: "candidate", type: "address" },
      { internalType: "uint256", name: "reputationStake", type: "uint256" }
    ],
    name: "vouchFor",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "candidate", type: "address" }],
    name: "releaseVouches",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "fraudulentArtisan", type: "address" }],
    name: "slash",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "artisan", type: "address" }],
    name: "getRoyaltyPenaltyBps",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [{ internalType: "address", name: "artisan", type: "address" }],
    name: "availableReputation",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
];

export const PRODUCT_NFT_ABI = [
  {
    inputs: [
      { internalType: "address", name: "recipient", type: "address" },
      { internalType: "string", name: "tokenUri", type: "string" },
      { internalType: "uint8", name: "terroirScore", type: "uint8" },
      { internalType: "string", name: "provenanceCid", type: "string" }
    ],
    name: "mintProduct",
    outputs: [{ internalType: "uint256", name: "tokenId", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: true, internalType: "address", name: "artisan", type: "address" },
      { indexed: true, internalType: "address", name: "recipient", type: "address" },
      { indexed: false, internalType: "uint8", name: "terroirScore", type: "uint8" },
      { indexed: false, internalType: "string", name: "provenanceCid", type: "string" }
    ],
    name: "ProductMinted",
    type: "event"
  }
];

export const DYNAMIC_ROYALTY_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "transferId", type: "uint256" },
      { internalType: "uint256", name: "salePrice", type: "uint256" }
    ],
    name: "calculateRoyalty",
    outputs: [
      { internalType: "uint256", name: "royaltyAmount", type: "uint256" },
      { internalType: "uint256", name: "royaltyBps", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "uint256", name: "salePrice", type: "uint256" }
    ],
    name: "previewSettlement",
    outputs: [
      { internalType: "uint256", name: "transferId", type: "uint256" },
      { internalType: "uint256", name: "baseRoyaltyBps", type: "uint256" },
      { internalType: "uint256", name: "penaltyBps", type: "uint256" },
      { internalType: "uint256", name: "artisanAmount", type: "uint256" },
      { internalType: "uint256", name: "sellerAmount", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "address payable", name: "seller", type: "address" }
    ],
    name: "processSecondarySale",
    outputs: [
      { internalType: "uint256", name: "artisanAmount", type: "uint256" },
      { internalType: "uint256", name: "sellerAmount", type: "uint256" }
    ],
    stateMutability: "payable",
    type: "function"
  }
];

export const ESCROW_MARKETPLACE_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "address", name: "seller", type: "address" }
    ],
    name: "createEscrow",
    outputs: [{ internalType: "uint256", name: "escrowId", type: "uint256" }],
    stateMutability: "payable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "escrowId", type: "uint256" }],
    name: "markShipped",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "escrowId", type: "uint256" }],
    name: "confirmReceived",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "escrowId", type: "uint256" }],
    name: "cancelExpired",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [
      { internalType: "uint256", name: "escrowId", type: "uint256" },
      { internalType: "string", name: "reason", type: "string" }
    ],
    name: "raiseDispute",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function"
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "escrows",
    outputs: [
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "address", name: "buyer", type: "address" },
      { internalType: "address", name: "seller", type: "address" },
      { internalType: "uint256", name: "salePrice", type: "uint256" },
      { internalType: "uint256", name: "createdAt", type: "uint256" },
      { internalType: "uint256", name: "shippedAt", type: "uint256" },
      { internalType: "uint256", name: "shippingDeadline", type: "uint256" },
      { internalType: "uint256", name: "confirmDeadline", type: "uint256" },
      { internalType: "uint8", name: "status", type: "uint8" },
      { internalType: "string", name: "disputeReason", type: "string" }
    ],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "escrowCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
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
