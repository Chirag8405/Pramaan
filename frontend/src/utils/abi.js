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
    inputs: [
      { internalType: "bytes32", name: "hash", type: "bytes32" },
      { internalType: "string", name: "cid", type: "string" },
      { internalType: "string", name: "name", type: "string" },
      { internalType: "string", name: "giTag", type: "string" },
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
    inputs: [{ internalType: "bytes32", name: "hash", type: "bytes32" }],
    name: "verifyProduct",
    outputs: [
      {
        components: [
          { internalType: "bytes32", name: "productHash", type: "bytes32" },
          { internalType: "string", name: "ipfsCid", type: "string" },
          { internalType: "address", name: "artisan", type: "address" },
          { internalType: "string", name: "productName", type: "string" },
          { internalType: "string", name: "giTag", type: "string" },
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
