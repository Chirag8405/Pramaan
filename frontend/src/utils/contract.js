import {
  connect,
  createConfig,
  getAccount,
  getWalletClient,
  http,
  readContract,
  switchChain,
  waitForTransactionReceipt,
  writeContract
} from "@wagmi/core";
import { injected } from "@wagmi/connectors";
import { sepolia } from "wagmi/chains";
import { parseEther } from "viem";

import { ARTISAN_ABI, PRODUCT_ABI } from "./abi";
import {
  ARTISAN_REGISTRY_ADDRESS,
  CHAIN_ID,
  PRODUCT_REGISTRY_ADDRESS,
  RPC_URL
} from "./constants";

const SEPOLIA_HEX_CHAIN_ID = "0xaa36a7";
const DEFAULT_TARGET_ROYALTY_ETH = "0.001";

const injectedConnector = injected({ shimDisconnect: true });

const config = createConfig({
  chains: [sepolia],
  connectors: [injectedConnector],
  transports: {
    [CHAIN_ID]: http(RPC_URL)
  }
});

function ensureBrowserWallet() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No browser wallet found. Install MetaMask first.");
  }
}

async function ensureSepolia() {
  ensureBrowserWallet();

  try {
    await switchChain(config, { chainId: CHAIN_ID });
  } catch (_switchError) {
    await window.ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: SEPOLIA_HEX_CHAIN_ID,
          chainName: "Sepolia",
          rpcUrls: [RPC_URL],
          nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
          blockExplorerUrls: ["https://sepolia.etherscan.io"]
        }
      ]
    });

    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_HEX_CHAIN_ID }]
    });
  }
}

async function ensureConnectedAddress() {
  let account = getAccount(config);
  if (!account.isConnected || !account.address) {
    await connectWallet();
    account = getAccount(config);
  }

  if (!account.address) {
    throw new Error("Wallet connected but no address was returned.");
  }

  return account.address;
}

function assertConfiguredAddress(addressValue, label) {
  if (!addressValue || addressValue === "PASTE_ADDRESS_HERE") {
    throw new Error(label + " is not configured in constants.js");
  }
}

function calculateRoyaltyBps(transferCount) {
  const safeTransferCount = Math.max(1, transferCount);
  const root = Math.max(1, Math.floor(Math.sqrt(safeTransferCount)));
  return Math.floor(4000 / root);
}

export async function connectWallet() {
  ensureBrowserWallet();

  await window.ethereum.request({ method: "eth_requestAccounts" });

  const account = getAccount(config);
  if (!account.isConnected) {
    await connect(config, { connector: injectedConnector });
  }

  await ensureSepolia();

  const connected = getAccount(config);
  const signer = await getWalletClient(config);

  if (!connected.address || !signer) {
    throw new Error("Failed to obtain wallet signer/address.");
  }

  return { signer, address: connected.address };
}

export async function registerArtisan(name, craft, giRegion, craftScore) {
  assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");

  await connectWallet();

  const txHash = await writeContract(config, {
    address: ARTISAN_REGISTRY_ADDRESS,
    abi: ARTISAN_ABI,
    functionName: "registerArtisan",
    args: [name, craft, giRegion, Number(craftScore)]
  });

  return waitForTransactionReceipt(config, { hash: txHash });
}

export async function registerProduct(hash, cid, name, giTag, lat, lng) {
  assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");
  assertConfiguredAddress(PRODUCT_REGISTRY_ADDRESS, "PRODUCT_REGISTRY_ADDRESS");

  const artisanAddress = await ensureConnectedAddress();

  const isVerified = await readContract(config, {
    address: ARTISAN_REGISTRY_ADDRESS,
    abi: ARTISAN_ABI,
    functionName: "isVerifiedArtisan",
    args: [artisanAddress]
  });

  if (!isVerified) {
    throw new Error("Only verified artisans can register products.");
  }

  const txHash = await writeContract(config, {
    address: PRODUCT_REGISTRY_ADDRESS,
    abi: PRODUCT_ABI,
    functionName: "registerProduct",
    args: [hash, cid, name, giTag, BigInt(lat), BigInt(lng)]
  });

  return waitForTransactionReceipt(config, { hash: txHash });
}

export async function transferProduct(hash, newOwnerAddress, saleValueEth) {
  assertConfiguredAddress(PRODUCT_REGISTRY_ADDRESS, "PRODUCT_REGISTRY_ADDRESS");

  await connectWallet();

  let totalValueWei;

  if (typeof saleValueEth !== "undefined" && saleValueEth !== null && String(saleValueEth).trim() !== "") {
    totalValueWei = parseEther(String(saleValueEth));
  } else {
    const { record } = await verifyProduct(hash);
    const nextTransferCount = Number(record.transferCount) + 1;
    const royaltyBps = calculateRoyaltyBps(nextTransferCount);

    // Back-calculate sale payment so royalty payout is at least target value.
    const targetRoyaltyWei = parseEther(DEFAULT_TARGET_ROYALTY_ETH);
    totalValueWei =
      royaltyBps > 0
        ? (targetRoyaltyWei * 10000n + BigInt(royaltyBps) - 1n) / BigInt(royaltyBps)
        : parseEther("0.01");
  }

  const txHash = await writeContract(config, {
    address: PRODUCT_REGISTRY_ADDRESS,
    abi: PRODUCT_ABI,
    functionName: "transferProduct",
    args: [hash, newOwnerAddress],
    value: totalValueWei
  });

  return waitForTransactionReceipt(config, { hash: txHash });
}

export async function verifyProduct(hash) {
  assertConfiguredAddress(PRODUCT_REGISTRY_ADDRESS, "PRODUCT_REGISTRY_ADDRESS");

  const [record, terroirRaw] = await readContract(config, {
    address: PRODUCT_REGISTRY_ADDRESS,
    abi: PRODUCT_ABI,
    functionName: "verifyProduct",
    args: [hash]
  });

  const terroir = Math.max(0, Math.min(100, Number(terroirRaw)));
  return { record, terroir };
}

export async function getArtisan(address) {
  assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");

  return readContract(config, {
    address: ARTISAN_REGISTRY_ADDRESS,
    abi: ARTISAN_ABI,
    functionName: "getArtisan",
    args: [address]
  });
}

export async function getArtisanTokenId(address) {
  assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");

  const tokenId = await readContract(config, {
    address: ARTISAN_REGISTRY_ADDRESS,
    abi: [
      {
        inputs: [{ internalType: "address", name: "", type: "address" }],
        name: "artisanTokenId",
        outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
        stateMutability: "view",
        type: "function"
      }
    ],
    functionName: "artisanTokenId",
    args: [address]
  });

  return tokenId;
}
