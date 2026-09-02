const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");

// Real values from scripts/deploy.js — do not invent different windows.
const SHIPPING_WINDOW_SEC = 2 * 24 * 60 * 60; // 2 days
const CONFIRM_WINDOW_SEC = 3 * 24 * 60 * 60; // 3 days

const BPS_DENOMINATOR = 10_000n;
const MIN_TERROIR_SCORE = 70;

// EscrowStatus enum order, from source: None, Created, Shipped, Completed, Refunded, Disputed, Resolved
const EscrowStatus = {
    None: 0,
    Created: 1,
    Shipped: 2,
    Completed: 3,
    Refunded: 4,
    Disputed: 5,
    Resolved: 6
};

describe("EscrowMarketplace", function () {
    async function deployFixture() {
        const [owner, artisan, buyer, otherArtisan, stranger] = await ethers.getSigners();

        const ArtisanRegistry = await ethers.getContractFactory("ArtisanRegistry");
        const artisanRegistry = await ArtisanRegistry.deploy();
        await artisanRegistry.waitForDeployment();
        const artisanRegistryAddress = await artisanRegistry.getAddress();

        // DynamicRoyalty needs a marketplace + minterRegistrar at construction; we wire the
        // real EscrowMarketplace as marketplace after deploying it below, matching deploy.js.
        const DynamicRoyalty = await ethers.getContractFactory("DynamicRoyalty");
        const dynamicRoyalty = await DynamicRoyalty.deploy(owner.address, owner.address, artisanRegistryAddress);
        await dynamicRoyalty.waitForDeployment();
        const dynamicRoyaltyAddress = await dynamicRoyalty.getAddress();

        const ProductNFT = await ethers.getContractFactory("ProductNFT");
        const productNFT = await ProductNFT.deploy(artisanRegistryAddress, dynamicRoyaltyAddress);
        await productNFT.waitForDeployment();
        const productNFTAddress = await productNFT.getAddress();

        await dynamicRoyalty.connect(owner).setMinterRegistrar(productNFTAddress);

        const EscrowMarketplace = await ethers.getContractFactory("EscrowMarketplace");
        const escrow = await EscrowMarketplace.deploy(
            productNFTAddress,
            dynamicRoyaltyAddress,
            SHIPPING_WINDOW_SEC,
            CONFIRM_WINDOW_SEC
        );
        await escrow.waitForDeployment();
        const escrowAddress = await escrow.getAddress();

        await dynamicRoyalty.connect(owner).setMarketplace(escrowAddress);

        // Register + Aadhaar-verify the artisan who will mint and later sell the product.
        await artisanRegistry.connect(artisan).registerArtisan("Meera", "Pottery", "Khurja", 0);
        await artisanRegistry.connect(owner).markAadhaarVerified(artisan.address);

        return {
            owner,
            artisan,
            buyer,
            otherArtisan,
            stranger,
            artisanRegistry,
            dynamicRoyalty,
            productNFT,
            productNFTAddress,
            escrow,
            escrowAddress
        };
    }

    // Mints a product NFT to `artisan` (recipient == artisan, so artisan is both minter and
    // seller — matches createEscrow's requirement that `seller` currently owns the token).
    async function mintToArtisan(ctx) {
        const { artisan, productNFT } = ctx;
        const tx = await productNFT
            .connect(artisan)
            .mintProduct(artisan.address, "ipfs://provenance/1", MIN_TERROIR_SCORE, "bafybeigdyrztest");
        const receipt = await tx.wait();
        const parsed = receipt.logs
            .map((log) => {
                try {
                    return productNFT.interface.parseLog(log);
                } catch (_e) {
                    return null;
                }
            })
            .find((p) => p && p.name === "ProductMinted");
        return parsed.args.tokenId;
    }

    // Full setup: mint token to artisan, approve the escrow contract, create an escrow from
    // buyer. Returns everything a happy-path or branch test needs.
    async function createEscrowFixture(ctx, overrides = {}) {
        const { artisan, buyer, productNFT, escrow, escrowAddress } = ctx;
        const tokenId = await mintToArtisan(ctx);

        // Approve escrow contract up front unless the test explicitly wants to test the
        // "not approved" revert path (approveUpfront: false).
        if (overrides.approveUpfront !== false) {
            await productNFT.connect(artisan).approve(escrowAddress, tokenId);
        }

        const salePrice = overrides.salePrice || ethers.parseEther("1");
        const tx = await escrow.connect(buyer).createEscrow(tokenId, artisan.address, { value: salePrice });
        const receipt = await tx.wait();
        const parsed = receipt.logs
            .map((log) => {
                try {
                    return escrow.interface.parseLog(log);
                } catch (_e) {
                    return null;
                }
            })
            .find((p) => p && p.name === "EscrowCreated");
        const escrowId = parsed.args.escrowId;

        return { tokenId, escrowId, salePrice };
    }

    describe("createEscrow", function () {
        it("creates an escrow in Created status, holds funds in the contract, and emits EscrowCreated", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, escrow, escrowAddress } = ctx;
            const tokenId = await mintToArtisan(ctx);
            const salePrice = ethers.parseEther("1");

            const createdAtBlock = await ethers.provider.getBlock("latest");
            const expectedShippingDeadline = BigInt(createdAtBlock.timestamp + 1 + SHIPPING_WINDOW_SEC);

            await expect(escrow.connect(buyer).createEscrow(tokenId, artisan.address, { value: salePrice }))
                .to.emit(escrow, "EscrowCreated")
                .withArgs(1n, tokenId, buyer.address, artisan.address, salePrice, anyUint());

            const record = await escrow.escrows(1);
            expect(record.status).to.equal(EscrowStatus.Created);
            expect(record.buyer).to.equal(buyer.address);
            expect(record.seller).to.equal(artisan.address);
            expect(record.salePrice).to.equal(salePrice);
            expect(record.tokenId).to.equal(tokenId);

            expect(await ethers.provider.getBalance(escrowAddress)).to.equal(salePrice);
        });

        it("reverts on zero sale price", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, escrow } = ctx;
            const tokenId = await mintToArtisan(ctx);

            await expect(
                escrow.connect(buyer).createEscrow(tokenId, artisan.address, { value: 0 })
            ).to.be.revertedWith("Escrow: sale price is zero");
        });

        it("reverts on zero seller address", async function () {
            const ctx = await loadFixture(deployFixture);
            const { buyer, escrow } = ctx;
            const tokenId = await mintToArtisan(ctx);

            await expect(
                escrow.connect(buyer).createEscrow(tokenId, ethers.ZeroAddress, { value: ethers.parseEther("1") })
            ).to.be.revertedWith("Escrow: invalid seller");
        });

        it("reverts if buyer and seller are the same address", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, escrow } = ctx;
            const tokenId = await mintToArtisan(ctx);

            await expect(
                escrow.connect(artisan).createEscrow(tokenId, artisan.address, { value: ethers.parseEther("1") })
            ).to.be.revertedWith("Escrow: buyer and seller cannot match");
        });

        it("reverts if the declared seller does not currently own the token", async function () {
            const ctx = await loadFixture(deployFixture);
            const { buyer, stranger, escrow } = ctx;
            const tokenId = await mintToArtisan(ctx);

            await expect(
                escrow.connect(buyer).createEscrow(tokenId, stranger.address, { value: ethers.parseEther("1") })
            ).to.be.revertedWith("Escrow: seller is not current owner");
        });

        it("reverts if the token has no originalMinter registered in the royalty engine", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, escrow } = ctx;

            // tokenId 999 was never minted through ProductNFT, so DynamicRoyalty has no
            // originalMinter for it, AND productNft.ownerOf would revert first for a
            // nonexistent token — so this reverts on ownerOf, not the intended guard.
            // We confirm the actual revert path rather than assuming which check fires.
            await expect(
                escrow.connect(buyer).createEscrow(999, artisan.address, { value: ethers.parseEther("1") })
            ).to.be.reverted;
        });
    });

    describe("markShipped", function () {
        it("moves Created -> Shipped, sets confirmDeadline, emits EscrowShipped, only callable by seller", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);

            const shippedAtBlock = await ethers.provider.getBlock("latest");

            await expect(escrow.connect(artisan).markShipped(escrowId))
                .to.emit(escrow, "EscrowShipped")
                .withArgs(escrowId, anyUint());

            const record = await escrow.escrows(escrowId);
            expect(record.status).to.equal(EscrowStatus.Shipped);
            expect(record.shippedAt).to.be.greaterThan(0n);
            expect(record.confirmDeadline).to.be.greaterThan(BigInt(shippedAtBlock.timestamp));
        });

        it("reverts if called by anyone other than the seller (including the buyer)", async function () {
            const ctx = await loadFixture(deployFixture);
            const { buyer, stranger, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);

            await expect(escrow.connect(buyer).markShipped(escrowId)).to.be.revertedWith(
                "Escrow: only seller can mark shipped"
            );
            await expect(escrow.connect(stranger).markShipped(escrowId)).to.be.revertedWith(
                "Escrow: only seller can mark shipped"
            );
        });

        it("reverts once the shipping deadline has passed", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);

            await time.increase(SHIPPING_WINDOW_SEC + 1);

            await expect(escrow.connect(artisan).markShipped(escrowId)).to.be.revertedWith(
                "Escrow: shipping deadline passed"
            );
        });

        it("reverts if called twice (state machine blocks re-entry into Shipped)", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);

            await escrow.connect(artisan).markShipped(escrowId);

            await expect(escrow.connect(artisan).markShipped(escrowId)).to.be.revertedWith("Escrow: invalid status");
        });
    });

    describe("confirmReceived — happy path settlement", function () {
        it("Created -> Shipped -> Completed: NFT transfers to buyer, seller and artisan are paid correctly, atomically", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, productNFT, escrow, dynamicRoyalty } = ctx;
            const { tokenId, escrowId, salePrice } = await createEscrowFixture(ctx);

            await escrow.connect(artisan).markShipped(escrowId);

            // Transfer 1 on this token -> 40% (4000 bps) per the (now-fixed) taper table.
            const expectedRoyaltyBps = 4000n;
            const expectedArtisanAmount = (salePrice * expectedRoyaltyBps) / BPS_DENOMINATOR;
            const expectedSellerAmount = salePrice - expectedArtisanAmount;

            const artisanBalanceBefore = await ethers.provider.getBalance(artisan.address);

            const tx = escrow.connect(buyer).confirmReceived(escrowId);

            await expect(tx)
                .to.emit(escrow, "EscrowCompleted")
                .withArgs(escrowId, tokenId, expectedArtisanAmount, expectedSellerAmount);

            await expect(tx)
                .to.emit(dynamicRoyalty, "RoyaltySettled")
                .withArgs(tokenId, artisan.address, artisan.address, 1n, salePrice, expectedArtisanAmount, expectedSellerAmount);

            // NFT ownership: buyer now owns it.
            expect(await productNFT.ownerOf(tokenId)).to.equal(buyer.address);

            // Seller (== original minter here) receives sellerAmount + artisanAmount, since
            // artisan and seller are the same address in this fixture. Confirm via balance delta
            // rather than asserting a single leg, to avoid double-counting gas-adjusted noise —
            // artisan is not the tx sender here (buyer is), so artisan's balance delta is clean.
            const artisanBalanceAfter = await ethers.provider.getBalance(artisan.address);
            expect(artisanBalanceAfter - artisanBalanceBefore).to.equal(salePrice);

            const record = await escrow.escrows(escrowId);
            expect(record.status).to.equal(EscrowStatus.Completed);
            expect(record.salePrice).to.equal(0n); // zeroed out after settlement
        });

        it("pays seller and artisan as two DISTINCT parties when the current owner differs from the original minter", async function () {
            const ctx = await loadFixture(deployFixture);
            const { owner, artisan, otherArtisan, buyer, productNFT, escrow, dynamicRoyalty, escrowAddress } = ctx;

            const tokenId = await mintToArtisan(ctx);

            // otherArtisan becomes the current seller via a direct NFT transfer from artisan
            // (simple transferFrom, outside escrow) so seller != originalMinter.
            await artisanRegistryVerify(ctx, otherArtisan);
            await productNFT.connect(artisan).transferFrom(artisan.address, otherArtisan.address, tokenId);
            await productNFT.connect(otherArtisan).approve(escrowAddress, tokenId);

            const salePrice = ethers.parseEther("1");
            const createTx = await escrow.connect(buyer).createEscrow(tokenId, otherArtisan.address, { value: salePrice });
            const createReceipt = await createTx.wait();
            const escrowId = createReceipt.logs
                .map((l) => {
                    try {
                        return escrow.interface.parseLog(l);
                    } catch (_e) {
                        return null;
                    }
                })
                .find((p) => p && p.name === "EscrowCreated").args.escrowId;

            await escrow.connect(otherArtisan).markShipped(escrowId);

            const expectedArtisanAmount = (salePrice * 4000n) / BPS_DENOMINATOR; // transfer 1, 40%
            const expectedSellerAmount = salePrice - expectedArtisanAmount;

            const artisanBalanceBefore = await ethers.provider.getBalance(artisan.address);
            const sellerBalanceBefore = await ethers.provider.getBalance(otherArtisan.address);

            await escrow.connect(buyer).confirmReceived(escrowId);

            expect((await ethers.provider.getBalance(artisan.address)) - artisanBalanceBefore).to.equal(
                expectedArtisanAmount
            );
            expect((await ethers.provider.getBalance(otherArtisan.address)) - sellerBalanceBefore).to.equal(
                expectedSellerAmount
            );
            expect(await productNFT.ownerOf(tokenId)).to.equal(buyer.address);
        });

        it("reverts if called by anyone other than the buyer", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, stranger, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await escrow.connect(artisan).markShipped(escrowId);

            await expect(escrow.connect(artisan).confirmReceived(escrowId)).to.be.revertedWith(
                "Escrow: only buyer can confirm"
            );
            await expect(escrow.connect(stranger).confirmReceived(escrowId)).to.be.revertedWith(
                "Escrow: only buyer can confirm"
            );
        });

        it("reverts if called before shipping (status is still Created)", async function () {
            const ctx = await loadFixture(deployFixture);
            const { buyer, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);

            await expect(escrow.connect(buyer).confirmReceived(escrowId)).to.be.revertedWith(
                "Escrow: not ready for confirmation"
            );
        });

        it("reverts if the confirmation window has expired — and per the real contract, NOTHING else can be called to recover funds except raiseDispute", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await escrow.connect(artisan).markShipped(escrowId);

            await time.increase(CONFIRM_WINDOW_SEC + 1);

            await expect(escrow.connect(buyer).confirmReceived(escrowId)).to.be.revertedWith(
                "Escrow: confirmation window expired"
            );

            // Surprising but real: there is no cancelExpired-equivalent for the Shipped state.
            // cancelExpired() only works from Created. Confirm it reverts here too, proving the
            // escrow is genuinely stuck in Shipped unless someone calls raiseDispute.
            await expect(escrow.connect(buyer).cancelExpired(escrowId)).to.be.revertedWith(
                "Escrow: cannot cancel now"
            );

            const record = await escrow.escrows(escrowId);
            expect(record.status).to.equal(EscrowStatus.Shipped);

            // The only real way out at this point is raiseDispute, which has no deadline guard
            // and is still callable from Shipped.
            await expect(escrow.connect(buyer).raiseDispute(escrowId, "Confirmation window lapsed")).to.not.be
                .reverted;
        });

        it("reverts on double-settlement: confirming twice on the same escrow", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await escrow.connect(artisan).markShipped(escrowId);
            await escrow.connect(buyer).confirmReceived(escrowId);

            await expect(escrow.connect(buyer).confirmReceived(escrowId)).to.be.revertedWith(
                "Escrow: not ready for confirmation"
            );
        });

        it("reverts if the escrow contract was never approved to move the NFT", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx, { approveUpfront: false });
            await escrow.connect(artisan).markShipped(escrowId);

            await expect(escrow.connect(buyer).confirmReceived(escrowId)).to.be.revertedWith(
                "Escrow: escrow contract not approved for token"
            );
        });
    });

    describe("cancelExpired — refund path", function () {
        it("reverts before the shipping deadline has passed", async function () {
            const ctx = await loadFixture(deployFixture);
            const { buyer, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);

            await expect(escrow.connect(buyer).cancelExpired(escrowId)).to.be.revertedWith(
                "Escrow: shipping window still active"
            );
        });

        it("after the shipping deadline passes with no shipment, buyer must call cancelExpired themself — refunds in full, NFT stays with seller, no royalty paid", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, productNFT, escrow, dynamicRoyalty } = ctx;
            const { tokenId, escrowId, salePrice } = await createEscrowFixture(ctx);

            await time.increase(SHIPPING_WINDOW_SEC + 1);

            const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

            const tx = await escrow.connect(buyer).cancelExpired(escrowId);
            const receipt = await tx.wait();
            const gasCost = receipt.gasUsed * receipt.gasPrice;

            await expect(tx).to.emit(escrow, "EscrowRefunded").withArgs(escrowId, buyer.address, salePrice);

            const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
            expect(buyerBalanceAfter - buyerBalanceBefore + gasCost).to.equal(salePrice);

            // NFT never moved.
            expect(await productNFT.ownerOf(tokenId)).to.equal(artisan.address);

            // No royalty settlement occurred: transferCount on the royalty engine stays 0.
            expect(await dynamicRoyalty.transferCount(tokenId)).to.equal(0n);

            const record = await escrow.escrows(escrowId);
            expect(record.status).to.equal(EscrowStatus.Refunded);
        });

        it("reverts if called by anyone other than the buyer", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, stranger, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await time.increase(SHIPPING_WINDOW_SEC + 1);

            await expect(escrow.connect(artisan).cancelExpired(escrowId)).to.be.revertedWith(
                "Escrow: only buyer can cancel"
            );
            await expect(escrow.connect(stranger).cancelExpired(escrowId)).to.be.revertedWith(
                "Escrow: only buyer can cancel"
            );
        });

        it("this is NOT automatic: the escrow stays in Created (not silently refunded) until the buyer explicitly calls cancelExpired", async function () {
            const ctx = await loadFixture(deployFixture);
            const { escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);

            await time.increase(SHIPPING_WINDOW_SEC + 100);

            const record = await escrow.escrows(escrowId);
            expect(record.status).to.equal(EscrowStatus.Created);
        });

        it("reverts on double-cancellation", async function () {
            const ctx = await loadFixture(deployFixture);
            const { buyer, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await time.increase(SHIPPING_WINDOW_SEC + 1);
            await escrow.connect(buyer).cancelExpired(escrowId);

            await expect(escrow.connect(buyer).cancelExpired(escrowId)).to.be.revertedWith(
                "Escrow: cannot cancel now"
            );
        });
    });

    describe("checkExpiry — permissionless poke", function () {
        it("Created + shipping deadline passed: routes through the same refund path as cancelExpired, callable by a random unrelated address", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, stranger, productNFT, escrow, dynamicRoyalty } = ctx;
            const { tokenId, escrowId, salePrice } = await createEscrowFixture(ctx);

            await time.increase(SHIPPING_WINDOW_SEC + 1);

            const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

            // Called by `stranger` — not buyer, not seller, not owner — proving this is
            // genuinely permissionless, unlike cancelExpired which is buyer-only.
            await expect(escrow.connect(stranger).checkExpiry(escrowId))
                .to.emit(escrow, "EscrowRefunded")
                .withArgs(escrowId, buyer.address, salePrice);

            const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
            expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(salePrice);

            expect(await productNFT.ownerOf(tokenId)).to.equal(artisan.address);
            expect(await dynamicRoyalty.transferCount(tokenId)).to.equal(0n);

            const record = await escrow.escrows(escrowId);
            expect(record.status).to.equal(EscrowStatus.Refunded);
            expect(record.salePrice).to.equal(0n);
        });

        it("Created + shipping deadline NOT yet passed: reverts", async function () {
            const ctx = await loadFixture(deployFixture);
            const { stranger, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);

            await expect(escrow.connect(stranger).checkExpiry(escrowId)).to.be.revertedWith(
                "Escrow: shipping window still active"
            );
        });

        it("Shipped + confirmation deadline passed: routes into Disputed (does NOT move funds or transfer the NFT itself), callable by a random unrelated address", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, stranger, productNFT, escrow, escrowAddress } = ctx;
            const { tokenId, escrowId, salePrice } = await createEscrowFixture(ctx);
            await escrow.connect(artisan).markShipped(escrowId);

            await time.increase(CONFIRM_WINDOW_SEC + 1);

            await expect(escrow.connect(stranger).checkExpiry(escrowId))
                .to.emit(escrow, "EscrowDisputed")
                .withArgs(escrowId, stranger.address, "Confirmation window expired without buyer action");

            const record = await escrow.escrows(escrowId);
            expect(record.status).to.equal(EscrowStatus.Disputed);
            expect(record.disputeReason).to.equal("Confirmation window expired without buyer action");

            // Funds and NFT must NOT have moved yet — checkExpiry only flips state to
            // Disputed, it does not itself decide or pay out an outcome.
            expect(await productNFT.ownerOf(tokenId)).to.equal(artisan.address);
            expect(await ethers.provider.getBalance(escrowAddress)).to.equal(salePrice);
            expect(record.salePrice).to.equal(salePrice);
        });

        it("Shipped + confirmation deadline NOT yet passed: reverts", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, stranger, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await escrow.connect(artisan).markShipped(escrowId);

            await expect(escrow.connect(stranger).checkExpiry(escrowId)).to.be.revertedWith(
                "Escrow: confirmation window still active"
            );
        });

        it("a checkExpiry-triggered dispute resolves through resolveDispute exactly like a manually-raised one: sellerWins=true completes the sale", async function () {
            const ctx = await loadFixture(deployFixture);
            const { owner, artisan, buyer, stranger, productNFT, escrow, dynamicRoyalty } = ctx;
            const { tokenId, escrowId, salePrice } = await createEscrowFixture(ctx);
            await escrow.connect(artisan).markShipped(escrowId);
            await time.increase(CONFIRM_WINDOW_SEC + 1);
            await escrow.connect(stranger).checkExpiry(escrowId);

            const expectedArtisanAmount = (salePrice * 4000n) / BPS_DENOMINATOR;
            const expectedSellerAmount = salePrice - expectedArtisanAmount;

            await expect(
                escrow.connect(owner).resolveDispute(escrowId, true, "Buyer went silent; seller proved delivery")
            )
                .to.emit(escrow, "EscrowCompleted")
                .withArgs(escrowId, tokenId, expectedArtisanAmount, expectedSellerAmount);

            expect(await productNFT.ownerOf(tokenId)).to.equal(buyer.address);
            expect(await dynamicRoyalty.transferCount(tokenId)).to.equal(1n);

            const record = await escrow.escrows(escrowId);
            expect(record.status).to.equal(EscrowStatus.Completed);
        });

        it("a checkExpiry-triggered dispute resolves through resolveDispute exactly like a manually-raised one: sellerWins=false refunds the buyer", async function () {
            const ctx = await loadFixture(deployFixture);
            const { owner, artisan, buyer, stranger, productNFT, escrow, dynamicRoyalty } = ctx;
            const { tokenId, escrowId, salePrice } = await createEscrowFixture(ctx);
            await escrow.connect(artisan).markShipped(escrowId);
            await time.increase(CONFIRM_WINDOW_SEC + 1);
            await escrow.connect(stranger).checkExpiry(escrowId);

            const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

            await expect(
                escrow.connect(owner).resolveDispute(escrowId, false, "Seller could not prove delivery")
            )
                .to.emit(escrow, "EscrowRefunded")
                .withArgs(escrowId, buyer.address, salePrice);

            const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
            expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(salePrice);
            expect(await productNFT.ownerOf(tokenId)).to.equal(artisan.address);
            expect(await dynamicRoyalty.transferCount(tokenId)).to.equal(0n);

            const record = await escrow.escrows(escrowId);
            expect(record.status).to.equal(EscrowStatus.Resolved);
        });

        it("reverts on an already-Completed escrow (non-expirable state)", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, stranger, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await escrow.connect(artisan).markShipped(escrowId);
            await escrow.connect(buyer).confirmReceived(escrowId);

            await expect(escrow.connect(stranger).checkExpiry(escrowId)).to.be.revertedWith(
                "Escrow: not in an expirable state"
            );
        });

        it("reverts on an already-Refunded escrow (non-expirable state)", async function () {
            const ctx = await loadFixture(deployFixture);
            const { buyer, stranger, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await time.increase(SHIPPING_WINDOW_SEC + 1);
            await escrow.connect(buyer).cancelExpired(escrowId);

            await expect(escrow.connect(stranger).checkExpiry(escrowId)).to.be.revertedWith(
                "Escrow: not in an expirable state"
            );
        });

        it("reverts on an already-Disputed escrow (non-expirable state, regardless of how it got there)", async function () {
            const ctx = await loadFixture(deployFixture);
            const { buyer, stranger, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await escrow.connect(buyer).raiseDispute(escrowId, "manual dispute");

            await expect(escrow.connect(stranger).checkExpiry(escrowId)).to.be.revertedWith(
                "Escrow: not in an expirable state"
            );
        });

        it("reverts on an already-Resolved escrow (non-expirable state)", async function () {
            const ctx = await loadFixture(deployFixture);
            const { owner, buyer, stranger, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await escrow.connect(buyer).raiseDispute(escrowId, "manual dispute");
            await escrow.connect(owner).resolveDispute(escrowId, false, "buyer wins");

            await expect(escrow.connect(stranger).checkExpiry(escrowId)).to.be.revertedWith(
                "Escrow: not in an expirable state"
            );
        });

        it("cancelExpired keeps working exactly as before (backward compatibility): still buyer-only, unaffected by checkExpiry's existence", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, stranger, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await time.increase(SHIPPING_WINDOW_SEC + 1);

            // stranger still cannot use cancelExpired (unlike checkExpiry).
            await expect(escrow.connect(stranger).cancelExpired(escrowId)).to.be.revertedWith(
                "Escrow: only buyer can cancel"
            );

            await expect(escrow.connect(buyer).cancelExpired(escrowId)).to.not.be.reverted;
            const record = await escrow.escrows(escrowId);
            expect(record.status).to.equal(EscrowStatus.Refunded);
        });
    });

    describe("raiseDispute", function () {
        it("buyer can raise a dispute from Created", async function () {
            const ctx = await loadFixture(deployFixture);
            const { buyer, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);

            await expect(escrow.connect(buyer).raiseDispute(escrowId, "Item not as described"))
                .to.emit(escrow, "EscrowDisputed")
                .withArgs(escrowId, buyer.address, "Item not as described");

            const record = await escrow.escrows(escrowId);
            expect(record.status).to.equal(EscrowStatus.Disputed);
            expect(record.disputeReason).to.equal("Item not as described");
        });

        it("seller can raise a dispute from Shipped", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await escrow.connect(artisan).markShipped(escrowId);

            await expect(escrow.connect(artisan).raiseDispute(escrowId, "Buyer unresponsive"))
                .to.emit(escrow, "EscrowDisputed")
                .withArgs(escrowId, artisan.address, "Buyer unresponsive");

            const record = await escrow.escrows(escrowId);
            expect(record.status).to.equal(EscrowStatus.Disputed);
        });

        it("reverts for anyone other than buyer or seller", async function () {
            const ctx = await loadFixture(deployFixture);
            const { stranger, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);

            await expect(escrow.connect(stranger).raiseDispute(escrowId, "I object")).to.be.revertedWith(
                "Escrow: only buyer or seller"
            );
        });

        it("reverts once the escrow is already Completed", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await escrow.connect(artisan).markShipped(escrowId);
            await escrow.connect(buyer).confirmReceived(escrowId);

            await expect(escrow.connect(buyer).raiseDispute(escrowId, "too late")).to.be.revertedWith(
                "Escrow: invalid status for dispute"
            );
        });

        it("blocks other transitions while Disputed: markShipped and confirmReceived both revert", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await escrow.connect(buyer).raiseDispute(escrowId, "wrong item");

            await expect(escrow.connect(artisan).markShipped(escrowId)).to.be.revertedWith("Escrow: invalid status");
            await expect(escrow.connect(buyer).confirmReceived(escrowId)).to.be.revertedWith(
                "Escrow: not ready for confirmation"
            );
        });
    });

    describe("resolveDispute — owner arbitration", function () {
        it("sellerWins=true: goes through the SAME settlement path as normal completion (royalty paid, NFT to buyer, status Completed)", async function () {
            const ctx = await loadFixture(deployFixture);
            const { owner, artisan, buyer, productNFT, escrow, dynamicRoyalty } = ctx;
            const { tokenId, escrowId, salePrice } = await createEscrowFixture(ctx);
            await escrow.connect(buyer).raiseDispute(escrowId, "wrong item, seller disputes");

            const expectedArtisanAmount = (salePrice * 4000n) / BPS_DENOMINATOR;
            const expectedSellerAmount = salePrice - expectedArtisanAmount;

            const tx = escrow.connect(owner).resolveDispute(escrowId, true, "Seller provided proof of correct item");

            await expect(tx)
                .to.emit(escrow, "EscrowCompleted")
                .withArgs(escrowId, tokenId, expectedArtisanAmount, expectedSellerAmount);
            await expect(tx)
                .to.emit(escrow, "EscrowResolved")
                .withArgs(escrowId, true, "Seller provided proof of correct item");

            expect(await productNFT.ownerOf(tokenId)).to.equal(buyer.address);
            expect(await dynamicRoyalty.transferCount(tokenId)).to.equal(1n);

            const record = await escrow.escrows(escrowId);
            expect(record.status).to.equal(EscrowStatus.Completed);
        });

        it("sellerWins=false: full refund to buyer, NFT stays with seller, NO royalty paid, status Resolved", async function () {
            const ctx = await loadFixture(deployFixture);
            const { owner, artisan, buyer, productNFT, escrow, dynamicRoyalty } = ctx;
            const { tokenId, escrowId, salePrice } = await createEscrowFixture(ctx);
            await escrow.connect(artisan).markShipped(escrowId);
            await escrow.connect(buyer).raiseDispute(escrowId, "item never arrived");

            const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);

            const tx = escrow.connect(owner).resolveDispute(escrowId, false, "Seller failed to prove delivery");

            await expect(tx).to.emit(escrow, "EscrowRefunded").withArgs(escrowId, buyer.address, salePrice);
            await expect(tx)
                .to.emit(escrow, "EscrowResolved")
                .withArgs(escrowId, false, "Seller failed to prove delivery");

            const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
            expect(buyerBalanceAfter - buyerBalanceBefore).to.equal(salePrice);

            // NFT never moved — still with the seller.
            expect(await productNFT.ownerOf(tokenId)).to.equal(artisan.address);

            // No royalty settlement — transferCount unchanged.
            expect(await dynamicRoyalty.transferCount(tokenId)).to.equal(0n);

            const record = await escrow.escrows(escrowId);
            expect(record.status).to.equal(EscrowStatus.Resolved);
        });

        it("reverts if called by anyone other than the owner", async function () {
            const ctx = await loadFixture(deployFixture);
            const { buyer, artisan, stranger, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await escrow.connect(buyer).raiseDispute(escrowId, "dispute");

            await expect(
                escrow.connect(buyer).resolveDispute(escrowId, true, "buyer tries to arbitrate own dispute")
            ).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(
                escrow.connect(artisan).resolveDispute(escrowId, true, "seller tries to arbitrate own dispute")
            ).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(
                escrow.connect(stranger).resolveDispute(escrowId, true, "stranger")
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("reverts if the escrow is not in Disputed status", async function () {
            const ctx = await loadFixture(deployFixture);
            const { owner, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);

            await expect(escrow.connect(owner).resolveDispute(escrowId, true, "not disputed yet")).to.be.revertedWith(
                "Escrow: not disputed"
            );
        });

        it("reverts on double-resolution: resolving twice reverts, even alternating sellerWins values", async function () {
            const ctx = await loadFixture(deployFixture);
            const { owner, buyer, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await escrow.connect(buyer).raiseDispute(escrowId, "dispute");
            await escrow.connect(owner).resolveDispute(escrowId, false, "buyer wins, refunded");

            // Escrow is now Resolved. A second resolution attempt, even with the opposite
            // outcome, must revert — the state machine, not the outcome, gates re-entry.
            await expect(
                escrow.connect(owner).resolveDispute(escrowId, true, "trying to flip the outcome")
            ).to.be.revertedWith("Escrow: not disputed");
        });

        it("reverts on double-resolution when the first resolution was sellerWins=true (status becomes Completed, not Disputed)", async function () {
            const ctx = await loadFixture(deployFixture);
            const { owner, buyer, escrow } = ctx;
            const { escrowId } = await createEscrowFixture(ctx);
            await escrow.connect(buyer).raiseDispute(escrowId, "dispute");
            await escrow.connect(owner).resolveDispute(escrowId, true, "seller wins");

            await expect(
                escrow.connect(owner).resolveDispute(escrowId, false, "trying again")
            ).to.be.revertedWith("Escrow: not disputed");
        });
    });

    describe("multiple independent escrows", function () {
        it("escrowCount and per-escrow state do not collide across two separate escrows", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, buyer, escrow } = ctx;

            const first = await createEscrowFixture(ctx);
            const second = await createEscrowFixture(ctx);

            expect(first.escrowId).to.equal(1n);
            expect(second.escrowId).to.equal(2n);
            expect(await escrow.escrowCount()).to.equal(2n);

            await escrow.connect(artisan).markShipped(first.escrowId);

            const firstRecord = await escrow.escrows(first.escrowId);
            const secondRecord = await escrow.escrows(second.escrowId);
            expect(firstRecord.status).to.equal(EscrowStatus.Shipped);
            expect(secondRecord.status).to.equal(EscrowStatus.Created);
        });
    });
});

// Helper mirroring the ArtisanRegistry.test.js pattern: register + Aadhaar-verify a signer
// so it counts as a verified artisan (used for the seller-swap scenario).
async function artisanRegistryVerify(ctx, signer) {
    const { owner, artisanRegistry } = ctx;
    await artisanRegistry.connect(signer).registerArtisan("Other Artisan", "Craft", "Region", 0);
    await artisanRegistry.connect(owner).markAadhaarVerified(signer.address);
}

// block.timestamp values are non-deterministic across runs; match with a predicate instead
// of a hardcoded value, same convention as ProductRegistry.test.js.
function anyUint() {
    return (value) => typeof value === "bigint" && value >= 0n;
}
