# Pramaan Demo Evidence

## Contract Addresses

Current deployment (redeployed under a rotated key after the private-key-exposure fix — see README's Recent Fixes section):
- Network: Sepolia (11155111)
- ArtisanRegistry: 0xD9342a09b8Fa25Cd6d739f6dA20dA3C11D74Dbf8
- DynamicRoyalty: 0xCBC803996C5576EF8f67764DfAf0c760645dC54E
- ProductNFT: 0x1528Cc841C2F012c620dcBfb79Cc61eBde4c558C
- EscrowMarketplace: 0x01B0Eb8e41533B8619d4e7e4C3993297849DBbee
- ProductRegistry: 0x01658a22F94dbdD40218cA9a7d13cD77960f3cA0
- Deployed At (UTC): 2026-09-02T12:38:13.519Z

## Deployment Transactions
- ArtisanRegistry deploy tx: https://sepolia.etherscan.io/tx/0x6640fb686a5ae47b93ce98fffc1f538846beb1de1aed7da886a6a7aaea7966f4
- ProductRegistry deploy tx: https://sepolia.etherscan.io/tx/0xfbc8d76cd2ce984abb86bab6111f6aa80a80521b402b32629aa89c75631cde2c

## Transaction Hashes

> **Stale — from the previous (pre-rotation) deployment.** These links point to the old ArtisanRegistry/ProductRegistry addresses and are kept only as a historical example of the expected transaction shapes. Run `npm run demo:tx:sepolia` from `blockchain/` against the current deployment to regenerate this section with fresh hashes before a live demo.
- Artisan registration: https://sepolia.etherscan.io/tx/0xd02da246905cdd5be269fdecddd434677a505b29ebf294d3cd20ff864dde4ba7
- Product registration: https://sepolia.etherscan.io/tx/0x9b79c8bae78170d89a48e09ef7bf60ab1da22387d4f3b5b8dee0279ff3563dea
- Transfer: https://sepolia.etherscan.io/tx/0x9fb731fe593ca7d49d031e9ab7b27fa4ed56cba84d227371ca53918ffb5a6487
- Nonce checkpoint (anti-clone): https://sepolia.etherscan.io/tx/0x0ff7cd05612a6d23681707c035a06b37d8f5b2225209951f023157314ab318b0

## Demo Data Snapshot

> Also stale, tied to the transaction hashes above — regenerate alongside them.
- Product Hash: 0x058c0a57701388c2ca545ab05255661bc2eee8060992b49f5687b0c25ed2a055
- Scan Nonce: 0x239ca4be0bf70b2f167a6e195012da4edef7d174942385f857c0a385a687d598

## Expected Screenshots
- Artisan success + tx link
- Product registration success + QR + nonce
- Verify page result + handler chain
- Transfer success + royalty breakdown
- Monitor page live event timeline
- Evidence page entries
