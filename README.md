# Pramaan

Pramaan is a Sepolia-based provenance and trust platform for GI/craft products. It combines artisan identity verification, AI-assisted authenticity gating, on-chain product lifecycle tracking, dynamic royalties, an escrow marketplace, and judge-ready monitoring/evidence tooling.

> **Glossary — "terroir score":** borrowed from wine/agriculture, where *terroir* describes how a product's origin and handling shape its authenticity. Here it's an AI-assessed 0–100 authenticity score (not a typo for "terror") gating product registration and NFT minting.

## Repository Structure

- `blockchain/`: Hardhat contracts, deployment scripts, env sync scripts, demo transaction generator.
- `frontend/`: Next.js App Router UI, API routes, web3 helpers, monitor/evidence/checklist pages.
- `docs/`: deployment runbook and demo evidence.

## What Is Implemented

## 1) Smart Contracts

Five contracts, all deployed together via `blockchain/scripts/deploy.js` with cross-contract wiring (ProductNFT registered as DynamicRoyalty's minter-registrar; EscrowMarketplace registered as its marketplace). All five are covered by a 153-test Hardhat suite — see [Recent Fixes](#recent-fixes-and-engineering-history) below.

### ArtisanRegistry (`blockchain/contracts/ArtisanRegistry.sol`)

Soulbound identity + Aadhaar attestation + web-of-trust staking/slashing.

Implemented:
- Soulbound artisan identity token (non-transferable ERC721; any transfer attempt reverts).
- Artisan registration (`registerArtisan`) minting a non-transferable SBT.
- Identity/trust layer:
  - Aadhaar verification flag (`markAadhaarVerified`, owner- or designated-verifier-controlled).
  - Verifier role management (`setAadhaarVerifier`, owner-controlled).
  - Verification status enforcement (`isVerifiedArtisan`).
- Web-of-trust layer:
  - Artisan vouching (`vouchFor`) with staked reputation (minimum stake enforced).
  - Vouch release (`releaseVouches`) once a candidate clears review.
  - Slashing (`slash`) for fraudulent artisans — burns voucher stake and raises a royalty penalty (`royaltyPenaltyBps`) on each voucher.
- One-wallet-one-artisan registration check.

### ProductRegistry (`blockchain/contracts/ProductRegistry.sol`)

Implemented:
- Product registration with required provenance fields:
  - `productHash`, `ipfsCid`, `metadataHash`, `provenanceSigner`, device signature, origin coordinates.
- Verified-artisan-only registration (`isVerifiedArtisan` gate).
- ECDSA-signed provenance attestation, verified on-chain, with replay protection (`usedAttestationDigests`).
- Product transfer tracking with handler chain and handler verification flags, plus a quadratic royalty payout to the original artisan on transfer.
- On-chain trust ("terroir") scoring via `verifyProduct` — penalizes unverified handlers, high transfer counts, and burst-transfer patterns.
- Anti-clone scan nonce checkpointing and replay detection:
  - `checkpointScanNonce`
  - `isScanNonceUsed`

### ProductNFT (`blockchain/contracts/ProductNFT.sol`)

ERC-721 digital twin, gated by verified artisan identity and the AI terroir score.

Implemented:
- `mintProduct` — mints a product NFT only if the caller is a verified artisan and the AI terroir score is at or above `MIN_TERROIR_SCORE` (70).
- Registers the minting artisan as the token's original minter with DynamicRoyalty, so secondary-sale royalties route correctly.

### DynamicRoyalty (`blockchain/contracts/DynamicRoyalty.sol`)

Tapered royalty engine for secondary sales.

Implemented:
- A precomputed taper table for the first 15 resales (40% on the first resale, decaying to 10% by the 15th), then a `4000 / sqrt(transferId)` formula for resales beyond that — tuned so the handoff between table and formula is smooth (see Recent Fixes).
- `processSecondarySale` — settles a sale, applying any royalty penalty from ArtisanRegistry slashing (read live, no manual sync required), callable only by the registered marketplace contract.
- `previewSettlement` — a read-only quote of the royalty split before executing a sale.

### EscrowMarketplace (`blockchain/contracts/EscrowMarketplace.sol`)

Holds buyer payment in escrow and releases it after delivery confirmation.

Implemented:
- Full state machine: `Created → Shipped → Completed`, with `Refunded`, `Disputed`, and `Resolved` branches.
- `createEscrow` / `markShipped` / `confirmReceived` — the happy path, with buyer/seller-gated transitions and shipping/confirmation deadlines.
- `cancelExpired` — buyer-triggered refund if the seller never ships in time.
- `raiseDispute` / `resolveDispute` — either party can raise a dispute; the contract owner arbitrates (fund release or refund).
- `checkExpiry` — a permissionless "poke" callable by anyone once a deadline passes, so expiry handling never depends on one party remembering to act (see Recent Fixes).
- Atomic settlement: NFT transfer and royalty payout happen in the same transaction via DynamicRoyalty.

## 2) Frontend Application

Main implemented user flows:
- `/artisan`: wallet connect, trust badges, Aadhaar/validator actions, artisan registration, projected earnings panel.
- `/register-product`: image upload, hashing, AI verification call, on-chain registration, QR generation, certificate view.
- `/verify`: product lookup, trust status, handler chain timeline, terroir status, anti-replay nonce checkpoint.
- `/transfer`: ownership transfer, tapered royalty preview, projected terroir impact.

Operations/demo pages:
- `/monitor`: live Sepolia event timeline (`ProductRegistered` + `ProductTransferred`).
- `/checklist`: judge-demo navigation order.
- `/evidence`: local evidence collector with markdown export.

UI system implemented:
- Tailwind + shadcn-style component primitives.
- Responsive layout and modern app shell.
- Light/dark theming via `next-themes`.

## 3) AI Verification API

Implemented route:
- `frontend/app/api/verify-craft/route.js`

Behavior:
- Accepts uploaded image via multipart form data.
- Calls OpenAI Vision or Gemini Vision based on configured API keys.
- Enforces normalized JSON response shape: `terroir_score` + `reason`.
- Includes controlled fallback mode when no AI key is configured (demo continuity).

## 4) Web3 Integration Layer

Implemented in:
- `frontend/src/utils/abi.js`
- `frontend/src/utils/contract.js`

Includes:
- Updated ABI surfaces for trust + AI + royalty changes.
- Wallet connect and Sepolia enforcement.
- Artisan registration + product registration helpers.
- Transfer helper with royalty-aware value handling.
- Trust helper calls (`verifyAadhaar`, `approveArtisan`, `vouchFor`, reputation/vouch reads).
- Nonce checkpoint and replay checks.

## 5) Deployment and Demo Tooling

Implemented scripts (`blockchain/package.json`):
- `preflight:sepolia`
- `deploy:sepolia`
- `verify:sepolia`
- `sync:frontend:sepolia`
- `deploy:sepolia:sync`
- `deploy:sepolia:full`
- `demo:tx:sepolia`

Implemented artifacts:
- `blockchain/deployed.sepolia.json`
- `blockchain/demo-tx.sepolia.json`

Docs in place:
- `docs/deploy-ready.md`
- `docs/demo-evidence.md`

## Current Sepolia Deployment Snapshot

From `blockchain/deployed.json` (redeployed under a rotated deployer key — see [Recent Fixes](#recent-fixes-and-engineering-history)):
- Network: Sepolia (`11155111`)
- ArtisanRegistry: `0xD9342a09b8Fa25Cd6d739f6dA20dA3C11D74Dbf8`
- DynamicRoyalty: `0xCBC803996C5576EF8f67764DfAf0c760645dC54E`
- ProductNFT: `0x1528Cc841C2F012c620dcBfb79Cc61eBde4c558C`
- EscrowMarketplace: `0x01B0Eb8e41533B8619d4e7e4C3993297849DBbee`
- ProductRegistry: `0x01658a22F94dbdD40218cA9a7d13cD77960f3cA0`

## Local Setup

## 1) Blockchain

```bash
cd blockchain
npm install
cp .env.example .env
```

Set in `blockchain/.env`:
- `ALCHEMY_SEPOLIA_URL`
- `PRIVATE_KEY`
- `ETHERSCAN_API_KEY` (optional, for verification)

Deploy and sync frontend env:

```bash
npm run deploy:sepolia:sync
```

Generate demo transactions:

```bash
npm run demo:tx:sepolia
```

## 2) Frontend

```bash
cd frontend
npm install
```

Create/update `frontend/.env.local` (running `npm run deploy:sepolia:sync` from `blockchain/` writes the five contract-address keys and chain id automatically):
- `NEXT_PUBLIC_ARTISAN_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_PRODUCT_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_PRODUCT_NFT_ADDRESS`
- `NEXT_PUBLIC_DYNAMIC_ROYALTY_ADDRESS`
- `NEXT_PUBLIC_ESCROW_MARKETPLACE_ADDRESS`
- `NEXT_PUBLIC_CHAIN_ID`
- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_WS_RPC_URL`
- `NEXT_PUBLIC_PINATA_JWT` / `PINATA_JWT` (IPFS pinning)
- `OPENAI_API_KEY` or `GEMINI_API_KEY` (AI terroir-scoring route)
- `NEXT_PUBLIC_VERCEL_URL` (optional)

Run locally:

```bash
npm run dev
```

Build check:

```bash
npm run build
```

## Demo Story (Implemented End-to-End)

1. Onboard artisan and show trust badges (Aadhaar, validator, reputation).
2. Register product with AI authenticity gate + on-chain provenance fields.
3. Transfer ownership with automatic royalty settlement.
4. Verify product trust trail and demonstrate nonce anti-replay.
5. Show live monitor and export evidence packet.

## Current Limitations (Known, Explicit)

- Aadhaar verification's on-chain step (`markAadhaarVerified`) is an owner/verifier-controlled flag, not on-chain proof verification — the frontend integrates the real Anon Aadhaar SDK to generate a proof, but the contract does not verify it.
- Onboarding is currently non-custodial browser-wallet based (not embedded auto-wallet creation).
- No server-side MPC/HSM key custody stack is implemented yet.
- Admin actions (slashing, Aadhaar verifier assignment, escrow dispute arbitration) are all gated by a single `onlyOwner` address, not a multisig or DAO.
- The AI verification route (`/api/verify-craft`) returns an error if no `OPENAI_API_KEY`/`GEMINI_API_KEY` is configured — there is no offline fallback scorer.
- `EscrowMarketplace.checkExpiry`'s Shipped-deadline branch routes to `Disputed` for owner arbitration rather than resolving automatically (a deliberate design choice — see [Recent Fixes](#recent-fixes-and-engineering-history)).

## Recent Fixes and Engineering History

This section documents real fixes found and applied while building out test coverage — kept here as evidence of the engineering process, not as an incident report.

- **Hardhat test suite added (0 → 153 tests).** All five contracts now have dedicated test files (`blockchain/test/*.test.js`) covering happy paths, access control, and edge cases — including an ECDSA attestation digest helper mirrored byte-for-byte from `ProductRegistry`'s signing logic, and a BigInt integer-sqrt oracle mirrored from `DynamicRoyalty`'s Solidity implementation.
- **DynamicRoyalty taper-seam bug found via testing, then fixed.** The precomputed royalty table originally covered only the first 10 resales; resales 11+ fell back to a `4000/sqrt(transferId)` formula that, at the seam, paid a *higher* royalty (1333 bps) than resale 10 (1200 bps) — an increase, contradicting the contract's own "decaying royalty" design. The table was extended from 10 to 15 entries so it fully covers the flat plateau of the formula in that range and hands off smoothly at resale 16. Verified monotonically non-increasing across the full curve by test.
- **EscrowMarketplace `checkExpiry` added.** Two states could previously freeze indefinitely if a party forgot to act: `Created` past its shipping deadline (buyer had to remember to call `cancelExpired`) and `Shipped` past its confirmation deadline (no recovery path existed at all). `checkExpiry` is a new, permissionless function callable by anyone once a deadline passes — it refunds the buyer for an expired `Created` escrow (reusing the existing refund path), and routes an expired `Shipped` escrow into `Disputed` for owner arbitration rather than resolving the outcome unilaterally.
- **Private-key-exposure vulnerability found and fixed.** `frontend/app/api/demo-qr/route.js` had a fallback chain that, if no demo secret env var was set, read `blockchain/.env` directly off disk and returned its `PRIVATE_KEY` value — the real Sepolia deployer key — in a public API response. The route no longer reads any `.env` file off disk; if no demo secret is configured it now fails closed with a `500`. The previously-exposed deployer key was rotated and all five contracts were redeployed under the new key.

## Notes

- Node.js 20/22 LTS is recommended for Hardhat stability.
- Frontend builds cleanly with Next.js production build.
