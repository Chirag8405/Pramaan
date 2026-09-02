const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

// Real constants from ArtisanRegistry.sol — do not invent values here.
const INITIAL_REPUTATION = 1_000n;
const MIN_VOUCH_STAKE = 50n;
const VOUCHER_ROYALTY_PENALTY_BPS = 500n;
const MAX_ROYALTY_PENALTY_BPS = 9_000n;

const SOULBOUND_REVERT = "Soulbound: non-transferable token";

describe("ArtisanRegistry", function () {
    async function deployFixture() {
        const [owner, verifier, artisanA, artisanB, artisanC, stranger] = await ethers.getSigners();

        const ArtisanRegistry = await ethers.getContractFactory("ArtisanRegistry");
        const registry = await ArtisanRegistry.deploy();
        await registry.waitForDeployment();

        return { registry, owner, verifier, artisanA, artisanB, artisanC, stranger };
    }

    // Helper: register + Aadhaar-verify an artisan so it passes onlyVerifiedArtisan / isVerifiedArtisan.
    async function registerAndVerify(registry, owner, signer, name = "Artisan", craft = "Weaving", gi = "Region") {
        await registry.connect(signer).registerArtisan(name, craft, gi, 0);
        await registry.connect(owner).markAadhaarVerified(signer.address);
    }

    describe("registerArtisan", function () {
        it("registers a new artisan, mints the SBT, and sets initial profile state", async function () {
            const { registry, artisanA } = await loadFixture(deployFixture);

            await expect(registry.connect(artisanA).registerArtisan("Meera", "Pottery", "Khurja", 0))
                .to.emit(registry, "ArtisanRegistered")
                .withArgs(artisanA.address, "Pottery");

            const profile = await registry.getArtisan(artisanA.address);
            expect(profile.wallet).to.equal(artisanA.address);
            expect(profile.name).to.equal("Meera");
            expect(profile.craft).to.equal("Pottery");
            expect(profile.giRegion).to.equal("Khurja");
            expect(profile.isAadhaarVerified).to.equal(false);
            expect(profile.isFraudulent).to.equal(false);
            expect(profile.reputationScore).to.equal(INITIAL_REPUTATION);
            expect(profile.lockedReputation).to.equal(0n);
            expect(profile.royaltyPenaltyBps).to.equal(0n);

            expect(await registry.balanceOf(artisanA.address)).to.equal(1n);
            const tokenId = await registry.artisanTokenId(artisanA.address);
            expect(tokenId).to.equal(1n);
            expect(await registry.ownerOf(tokenId)).to.equal(artisanA.address);
        });

        it("reverts on duplicate registration for the same address", async function () {
            const { registry, artisanA } = await loadFixture(deployFixture);

            await registry.connect(artisanA).registerArtisan("Meera", "Pottery", "Khurja", 0);

            await expect(
                registry.connect(artisanA).registerArtisan("Meera Again", "Pottery", "Khurja", 0)
            ).to.be.revertedWith("ArtisanRegistry: already registered");
        });

        it("reverts on empty name", async function () {
            const { registry, artisanA } = await loadFixture(deployFixture);

            await expect(
                registry.connect(artisanA).registerArtisan("", "Pottery", "Khurja", 0)
            ).to.be.revertedWith("ArtisanRegistry: empty name");
        });

        it("reverts on empty craft", async function () {
            const { registry, artisanA } = await loadFixture(deployFixture);

            await expect(
                registry.connect(artisanA).registerArtisan("Meera", "", "Khurja", 0)
            ).to.be.revertedWith("ArtisanRegistry: empty craft");
        });
    });

    describe("soulbound behavior", function () {
        it("reverts on transferFrom with the soulbound revert reason", async function () {
            const { registry, artisanA, artisanB } = await loadFixture(deployFixture);

            await registry.connect(artisanA).registerArtisan("Meera", "Pottery", "Khurja", 0);
            const tokenId = await registry.artisanTokenId(artisanA.address);

            await expect(
                registry.connect(artisanA).transferFrom(artisanA.address, artisanB.address, tokenId)
            ).to.be.revertedWith(SOULBOUND_REVERT);
        });

        it("reverts on safeTransferFrom with the soulbound revert reason", async function () {
            const { registry, artisanA, artisanB } = await loadFixture(deployFixture);

            await registry.connect(artisanA).registerArtisan("Meera", "Pottery", "Khurja", 0);
            const tokenId = await registry.artisanTokenId(artisanA.address);

            await expect(
                registry
                    .connect(artisanA)
                    ["safeTransferFrom(address,address,uint256)"](artisanA.address, artisanB.address, tokenId)
            ).to.be.revertedWith(SOULBOUND_REVERT);
        });

        it("still allows the initial mint (from == address(0))", async function () {
            const { registry, artisanA } = await loadFixture(deployFixture);

            // registerArtisan internally calls _safeMint, i.e. from == address(0).
            // If soulbound logic incorrectly blocked mint too, registration itself would revert.
            await expect(registry.connect(artisanA).registerArtisan("Meera", "Pottery", "Khurja", 0)).to.not.be
                .reverted;
        });
    });

    describe("markAadhaarVerified", function () {
        it("reverts when called by a random, non-verifier, non-owner address", async function () {
            const { registry, artisanA, stranger } = await loadFixture(deployFixture);

            await registry.connect(artisanA).registerArtisan("Meera", "Pottery", "Khurja", 0);

            await expect(
                registry.connect(stranger).markAadhaarVerified(artisanA.address)
            ).to.be.revertedWith("ArtisanRegistry: unauthorized verifier");
        });

        it("reverts if the target artisan is not registered", async function () {
            const { registry, owner, stranger } = await loadFixture(deployFixture);

            await expect(
                registry.connect(owner).markAadhaarVerified(stranger.address)
            ).to.be.revertedWith("ArtisanRegistry: artisan not found");
        });

        it("succeeds when called by the owner (owner is verifier by default in constructor)", async function () {
            const { registry, owner, artisanA } = await loadFixture(deployFixture);

            await registry.connect(artisanA).registerArtisan("Meera", "Pottery", "Khurja", 0);

            await expect(registry.connect(owner).markAadhaarVerified(artisanA.address))
                .to.emit(registry, "AadhaarMarkedVerified")
                .withArgs(artisanA.address, owner.address);

            const profile = await registry.getArtisan(artisanA.address);
            expect(profile.isAadhaarVerified).to.equal(true);
        });

        it("succeeds when called by an address granted verifier status via setAadhaarVerifier", async function () {
            const { registry, owner, verifier, artisanA } = await loadFixture(deployFixture);

            await registry.connect(artisanA).registerArtisan("Meera", "Pottery", "Khurja", 0);
            await registry.connect(owner).setAadhaarVerifier(verifier.address, true);

            await expect(registry.connect(verifier).markAadhaarVerified(artisanA.address))
                .to.emit(registry, "AadhaarMarkedVerified")
                .withArgs(artisanA.address, verifier.address);

            const profile = await registry.getArtisan(artisanA.address);
            expect(profile.isAadhaarVerified).to.equal(true);
        });

        it("makes the artisan pass isVerifiedArtisan only after verification (registration alone is not enough)", async function () {
            const { registry, owner, artisanA } = await loadFixture(deployFixture);

            await registry.connect(artisanA).registerArtisan("Meera", "Pottery", "Khurja", 0);
            expect(await registry.isVerifiedArtisan(artisanA.address)).to.equal(false);

            await registry.connect(owner).markAadhaarVerified(artisanA.address);
            expect(await registry.isVerifiedArtisan(artisanA.address)).to.equal(true);
        });
    });

    describe("vouchFor", function () {
        it("allows a verified artisan to vouch for a registered, Aadhaar-verified candidate", async function () {
            const { registry, owner, artisanA, artisanB } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");
            await registerAndVerify(registry, owner, artisanB, "Raju", "Weaving", "Varanasi");

            const stake = MIN_VOUCH_STAKE;

            await expect(registry.connect(artisanA).vouchFor(artisanB.address, stake))
                .to.emit(registry, "Vouched")
                .withArgs(artisanA.address, artisanB.address, stake);

            const voucherProfile = await registry.getArtisan(artisanA.address);
            expect(voucherProfile.lockedReputation).to.equal(stake);
            expect(await registry.availableReputation(artisanA.address)).to.equal(INITIAL_REPUTATION - stake);
        });

        it("reverts if the voucher is not a verified artisan (not registered at all)", async function () {
            const { registry, owner, artisanB, stranger } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanB, "Raju", "Weaving", "Varanasi");

            await expect(
                registry.connect(stranger).vouchFor(artisanB.address, MIN_VOUCH_STAKE)
            ).to.be.revertedWith("ArtisanRegistry: not verified artisan");
        });

        it("reverts if the voucher is registered but not Aadhaar-verified yet", async function () {
            const { registry, owner, artisanA, artisanB } = await loadFixture(deployFixture);

            // artisanA registers but is never verified.
            await registry.connect(artisanA).registerArtisan("Meera", "Pottery", "Khurja", 0);
            await registerAndVerify(registry, owner, artisanB, "Raju", "Weaving", "Varanasi");

            await expect(
                registry.connect(artisanA).vouchFor(artisanB.address, MIN_VOUCH_STAKE)
            ).to.be.revertedWith("ArtisanRegistry: not verified artisan");
        });

        it("reverts if the candidate is not registered", async function () {
            const { registry, owner, artisanA, stranger } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");

            await expect(
                registry.connect(artisanA).vouchFor(stranger.address, MIN_VOUCH_STAKE)
            ).to.be.revertedWith("ArtisanRegistry: candidate not registered");
        });

        it("reverts if the candidate is registered but not Aadhaar-verified", async function () {
            const { registry, owner, artisanA, artisanB } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");
            await registry.connect(artisanB).registerArtisan("Raju", "Weaving", "Varanasi", 0);

            await expect(
                registry.connect(artisanA).vouchFor(artisanB.address, MIN_VOUCH_STAKE)
            ).to.be.revertedWith("ArtisanRegistry: candidate not Aadhaar verified");
        });

        it("reverts if the stake is below MIN_VOUCH_STAKE", async function () {
            const { registry, owner, artisanA, artisanB } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");
            await registerAndVerify(registry, owner, artisanB, "Raju", "Weaving", "Varanasi");

            await expect(
                registry.connect(artisanA).vouchFor(artisanB.address, MIN_VOUCH_STAKE - 1n)
            ).to.be.revertedWith("ArtisanRegistry: stake below minimum");
        });

        it("reverts if the voucher does not have enough available reputation", async function () {
            const { registry, owner, artisanA, artisanB } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");
            await registerAndVerify(registry, owner, artisanB, "Raju", "Weaving", "Varanasi");

            // INITIAL_REPUTATION is 1_000; request more than that in a single stake.
            const excessiveStake = INITIAL_REPUTATION + 1n;

            await expect(
                registry.connect(artisanA).vouchFor(artisanB.address, excessiveStake)
            ).to.be.revertedWith("ArtisanRegistry: insufficient reputation");
        });

        it("reverts on self-vouching", async function () {
            const { registry, owner, artisanA } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");

            await expect(
                registry.connect(artisanA).vouchFor(artisanA.address, MIN_VOUCH_STAKE)
            ).to.be.revertedWith("ArtisanRegistry: invalid candidate");
        });

        it("accumulates stake on a second vouch from the same voucher to the same candidate", async function () {
            const { registry, owner, artisanA, artisanB } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");
            await registerAndVerify(registry, owner, artisanB, "Raju", "Weaving", "Varanasi");

            await registry.connect(artisanA).vouchFor(artisanB.address, MIN_VOUCH_STAKE);
            await registry.connect(artisanA).vouchFor(artisanB.address, MIN_VOUCH_STAKE);

            const voucherProfile = await registry.getArtisan(artisanA.address);
            expect(voucherProfile.lockedReputation).to.equal(MIN_VOUCH_STAKE * 2n);
        });
    });

    describe("slash", function () {
        it("burns the voucher's staked reputation per the actual formula (lockedReputation and reputationScore both reduced by burnedStake, floored at 0)", async function () {
            const { registry, owner, artisanA, artisanB } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");
            await registerAndVerify(registry, owner, artisanB, "Raju", "Weaving", "Varanasi");

            const stake = MIN_VOUCH_STAKE;
            await registry.connect(artisanA).vouchFor(artisanB.address, stake);

            const beforeSlash = await registry.getArtisan(artisanA.address);
            expect(beforeSlash.reputationScore).to.equal(INITIAL_REPUTATION);
            expect(beforeSlash.lockedReputation).to.equal(stake);

            await expect(registry.connect(owner).slash(artisanB.address))
                .to.emit(registry, "ArtisanSlashed")
                .withArgs(artisanB.address, artisanA.address, stake, VOUCHER_ROYALTY_PENALTY_BPS);

            const afterSlash = await registry.getArtisan(artisanA.address);
            // reputationScore -= burnedStake (1000 - 50 = 950)
            expect(afterSlash.reputationScore).to.equal(INITIAL_REPUTATION - stake);
            // lockedReputation -= burnedStake (50 - 50 = 0)
            expect(afterSlash.lockedReputation).to.equal(0n);

            const fraudProfile = await registry.getArtisan(artisanB.address);
            expect(fraudProfile.isFraudulent).to.equal(true);
        });

        it("floors reputationScore and lockedReputation at 0 when burnedStake would exceed them", async function () {
            const { registry, owner, artisanA, artisanB, artisanC } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");
            await registerAndVerify(registry, owner, artisanB, "Raju", "Weaving", "Varanasi");
            await registerAndVerify(registry, owner, artisanC, "Third", "Weaving", "Region3");

            // Drain artisanA's reputation down close to zero via awardReputation-independent path:
            // vouch as much as allowed (limited by INITIAL_REPUTATION), then slash repeatedly
            // to push reputationScore toward 0, then vouch again with whatever remains and slash again.
            // Simpler: vouch full 1000 for artisanB, slash -> reputationScore hits 0, lockedReputation hits 0.
            await registry.connect(artisanA).vouchFor(artisanB.address, INITIAL_REPUTATION);
            await registry.connect(owner).slash(artisanB.address);

            const afterFirstSlash = await registry.getArtisan(artisanA.address);
            expect(afterFirstSlash.reputationScore).to.equal(0n);
            expect(afterFirstSlash.lockedReputation).to.equal(0n);

            // artisanA now has 0 available reputation; further slashing of a second fraudulent
            // artisan they vouched for (if any stake existed) should floor at 0, not underflow/revert.
            // Since artisanA can no longer vouch (insufficient reputation), we instead confirm the
            // floored state is stable and availableReputation reads 0, not a negative/underflowed value.
            expect(await registry.availableReputation(artisanA.address)).to.equal(0n);
        });

        it("increases the voucher's royaltyPenaltyBps by VOUCHER_ROYALTY_PENALTY_BPS, capped at MAX_ROYALTY_PENALTY_BPS", async function () {
            const { registry, owner, artisanA, artisanB, artisanC } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");

            // MAX_ROYALTY_PENALTY_BPS / VOUCHER_ROYALTY_PENALTY_BPS = 9000 / 500 = 18 slashes to reach cap.
            // We only need to prove the increment-then-cap behavior, so drive it past the cap with
            // repeated fraudulent candidates vouched for by artisanA using awardReputation to keep
            // artisanA solvent for MIN_VOUCH_STAKE each time.
            const slashesToExceedCap = Number(MAX_ROYALTY_PENALTY_BPS / VOUCHER_ROYALTY_PENALTY_BPS) + 2;

            let penaltyBps = 0n;
            for (let i = 0; i < slashesToExceedCap; i++) {
                const fraudulent = ethers.Wallet.createRandom().connect(ethers.provider);
                // Fund the throwaway wallet so it can pay gas for its own registration tx.
                await owner.sendTransaction({ to: fraudulent.address, value: ethers.parseEther("1") });

                await registerAndVerify(registry, owner, fraudulent, `Fraud${i}`, "Craft", "Region");

                // Keep artisanA solvent: top up reputation before each vouch so MIN_VOUCH_STAKE is always available.
                await registry.connect(owner).awardReputation(artisanA.address, MIN_VOUCH_STAKE, "top-up for test");
                await registry.connect(artisanA).vouchFor(fraudulent.address, MIN_VOUCH_STAKE);

                await registry.connect(owner).slash(fraudulent.address);

                const profile = await registry.getArtisan(artisanA.address);
                penaltyBps = profile.royaltyPenaltyBps;

                const expected =
                    BigInt(i + 1) * VOUCHER_ROYALTY_PENALTY_BPS > MAX_ROYALTY_PENALTY_BPS
                        ? MAX_ROYALTY_PENALTY_BPS
                        : BigInt(i + 1) * VOUCHER_ROYALTY_PENALTY_BPS;
                expect(penaltyBps).to.equal(expected);
            }

            expect(penaltyBps).to.equal(MAX_ROYALTY_PENALTY_BPS);
            expect(await registry.getRoyaltyPenaltyBps(artisanA.address)).to.equal(MAX_ROYALTY_PENALTY_BPS);
        });

        it("reverts if called by a non-owner", async function () {
            const { registry, owner, artisanA, artisanB, stranger } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");
            await registerAndVerify(registry, owner, artisanB, "Raju", "Weaving", "Varanasi");
            await registry.connect(artisanA).vouchFor(artisanB.address, MIN_VOUCH_STAKE);

            await expect(registry.connect(stranger).slash(artisanB.address)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("reverts if the target artisan is not registered", async function () {
            const { registry, owner, stranger } = await loadFixture(deployFixture);

            await expect(registry.connect(owner).slash(stranger.address)).to.be.revertedWith(
                "ArtisanRegistry: artisan not found"
            );
        });

        it("reverts if the target artisan is already slashed", async function () {
            const { registry, owner, artisanA, artisanB } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");
            await registerAndVerify(registry, owner, artisanB, "Raju", "Weaving", "Varanasi");
            await registry.connect(artisanA).vouchFor(artisanB.address, MIN_VOUCH_STAKE);

            await registry.connect(owner).slash(artisanB.address);

            await expect(registry.connect(owner).slash(artisanB.address)).to.be.revertedWith(
                "ArtisanRegistry: already slashed"
            );
        });

        it("only burns active vouches, skipping vouches already released", async function () {
            const { registry, owner, artisanA, artisanB } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");
            await registerAndVerify(registry, owner, artisanB, "Raju", "Weaving", "Varanasi");

            await registry.connect(artisanA).vouchFor(artisanB.address, MIN_VOUCH_STAKE);
            await registry.connect(owner).releaseVouches(artisanB.address);

            const afterRelease = await registry.getArtisan(artisanA.address);
            expect(afterRelease.lockedReputation).to.equal(0n);

            // Slashing after full release should not double-burn or revert; no active edges remain.
            await expect(registry.connect(owner).slash(artisanB.address)).to.not.be.reverted;

            const afterSlash = await registry.getArtisan(artisanA.address);
            expect(afterSlash.reputationScore).to.equal(INITIAL_REPUTATION);
            expect(afterSlash.royaltyPenaltyBps).to.equal(0n);
        });
    });

    describe("releaseVouches", function () {
        it("releases locked reputation back to all active vouchers and marks edges inactive", async function () {
            const { registry, owner, artisanA, artisanB, artisanC } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");
            await registerAndVerify(registry, owner, artisanB, "Raju", "Weaving", "Varanasi");
            await registerAndVerify(registry, owner, artisanC, "Third", "Craft", "Region3");

            await registry.connect(artisanA).vouchFor(artisanC.address, MIN_VOUCH_STAKE);
            await registry.connect(artisanB).vouchFor(artisanC.address, MIN_VOUCH_STAKE);

            await expect(registry.connect(owner).releaseVouches(artisanC.address))
                .to.emit(registry, "VouchReleased")
                .withArgs(artisanA.address, artisanC.address, MIN_VOUCH_STAKE);

            expect((await registry.getArtisan(artisanA.address)).lockedReputation).to.equal(0n);
            expect((await registry.getArtisan(artisanB.address)).lockedReputation).to.equal(0n);
        });

        it("reverts if called by a non-owner", async function () {
            const { registry, owner, artisanA, artisanC, stranger } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");
            await registerAndVerify(registry, owner, artisanC, "Third", "Craft", "Region3");
            await registry.connect(artisanA).vouchFor(artisanC.address, MIN_VOUCH_STAKE);

            await expect(registry.connect(stranger).releaseVouches(artisanC.address)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("reverts if the candidate is fraudulent", async function () {
            const { registry, owner, artisanA, artisanC } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");
            await registerAndVerify(registry, owner, artisanC, "Third", "Craft", "Region3");
            await registry.connect(artisanA).vouchFor(artisanC.address, MIN_VOUCH_STAKE);
            await registry.connect(owner).slash(artisanC.address);

            await expect(registry.connect(owner).releaseVouches(artisanC.address)).to.be.revertedWith(
                "ArtisanRegistry: candidate is fraudulent"
            );
        });
    });

    describe("access control — full enumeration", function () {
        // One reverting test per onlyOwner / verifier-gated function, called by an unauthorized address.

        it("setAadhaarVerifier: reverts for non-owner", async function () {
            const { registry, artisanA, stranger } = await loadFixture(deployFixture);

            await expect(
                registry.connect(stranger).setAadhaarVerifier(artisanA.address, true)
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("awardReputation: reverts for non-owner", async function () {
            const { registry, owner, artisanA, stranger } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanA, "Meera", "Pottery", "Khurja");

            await expect(
                registry.connect(stranger).awardReputation(artisanA.address, 10n, "bonus")
            ).to.be.revertedWith("Ownable: caller is not the owner");
        });

        it("releaseVouches: reverts for non-owner", async function () {
            const { registry, artisanA, stranger } = await loadFixture(deployFixture);

            await expect(registry.connect(stranger).releaseVouches(artisanA.address)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("slash: reverts for non-owner", async function () {
            const { registry, artisanA, stranger } = await loadFixture(deployFixture);

            await expect(registry.connect(stranger).slash(artisanA.address)).to.be.revertedWith(
                "Ownable: caller is not the owner"
            );
        });

        it("markAadhaarVerified: reverts for an address that is neither owner nor a designated verifier", async function () {
            const { registry, artisanA, stranger } = await loadFixture(deployFixture);

            await registry.connect(artisanA).registerArtisan("Meera", "Pottery", "Khurja", 0);

            await expect(
                registry.connect(stranger).markAadhaarVerified(artisanA.address)
            ).to.be.revertedWith("ArtisanRegistry: unauthorized verifier");
        });

        it("vouchFor: reverts for an address that is not a verified artisan (onlyVerifiedArtisan gate)", async function () {
            const { registry, owner, artisanB, stranger } = await loadFixture(deployFixture);

            await registerAndVerify(registry, owner, artisanB, "Raju", "Weaving", "Varanasi");

            await expect(
                registry.connect(stranger).vouchFor(artisanB.address, MIN_VOUCH_STAKE)
            ).to.be.revertedWith("ArtisanRegistry: not verified artisan");
        });

        it("setAadhaarVerifier: reverts with invalid verifier address(0) even from owner", async function () {
            const { registry, owner } = await loadFixture(deployFixture);

            await expect(
                registry.connect(owner).setAadhaarVerifier(ethers.ZeroAddress, true)
            ).to.be.revertedWith("ArtisanRegistry: invalid verifier");
        });
    });
});
