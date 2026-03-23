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
import { formatEther, parseEther } from "viem";

import {
    ARTISAN_ABI,
    DYNAMIC_ROYALTY_ABI,
    ESCROW_MARKETPLACE_ABI,
    PRODUCT_ABI,
    PRODUCT_NFT_ABI
} from "./abi";
import {
    ARTISAN_REGISTRY_ADDRESS,
    CHAIN_ID,
    DYNAMIC_ROYALTY_ADDRESS,
    ESCROW_MARKETPLACE_ADDRESS,
    PRODUCT_NFT_ADDRESS,
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

function assertConfiguredAddress(addressValue, label) {
    if (!addressValue || addressValue === "PASTE_ADDRESS_HERE") {
        throw new Error(
            label +
            " is not configured. Set NEXT_PUBLIC_" +
            label +
            " in frontend/.env.local or update src/utils/constants.js."
        );
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

export async function getConnectedAddress() {
    const account = getAccount(config);
    if (account.isConnected && account.address) {
        return account.address;
    }
    const wallet = await connectWallet();
    return wallet.address;
}

function calculateRoyaltyBps(transferCount) {
    const safeTransferCount = Math.max(1, transferCount);
    const root = Math.max(1, Math.floor(Math.sqrt(safeTransferCount)));
    return Math.floor(4000 / root);
}

export async function registerArtisan(name, craft, giRegion, craftScore) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");

    await connectWallet();

    const txHash = await writeContract(config, {
        address: ARTISAN_REGISTRY_ADDRESS,
        abi: ARTISAN_ABI,
        functionName: "registerArtisan",
        args: [name, craft, giRegion, Number(craftScore)],
        // Keep gas safely below common RPC caps (prevents wallet defaulting to 21,000,000).
        gas: 900000n
    });

    return waitForTransactionReceipt(config, { hash: txHash });
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

export async function isVerifiedArtisan(address) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");

    return readContract(config, {
        address: ARTISAN_REGISTRY_ADDRESS,
        abi: ARTISAN_ABI,
        functionName: "isVerifiedArtisan",
        args: [address]
    });
}

export async function getArtisanDashboard(address) {
    const [profile, verified, penaltyBps, available] = await Promise.all([
        getArtisan(address),
        isVerifiedArtisan(address),
        readContract(config, {
            address: ARTISAN_REGISTRY_ADDRESS,
            abi: ARTISAN_ABI,
            functionName: "getRoyaltyPenaltyBps",
            args: [address]
        }),
        readContract(config, {
            address: ARTISAN_REGISTRY_ADDRESS,
            abi: ARTISAN_ABI,
            functionName: "availableReputation",
            args: [address]
        })
    ]);

    return { profile, verified: Boolean(verified), penaltyBps: Number(penaltyBps), availableReputation: Number(available) };
}

export async function markAadhaarVerified(artisanAddress) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");
    await connectWallet();

    const txHash = await writeContract(config, {
        address: ARTISAN_REGISTRY_ADDRESS,
        abi: ARTISAN_ABI,
        functionName: "markAadhaarVerified",
        args: [artisanAddress]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function vouchFor(candidateAddress, stake) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");
    await connectWallet();

    const txHash = await writeContract(config, {
        address: ARTISAN_REGISTRY_ADDRESS,
        abi: ARTISAN_ABI,
        functionName: "vouchFor",
        args: [candidateAddress, BigInt(stake)]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function releaseVouches(candidateAddress) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");
    await connectWallet();

    const txHash = await writeContract(config, {
        address: ARTISAN_REGISTRY_ADDRESS,
        abi: ARTISAN_ABI,
        functionName: "releaseVouches",
        args: [candidateAddress]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function slashFraud(candidateAddress) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");
    await connectWallet();

    const txHash = await writeContract(config, {
        address: ARTISAN_REGISTRY_ADDRESS,
        abi: ARTISAN_ABI,
        functionName: "slash",
        args: [candidateAddress]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function verifyCraftImage(file) {
    const formData = new FormData();
    formData.append("image", file);

    const response = await fetch("/api/verify-craft", {
        method: "POST",
        body: formData
    });

    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload?.detail || payload?.error || "Failed to verify craft image.");
    }

    return payload;
}

export async function mintProductTwin(recipient, tokenUri, terroirScore, provenanceCid) {
    assertConfiguredAddress(PRODUCT_NFT_ADDRESS, "PRODUCT_NFT_ADDRESS");
    await connectWallet();

    const txHash = await writeContract(config, {
        address: PRODUCT_NFT_ADDRESS,
        abi: PRODUCT_NFT_ABI,
        functionName: "mintProduct",
        args: [recipient, tokenUri, Number(terroirScore), provenanceCid]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function approveEscrowForToken(tokenId) {
    assertConfiguredAddress(PRODUCT_NFT_ADDRESS, "PRODUCT_NFT_ADDRESS");
    assertConfiguredAddress(ESCROW_MARKETPLACE_ADDRESS, "ESCROW_MARKETPLACE_ADDRESS");
    await connectWallet();

    const txHash = await writeContract(config, {
        address: PRODUCT_NFT_ADDRESS,
        abi: [
            {
                inputs: [
                    { internalType: "address", name: "to", type: "address" },
                    { internalType: "uint256", name: "tokenId", type: "uint256" }
                ],
                name: "approve",
                outputs: [],
                stateMutability: "nonpayable",
                type: "function"
            }
        ],
        functionName: "approve",
        args: [ESCROW_MARKETPLACE_ADDRESS, BigInt(tokenId)]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function createEscrowSale(tokenId, sellerAddress, saleValueEth) {
    assertConfiguredAddress(ESCROW_MARKETPLACE_ADDRESS, "ESCROW_MARKETPLACE_ADDRESS");
    await connectWallet();

    const txHash = await writeContract(config, {
        address: ESCROW_MARKETPLACE_ADDRESS,
        abi: ESCROW_MARKETPLACE_ABI,
        functionName: "createEscrow",
        args: [BigInt(tokenId), sellerAddress],
        value: parseEther(String(saleValueEth))
    });

    const receipt = await waitForTransactionReceipt(config, { hash: txHash });
    const latestEscrowId = await readContract(config, {
        address: ESCROW_MARKETPLACE_ADDRESS,
        abi: ESCROW_MARKETPLACE_ABI,
        functionName: "escrowCount"
    });

    return {
        receipt,
        escrowId: Number(latestEscrowId)
    };
}

export async function markEscrowShipped(escrowId) {
    assertConfiguredAddress(ESCROW_MARKETPLACE_ADDRESS, "ESCROW_MARKETPLACE_ADDRESS");
    await connectWallet();

    const txHash = await writeContract(config, {
        address: ESCROW_MARKETPLACE_ADDRESS,
        abi: ESCROW_MARKETPLACE_ABI,
        functionName: "markShipped",
        args: [BigInt(escrowId)]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function confirmEscrowReceived(escrowId) {
    assertConfiguredAddress(ESCROW_MARKETPLACE_ADDRESS, "ESCROW_MARKETPLACE_ADDRESS");
    await connectWallet();

    const txHash = await writeContract(config, {
        address: ESCROW_MARKETPLACE_ADDRESS,
        abi: ESCROW_MARKETPLACE_ABI,
        functionName: "confirmReceived",
        args: [BigInt(escrowId)]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function cancelEscrowExpired(escrowId) {
    assertConfiguredAddress(ESCROW_MARKETPLACE_ADDRESS, "ESCROW_MARKETPLACE_ADDRESS");
    await connectWallet();

    const txHash = await writeContract(config, {
        address: ESCROW_MARKETPLACE_ADDRESS,
        abi: ESCROW_MARKETPLACE_ABI,
        functionName: "cancelExpired",
        args: [BigInt(escrowId)]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function raiseEscrowDispute(escrowId, reason) {
    assertConfiguredAddress(ESCROW_MARKETPLACE_ADDRESS, "ESCROW_MARKETPLACE_ADDRESS");
    await connectWallet();

    const txHash = await writeContract(config, {
        address: ESCROW_MARKETPLACE_ADDRESS,
        abi: ESCROW_MARKETPLACE_ABI,
        functionName: "raiseDispute",
        args: [BigInt(escrowId), reason || "Dispute raised from app"]
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

export async function getEscrowDetails(escrowId) {
    assertConfiguredAddress(ESCROW_MARKETPLACE_ADDRESS, "ESCROW_MARKETPLACE_ADDRESS");

    const escrow = await readContract(config, {
        address: ESCROW_MARKETPLACE_ADDRESS,
        abi: ESCROW_MARKETPLACE_ABI,
        functionName: "escrows",
        args: [BigInt(escrowId)]
    });

    return {
        id: Number(escrow.id),
        tokenId: Number(escrow.tokenId),
        buyer: escrow.buyer,
        seller: escrow.seller,
        salePriceWei: escrow.salePrice,
        salePriceEth: formatEther(escrow.salePrice),
        createdAt: Number(escrow.createdAt),
        shippedAt: Number(escrow.shippedAt),
        shippingDeadline: Number(escrow.shippingDeadline),
        confirmDeadline: Number(escrow.confirmDeadline),
        status: Number(escrow.status),
        disputeReason: escrow.disputeReason
    };
}

export async function previewRoyaltySettlement(tokenId, saleValueEth) {
    assertConfiguredAddress(DYNAMIC_ROYALTY_ADDRESS, "DYNAMIC_ROYALTY_ADDRESS");

    const saleWei = parseEther(String(saleValueEth || "0"));

    const [transferId, baseRoyaltyBps, penaltyBps, artisanAmountWei, sellerAmountWei] = await readContract(config, {
        address: DYNAMIC_ROYALTY_ADDRESS,
        abi: DYNAMIC_ROYALTY_ABI,
        functionName: "previewSettlement",
        args: [BigInt(tokenId), saleWei]
    });

    return {
        transferId: Number(transferId),
        baseRoyaltyBps: Number(baseRoyaltyBps),
        penaltyBps: Number(penaltyBps),
        artisanAmountWei,
        sellerAmountWei,
        artisanAmountEth: formatEther(artisanAmountWei),
        sellerAmountEth: formatEther(sellerAmountWei)
    };
}

export async function executeSecondarySale(tokenId, sellerAddress, saleValueEth) {
    assertConfiguredAddress(DYNAMIC_ROYALTY_ADDRESS, "DYNAMIC_ROYALTY_ADDRESS");
    await connectWallet();

    const txHash = await writeContract(config, {
        address: DYNAMIC_ROYALTY_ADDRESS,
        abi: DYNAMIC_ROYALTY_ABI,
        functionName: "processSecondarySale",
        args: [BigInt(tokenId), sellerAddress],
        value: parseEther(String(saleValueEth))
    });

    return waitForTransactionReceipt(config, { hash: txHash });
}

// Legacy product registry helpers retained for backward compatibility.
export async function registerProduct(hash, cid, name, giTag, lat, lng) {
    assertConfiguredAddress(ARTISAN_REGISTRY_ADDRESS, "ARTISAN_REGISTRY_ADDRESS");
    assertConfiguredAddress(PRODUCT_REGISTRY_ADDRESS, "PRODUCT_REGISTRY_ADDRESS");

    const artisanAddress = await getConnectedAddress();
    const verified = await isVerifiedArtisan(artisanAddress);
    if (!verified) {
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
