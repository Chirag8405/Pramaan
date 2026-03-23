# Pramaan

Pramaan is a blockchain-backed provenance and verification platform for GI/craft products. It uses Sepolia smart contracts plus a Next.js frontend to register artisans, register products, verify authenticity, track transfers, calculate trust (Terroir) score, and record demo evidence.

## Repository Structure

- `blockchain/`: Hardhat project (contracts, deploy, sync scripts)
- `frontend/`: Next.js app (artisan/product/verify/transfer/demo pages)
- `docs/`: Deployment and demo evidence documentation

## What Is Implemented

### 1) Smart Contracts (Sepolia-ready)

#### ArtisanRegistry
- Soulbound identity token (non-transferable ERC721) for artisans.
- Artisan registration with on-chain gating by craft score (`craftScore >= 60`).
- One-wallet-one-artisan registration check.
- Public read methods for artisan profile and verification status.

Contract file:
- `blockchain/contracts/ArtisanRegistry.sol`

#### ProductRegistry
- Product registration with:
  - unique `productHash`
  - IPFS CID
  - artisan address
  - provenance signer
  - metadata hash
  - optional device signature
  - origin coordinates
- Product transfer tracking with handler chain.
- Handler verification check (`isVerifiedArtisan`) on each transfer.
- Terroir score computation based on custody quality.
- Quadratic royalty payout to original artisan during transfers.
- One-time scan nonce checkpointing and replay detection.

Contract file:
- `blockchain/contracts/ProductRegistry.sol`

### 2) Frontend Application (Next.js)

#### Main user flows
- `/artisan`: artisan onboarding with craft image analysis and on-chain identity minting.
- `/register-product`: product image hashing, IPFS upload, on-chain product registration, QR generation.
- `/verify`: product verification, chain-of-custody timeline, terroir status, nonce replay check.
- `/transfer`: ownership transfer with royalty preview and transfer execution.

#### Demo and operations pages
- `/monitor`: realtime `ProductRegistered` / `ProductTransferred` event stream.
- `/checklist`: quick navigation for demo sequence.
- `/evidence`: local transaction evidence capture and markdown export.

Key frontend files:
- `frontend/app/artisan/page.js`
- `frontend/app/register-product/page.js`
- `frontend/app/verify/page.js`
- `frontend/app/transfer/page.js`
- `frontend/app/monitor/page.js`
- `frontend/app/evidence/page.js`
- `frontend/src/utils/contract.js`
- `frontend/src/utils/hash.js`
- `frontend/src/utils/evidence.js`

### 3) Deployment Tooling

Implemented deployment scripts in `blockchain/package.json`:
- `npm run preflight:sepolia`: validates deployment prerequisites.
- `npm run deploy:sepolia`: deploy contracts to Sepolia.
- `npm run sync:frontend:sepolia`: sync deployed addresses to frontend env.
- `npm run deploy:sepolia:sync`: preflight + deploy + sync.
- `npm run deploy:sepolia:full`: deploy/sync + optional verify command.
- `npm run demo:tx:sepolia`: generates real demo transactions for evidence.

Deployment artifacts:
- `blockchain/deployed.sepolia.json` (addresses, deploy tx hashes, explorer links)
- `blockchain/demo-tx.sepolia.json` (demo transaction set)

### 4) Evidence Documentation

- Demo evidence template with contract addresses and transaction links:
  - `docs/demo-evidence.md`
- Deployment runbook:
  - `docs/deploy-ready.md`

## Current Sepolia Deployment (from repository artifacts)

From `blockchain/deployed.sepolia.json`:
- Network: Sepolia (11155111)
- ArtisanRegistry: `0xebbc94929cAa7ccFcDB92D879dF3305184ec3589`
- ProductRegistry: `0xe6f5eBb08532AD11A2b4Fb4dCa9aD4BDBffcF738`

## Local Setup

## 1) Blockchain setup

```bash
cd blockchain
npm install
cp .env.example .env
```

Set in `blockchain/.env`:
- `ALCHEMY_SEPOLIA_URL`
- `PRIVATE_KEY`
- `ETHERSCAN_API_KEY` (optional)

Deploy and sync:

```bash
npm run deploy:sepolia:sync
```

## 2) Frontend setup

```bash
cd frontend
npm install
```

Create/update `frontend/.env.local` with:
- `NEXT_PUBLIC_ARTISAN_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_PRODUCT_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_WS_RPC_URL`
- `NEXT_PUBLIC_WEB3STORAGE_TOKEN`
- `NEXT_PUBLIC_CRAFT_MODEL_INFERENCE_URL` (optional)
- `NEXT_PUBLIC_VERCEL_URL` (optional)

Run app:

```bash
npm run dev
```

Build check:

```bash
npm run build
```

## How Trust and Ownership Are Computed

- Registration starts with baseline trust score.
- Each transfer appends handler and whether that handler is verified artisan.
- Unverified handlers reduce score.
- Additional penalties apply for suspicious transfer patterns.
- Score bands shown in verify flow:
  - authentic
  - caution
  - compromised

## Pending Work (Current Gaps)

The following items are pending based on current code and docs status:

1. Identity verification before wallet operations
- No Aadhaar/Udyam/mock KYC verification workflow exists before artisan onboarding.

2. Custodial wallet onboarding
- Wallet creation is currently browser-wallet based (MetaMask/injected wallet), not server-created custodial wallets.

3. Secure server-side key management
- No encrypted key vault/KMS/HSM flow exists for managed private key storage.

4. Server-side transaction authorization
- No OTP (or equivalent) authorization layer is implemented for server-side signing.

5. On-chain provenance signature validation
- Provenance signer/signature values are stored but not cryptographically validated on-chain.

6. Proof packaging completion
- Screenshot assets listed in `docs/demo-evidence.md` still need to be captured and attached.

## Notes

- Etherscan contract verification is optional for functionality.
- Node 20/22 is recommended for Hardhat stability (newer Node versions may show warnings).
