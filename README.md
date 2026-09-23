# Pramaan

Pramaan is a Sepolia-based provenance and trust platform for GI/craft products. It combines artisan identity verification, AI-assisted authenticity gating, on-chain product lifecycle tracking, dynamic royalties, an escrow marketplace, and internal monitoring/evidence tooling.

> **Glossary — "terroir score":** borrowed from wine/agriculture, where *terroir* describes how a product's origin and handling shape its authenticity. Here it's an AI-assessed 0–100 authenticity score (not a typo for "terror") gating product registration and NFT minting.

## Repository Structure

- `blockchain/`: Hardhat contracts, deployment scripts, env sync scripts, demo transaction generator.
- `frontend/`: Next.js App Router UI, API routes, web3 helpers, monitor/evidence/checklist pages.
- `docs/`: deployment runbook and demo evidence.

## What Is Implemented

## 1) Smart Contracts

Five contracts, all deployed together via `blockchain/scripts/deploy.js` with cross-contract wiring (ProductNFT registered as DynamicRoyalty's minter-registrar; EscrowMarketplace registered as its marketplace). All five are covered by a 157-test Hardhat suite — see [Recent Fixes](#recent-fixes-and-engineering-history) below.

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
- `/`: homepage with a "Get Started" CTA that routes by wallet/verification state — no wallet or unverified goes to `/artisan`, an already-verified artisan goes straight to `/register-product`.
- `/artisan`: wallet connect, trust badges, Aadhaar/validator actions, artisan registration, projected earnings panel.
- `/register-product`: image upload, hashing, AI verification call, on-chain registration, QR generation, certificate view.
- `/verify`: product lookup, trust status, custody history, terroir status, anti-replay nonce checkpoint; raw ledger fields (record hash, replay-protection nonce) are tucked behind a "Show technical details" toggle so the default view stays plain-language.
- `/retailer-verify`: counter-scan flow only — reads a signed QR/hash and verifies it against the chain.
- `/transfer`: escrow-only ownership transfer (create escrow → seller marks shipped → buyer confirms received), with a live royalty preview sourced from the contract's `previewSettlement`. Once escrow settles, a fresh product QR appears reflecting the post-transfer state. The older direct-transfer-with-manual-royalty-calculator UI still exists in code but is hidden behind an `ESCROW_ONLY_MODE` flag.

Operations/internal tooling:
- `/monitor`: live Sepolia event timeline (`ProductRegistered` + `ProductTransferred`).
- `/checklist`: quick links to every flow, plus a walkthrough of the anti-replay nonce-checkpoint demonstration.
- `/evidence`: local evidence collector with markdown export.

UI system implemented:
- Tailwind + shadcn-style component primitives (`Card`, `Button`, `Badge`, `Input`, `Select`).
- Dark-only design token system (canvas/surface background scale, brand green accent, semantic success/warning/danger pairs) — no light/dark toggle.
- Header navigation (`SiteHeader.js`) groups primary links by audience (Makers: Artisan/Register Product; Market: Retailer Verify/Verify/Transfer) as two segmented panes, with a shared passive wallet-address hook and a soft readiness indicator on Register Product for connected-but-unverified wallets.
- WCAG AA-checked placeholder/text contrast.

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

Create/update `frontend/.env.local` from `frontend/.env.example` (running `npm run deploy:sepolia:sync` from `blockchain/` writes the five contract-address keys and chain id automatically):

Contract addresses and chain:
- `NEXT_PUBLIC_ARTISAN_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_PRODUCT_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_PRODUCT_NFT_ADDRESS`
- `NEXT_PUBLIC_DYNAMIC_ROYALTY_ADDRESS`
- `NEXT_PUBLIC_ESCROW_MARKETPLACE_ADDRESS`
- `NEXT_PUBLIC_CHAIN_ID`
- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_WS_RPC_URL`

App URL / optional extras:
- `NEXT_PUBLIC_VERCEL_URL` (optional; public deployment URL shown in footer / used to build shareable links)
- `NEXT_PUBLIC_APP_URL` (optional; takes priority over `NEXT_PUBLIC_VERCEL_URL` for shareable transfer links if set)
- `NEXT_PUBLIC_CRAFT_MODEL_INFERENCE_URL` (optional model inference endpoint for craft scoring)
- `NEXT_PUBLIC_DEMO_PRODUCT_HASH` (optional; prefills an example product hash on `/verify`)

IPFS (Pinata):
- `NEXT_PUBLIC_PINATA_JWT` / `PINATA_JWT` — set both to the same token (client-side vs. server-side upload route)
- `NEXT_PUBLIC_PINATA_GATEWAY`

AI terroir-scoring route (`/api/verify-craft`) — no offline fallback if the selected provider's key is missing:
- `VISION_PROVIDER` (`openai` or `gemini`)
- `OPENAI_API_KEY`, `OPENAI_VISION_MODEL`
- `GEMINI_API_KEY`, `GEMINI_VISION_MODEL`

Anon Aadhaar identity verification (`/api/verify-aadhaar`):
- `NEXT_PUBLIC_ANON_AADHAAR_USE_TEST_MODE` / `ANON_AADHAAR_USE_TEST_MODE` — client widget vs. backend verifier; **must be set to the same value** (or both left unset), or the frontend proof widget and backend verifier check against different pubkey hashes (test vs. production UIDAI key); both default to `true` (test mode) if unset
- `NEXT_PUBLIC_AADHAAR_NULLIFIER_SEED` (any positive integer, must stay constant to keep nullifiers stable)
- `AADHAAR_VERIFIER_SIGNER_PRIVATE_KEY` — a **dedicated** wallet that calls `markAadhaarVerified` on behalf of verified proofs; distinct from `blockchain/.env`'s deployer `PRIVATE_KEY`, and only needs the `setAadhaarVerifier`-granted verifier role, never owner/deployer power; server-side only, never `NEXT_PUBLIC_`
- `KV_REST_API_URL` / `KV_REST_API_TOKEN` (Vercel KV) or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (Upstash for Redis) — anti-replay nullifier ledger; without one of these pairs, the route fails closed with a `503`

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
- The AI authenticity check (`/api/verify-craft`) verifies that an uploaded image visually depicts craft-in-progress (an artisan actively working, tools, workshop context) — it does not verify that the artisan captured the photo themselves. A plausible-looking photo of someone else's craft process (sourced from the web, stock photography, etc.) would pass identically to a genuine photo. No liveness/provenance-of-capture check (EXIF validation, reverse image search, live-capture-only enforcement, or a challenge-overlay requirement) is implemented.

## Recent Fixes and Engineering History

This section documents real fixes found and applied while building out test coverage — kept here as evidence of the engineering process, not as an incident report.

- **Hardhat test suite added (0 → 157 tests).** All five contracts now have dedicated test files (`blockchain/test/*.test.js`) covering happy paths, access control, and edge cases — including an ECDSA attestation digest helper mirrored byte-for-byte from `ProductRegistry`'s signing logic, and a BigInt integer-sqrt oracle mirrored from `DynamicRoyalty`'s Solidity implementation.
- **DynamicRoyalty taper-seam bug found via testing, then fixed.** The precomputed royalty table originally covered only the first 10 resales; resales 11+ fell back to a `4000/sqrt(transferId)` formula that, at the seam, paid a *higher* royalty (1333 bps) than resale 10 (1200 bps) — an increase, contradicting the contract's own "decaying royalty" design. The table was extended from 10 to 15 entries so it fully covers the flat plateau of the formula in that range and hands off smoothly at resale 16. Verified monotonically non-increasing across the full curve by test.
- **EscrowMarketplace `checkExpiry` added.** Two states could previously freeze indefinitely if a party forgot to act: `Created` past its shipping deadline (buyer had to remember to call `cancelExpired`) and `Shipped` past its confirmation deadline (no recovery path existed at all). `checkExpiry` is a new, permissionless function callable by anyone once a deadline passes — it refunds the buyer for an expired `Created` escrow (reusing the existing refund path), and routes an expired `Shipped` escrow into `Disputed` for owner arbitration rather than resolving the outcome unilaterally.
- **Private-key-exposure vulnerability found and fixed.** `frontend/app/api/demo-qr/route.js` had a fallback chain that, if no demo secret env var was set, read `blockchain/.env` directly off disk and returned its `PRIVATE_KEY` value — the real Sepolia deployer key — in a public API response. The route no longer reads any `.env` file off disk; if no demo secret is configured it now fails closed with a `500`. The previously-exposed deployer key was rotated and all five contracts were redeployed under the new key. (This route, and the retailer-side demo QR generator it backed, were later removed entirely as part of the post-hackathon real-user redesign — see below.)
- **Post-hackathon real-user redesign.** Once the hackathon ended, the app was re-audited from a real-user perspective instead of a judge-demo one: replaced the light theme with a dark-only design token system and rebuilt the header navigation (audience-grouped segmented nav, passive wallet-address hook shared across the header instead of each consumer polling independently, a soft readiness indicator instead of a hard redirect). Removed demo-only artifacts and jargon across the app — a fake-artisan-demo button on `/artisan`, the demo QR generator on `/retailer-verify` (with the private-key-exposure route it depended on), a "Terroir Score Demo" card and raw ledger fields (now behind a "Show technical details" toggle) on `/verify`, and blockchain jargon on `/register-product` — and replaced a silent `router.replace` auto-redirect on `/artisan` with an explicit banner, plus made the homepage `<h1>` a real heading and its "Get Started" CTA route by actual wallet/verification state instead of always pointing at the same page.
- **Real per-product QR code generator added, replacing the removed demo QR.** A shared `components/ProductQrCode.js` (backed by `buildVerifyUrl()` in `src/utils/url.js`) renders a scannable, absolute-URL QR — encoded with `qrcode.react`'s `QRCodeCanvas` so it also supports a "Download QR" PNG button — that opens `/verify?hash=...` and auto-runs verification when scanned by a real phone camera, not just the app's own in-app scanner. It's wired into two places: `/register-product`'s success card (QR for the product's freshly-registered state) and `/transfer`'s escrow flow, where a second QR appears once an escrow actually **settles** (`escrowStep >= 4`), reflecting the post-transfer state — new owner, incremented transfer count, updated terroir/trust score — rather than stale pre-transfer data. This also replaced a dead, non-functional `"Generate Retailer QR"` button on `/transfer` that was left over from the old demo-QR feature (it linked to `/retailer-verify?productHash=...`, a query param that page never even read) and updated `/checklist`'s Retailer Verify entry to describe the real flow instead of the removed demo QR.
- **`/transfer` token auto-lookup fixed (`eth_getLogs` → Alchemy NFT API).** `findLatestMintedTokenIdByRecipient` scanned `Transfer`/`ProductMinted` logs with a 20,000-block `eth_getLogs` window, but Alchemy's free tier caps `eth_getLogs` at 10 blocks — every request failed with a 400 and the loop silently retried up to 25 times before giving up with no visible error. Replaced with Alchemy's `getNFTsForOwner` NFT API (current ownership state, no block-range limit), deriving the NFT API base URL from the existing RPC URL so no extra env var is needed.
- **`/transfer` Create Escrow raw-error leak fixed.** A reported crash ("Cannot read properties of undefined (reading 'toString')" shown as literal text in the UI) traced back to the escrow flow's error-message pipeline having no catch-all: any unrecognized JS runtime error fell through to being displayed verbatim instead of a friendly message. Added a raw-JS-error pattern check that substitutes a friendly fallback, tightened the token-ID/amount precondition checks from truthiness to actual validity, and wrapped a previously-unguarded wallet-address lookup in a try/catch.
- **Concurrent wallet-connect race fixed.** Multiple components independently calling the wallet-connect flow at once could trigger MetaMask's "already processing eth_requestAccounts" error, which surfaced as raw error text. Fixed with an in-flight-request singleton so concurrent callers share one pending connection instead of each firing their own.
- **Aadhaar nullifier store moved off local disk.** `/api/verify-aadhaar`'s anti-replay ledger (ties one Aadhaar identity to one wallet forever) was a flat JSON file at `blockchain/aadhaar-nullifiers.json` — a path outside the deployed Vercel project root (`frontend/`), on a filesystem that's ephemeral and largely read-only for serverless functions. In production this either failed to write or silently lost the anti-replay guarantee across cold starts. Replaced with a Redis-backed store (`frontend/src/utils/nullifierStore.js`, Vercel KV or Upstash Redis) using an atomic `SET ... NX` claim, so the guarantee now holds across serverless instances instead of just within one warm process. The route fails closed with a `503` if no KV/Upstash env vars are configured, rather than silently accepting unverifiable requests.
- **`@anon-aadhaar/core` and `ethers` externalized from server bundling.** Webpack bundling `/api/verify-aadhaar`'s route handler broke both dependencies: `@anon-aadhaar/core` (via snarkjs/web-worker) has environment-dependent dynamic requires webpack can't statically bundle, hanging proof verification indefinitely; `ethers` picks up its "browser" package.json remap under webpack, swapping its Node http/https transport for a `fetch()`-based one whose browser-only `RequestInit` fields break POST requests with a body under Node's fetch, surfacing as `SERVER_ERROR`/"missing response" on every JSON-RPC call. Marked both as `serverExternalPackages` in `frontend/next.config.js` so Node's native `require` resolves them at runtime instead.
- **`markAadhaarVerified` hardened against RPC fragility, then debugged through a multi-round "missing revert data" investigation.** After the bundling fix, the on-chain call was hardened (static JSON-RPC provider with explicit chain id, provider/signer/contract built once at module load, explicit gas fields, retry-with-backoff on send) and given a `callStatic` preflight to decode real revert reasons instead of surfacing ethers' generic failure — both to give actionable errors and to stop burning Sepolia ETH retrying permanently-failing sends. The decoded-revert path then chased an opaque, undecoded "missing revert data in call exception" through several distinct root causes: a Wallet-connected `callStatic`'s own affordability preflight masking the real reason when the signer lacked funds; the true root cause turning out to be an ordering bug where `/artisan` (and the route's own fallback) could call `markAadhaarVerified` before `registerArtisan` had ever run, which `ArtisanRegistry` rejects; and, after that fix, transient RPC read failures against this specific serverless runtime that a local reproduction never hit. Fixes landed in order: signer-authorization/balance diagnostics reported alongside any failure, transaction-hash/error-code logging to distinguish a preflight failure from a mined-then-reverted send, gating `/artisan`'s manual and auto-sync Aadhaar calls behind `isArtisanRegistered` (plus a defense-in-depth `diagnoseTargetArtisanIssue` check in the route itself), retry-with-backoff on every plain diagnostic read, and finally replacing the route's Wallet-connected reads with a single Provider-connected `artisanRegistryReader` (with an explicit `from` override for the callStatic preflight) — matching how every successful local reproduction had run the calls, and leaving only the real send on the Wallet-connected contract.

## Notes

- Node.js 20/22 LTS is recommended for Hardhat stability.
- Frontend builds cleanly with Next.js production build.
