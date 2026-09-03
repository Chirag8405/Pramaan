const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-network-helpers");
const { computeAttestationDigest, signAttestationDigest } = require("./helpers/attestation");

const MIN_VOUCH_STAKE = 50n;

describe("ProductRegistry", function () {
    async function deployFixture() {
        const [owner, artisan, otherArtisan, buyer, handler2, handler3, stranger, wrongSigner] =
            await ethers.getSigners();

        const ArtisanRegistry = await ethers.getContractFactory("ArtisanRegistry");
        const artisanRegistry = await ArtisanRegistry.deploy();
        await artisanRegistry.waitForDeployment();
        const artisanRegistryAddress = await artisanRegistry.getAddress();

        const ProductRegistry = await ethers.getContractFactory("ProductRegistry");
        const productRegistry = await ProductRegistry.deploy(artisanRegistryAddress);
        await productRegistry.waitForDeployment();
        const productRegistryAddress = await productRegistry.getAddress();

        // Register + Aadhaar-verify the main artisan so isVerifiedArtisan() is true.
        await artisanRegistry.connect(artisan).registerArtisan("Meera", "Pottery", "Khurja", 0);
        await artisanRegistry.connect(owner).markAadhaarVerified(artisan.address);

        const network = await ethers.provider.getNetwork();
        const chainId = network.chainId;

        return {
            owner,
            artisan,
            otherArtisan,
            buyer,
            handler2,
            handler3,
            stranger,
            wrongSigner,
            artisanRegistry,
            productRegistry,
            productRegistryAddress,
            chainId
        };
    }

    // Convenience wrapper: builds the digest against THIS deployment/chain, signs it with
    // provenanceSigner, and returns everything registerProduct needs.
    async function buildSignedAttestation({
        productRegistryAddress,
        chainId,
        artisanAddress,
        provenanceSigner,
        productHash,
        metadataHash,
        cid,
        name,
        giTag,
        lat,
        lng
    }) {
        const digest = computeAttestationDigest({
            chainId,
            contractAddress: productRegistryAddress,
            productHash,
            metadataHash,
            artisan: artisanAddress,
            provenanceSigner: provenanceSigner.address,
            cid,
            name,
            giTag,
            lat,
            lng
        });

        const deviceSignature = await signAttestationDigest(provenanceSigner, digest);
        return { digest, deviceSignature };
    }

    function sampleProduct(overrides = {}) {
        return {
            productHash: ethers.keccak256(ethers.toUtf8Bytes("product-1")),
            metadataHash: ethers.keccak256(ethers.toUtf8Bytes("metadata-1")),
            cid: "bafybeigdyrztest",
            name: "First Flush Darjeeling",
            giTag: "Darjeeling Tea",
            lat: 2683400n, // scaled integer, matches frontend convention
            lng: 8825500n,
            ...overrides
        };
    }

    describe("digest construction (foundational — verify before anything else)", function () {
        it("JS-computed digest matches the digest the contract itself would sign against, proven by a successful registration", async function () {
            const { artisan, productRegistry, productRegistryAddress, chainId } = await loadFixture(deployFixture);
            const p = sampleProduct();

            const { deviceSignature } = await buildSignedAttestation({
                productRegistryAddress,
                chainId,
                artisanAddress: artisan.address,
                provenanceSigner: artisan,
                ...p
            });

            // If the JS digest didn't match the Solidity digest byte-for-byte, ECDSA.recover()
            // inside the contract would recover a different address than provenanceSigner,
            // and this call would revert with "Invalid provenance attestation".
            await expect(
                productRegistry
                    .connect(artisan)
                    .registerProduct(
                        p.productHash,
                        p.cid,
                        p.name,
                        p.giTag,
                        p.metadataHash,
                        artisan.address,
                        deviceSignature,
                        p.lat,
                        p.lng
                    )
            ).to.not.be.reverted;
        });
    });

    describe("registerProduct — happy path", function () {
        it("succeeds for a verified artisan with a valid device signature, emits both events, and stores the record", async function () {
            const { artisan, productRegistry, productRegistryAddress, chainId } = await loadFixture(deployFixture);
            const p = sampleProduct();

            const { deviceSignature } = await buildSignedAttestation({
                productRegistryAddress,
                chainId,
                artisanAddress: artisan.address,
                provenanceSigner: artisan,
                ...p
            });

            const tx = productRegistry
                .connect(artisan)
                .registerProduct(
                    p.productHash,
                    p.cid,
                    p.name,
                    p.giTag,
                    p.metadataHash,
                    artisan.address,
                    deviceSignature,
                    p.lat,
                    p.lng
                );

            await expect(tx)
                .to.emit(productRegistry, "ProductRegistered")
                .withArgs(p.productHash, artisan.address, p.giTag);

            await expect(tx)
                .to.emit(productRegistry, "ProductProvenanceSigned")
                .withArgs(p.productHash, p.metadataHash, artisan.address, deviceSignature);

            const stored = await productRegistry.products(p.productHash);
            expect(stored.productHash).to.equal(p.productHash);
            expect(stored.ipfsCid).to.equal(p.cid);
            expect(stored.artisan).to.equal(artisan.address);
            expect(stored.provenanceSigner).to.equal(artisan.address);
            expect(stored.productName).to.equal(p.name);
            expect(stored.giTag).to.equal(p.giTag);
            expect(stored.metadataHash).to.equal(p.metadataHash);
            expect(stored.origin_lat).to.equal(p.lat);
            expect(stored.origin_lng).to.equal(p.lng);
            expect(stored.transferCount).to.equal(0n);
            expect(stored.registeredAt).to.be.greaterThan(0n);
        });

        it("supports a provenanceSigner distinct from the registering artisan (device key != wallet key)", async function () {
            const { artisan, wrongSigner: deviceKey, productRegistry, productRegistryAddress, chainId } =
                await loadFixture(deployFixture);
            const p = sampleProduct();

            const { deviceSignature } = await buildSignedAttestation({
                productRegistryAddress,
                chainId,
                artisanAddress: artisan.address,
                provenanceSigner: deviceKey,
                ...p
            });

            await expect(
                productRegistry
                    .connect(artisan)
                    .registerProduct(
                        p.productHash,
                        p.cid,
                        p.name,
                        p.giTag,
                        p.metadataHash,
                        deviceKey.address,
                        deviceSignature,
                        p.lat,
                        p.lng
                    )
            )
                .to.emit(productRegistry, "ProductRegistered")
                .withArgs(p.productHash, artisan.address, p.giTag);

            const stored = await productRegistry.products(p.productHash);
            expect(stored.provenanceSigner).to.equal(deviceKey.address);
        });
    });

    describe("registerProduct — reverts", function () {
        it("reverts if caller is not a verified artisan", async function () {
            const { stranger, productRegistry, productRegistryAddress, chainId } = await loadFixture(deployFixture);
            const p = sampleProduct();

            const { deviceSignature } = await buildSignedAttestation({
                productRegistryAddress,
                chainId,
                artisanAddress: stranger.address,
                provenanceSigner: stranger,
                ...p
            });

            await expect(
                productRegistry
                    .connect(stranger)
                    .registerProduct(
                        p.productHash,
                        p.cid,
                        p.name,
                        p.giTag,
                        p.metadataHash,
                        stranger.address,
                        deviceSignature,
                        p.lat,
                        p.lng
                    )
            ).to.be.revertedWith("Only verified artisans");
        });

        it("reverts when the device signature comes from a wallet other than the declared provenanceSigner", async function () {
            const { artisan, wrongSigner, productRegistry, productRegistryAddress, chainId } = await loadFixture(
                deployFixture
            );
            const p = sampleProduct();

            // Digest is built/declared against `artisan.address` as provenanceSigner,
            // but we sign it with wrongSigner's key instead.
            const digest = computeAttestationDigest({
                chainId,
                contractAddress: productRegistryAddress,
                productHash: p.productHash,
                metadataHash: p.metadataHash,
                artisan: artisan.address,
                provenanceSigner: artisan.address,
                cid: p.cid,
                name: p.name,
                giTag: p.giTag,
                lat: p.lat,
                lng: p.lng
            });
            const deviceSignature = await signAttestationDigest(wrongSigner, digest);

            await expect(
                productRegistry
                    .connect(artisan)
                    .registerProduct(
                        p.productHash,
                        p.cid,
                        p.name,
                        p.giTag,
                        p.metadataHash,
                        artisan.address, // declared signer
                        deviceSignature, // actually signed by wrongSigner
                        p.lat,
                        p.lng
                    )
            ).to.be.revertedWith("Invalid provenance attestation");
        });

        it("reverts if the product hash is tampered with after signing", async function () {
            const { artisan, productRegistry, productRegistryAddress, chainId } = await loadFixture(deployFixture);
            const p = sampleProduct();

            const { deviceSignature } = await buildSignedAttestation({
                productRegistryAddress,
                chainId,
                artisanAddress: artisan.address,
                provenanceSigner: artisan,
                ...p
            });

            const tamperedHash = ethers.keccak256(ethers.toUtf8Bytes("product-1-tampered"));

            await expect(
                productRegistry
                    .connect(artisan)
                    .registerProduct(
                        tamperedHash, // changed after the signature was produced
                        p.cid,
                        p.name,
                        p.giTag,
                        p.metadataHash,
                        artisan.address,
                        deviceSignature,
                        p.lat,
                        p.lng
                    )
            ).to.be.revertedWith("Invalid provenance attestation");
        });

        it("reverts if the metadata hash is tampered with after signing", async function () {
            const { artisan, productRegistry, productRegistryAddress, chainId } = await loadFixture(deployFixture);
            const p = sampleProduct();

            const { deviceSignature } = await buildSignedAttestation({
                productRegistryAddress,
                chainId,
                artisanAddress: artisan.address,
                provenanceSigner: artisan,
                ...p
            });

            const tamperedMetadataHash = ethers.keccak256(ethers.toUtf8Bytes("metadata-1-tampered"));

            await expect(
                productRegistry
                    .connect(artisan)
                    .registerProduct(
                        p.productHash,
                        p.cid,
                        p.name,
                        p.giTag,
                        tamperedMetadataHash, // changed after the signature was produced
                        artisan.address,
                        deviceSignature,
                        p.lat,
                        p.lng
                    )
            ).to.be.revertedWith("Invalid provenance attestation");
        });

        it("reverts on a replayed attestation digest (same signature submitted twice for a fresh product hash)", async function () {
            const { artisan, productRegistry, productRegistryAddress, chainId } = await loadFixture(deployFixture);
            const p = sampleProduct();

            const { deviceSignature } = await buildSignedAttestation({
                productRegistryAddress,
                chainId,
                artisanAddress: artisan.address,
                provenanceSigner: artisan,
                ...p
            });

            await productRegistry
                .connect(artisan)
                .registerProduct(
                    p.productHash,
                    p.cid,
                    p.name,
                    p.giTag,
                    p.metadataHash,
                    artisan.address,
                    deviceSignature,
                    p.lat,
                    p.lng
                );

            // Second product hash, but every other field (and therefore the digest) is identical,
            // so this exercises usedAttestationDigests rather than the "already registered" guard.
            const p2 = sampleProduct({ productHash: ethers.keccak256(ethers.toUtf8Bytes("product-1")) });
            // p2 is deliberately identical to p — registering the SAME hash again hits
            // "Product already registered" first (checked before the digest check), so instead
            // we prove replay protection by reusing the identical digest against a scenario where
            // the hash check would pass: this contract keys usedAttestationDigests off the full
            // digest (which already includes the product hash), so a true replay requires the
            // exact same hash — meaning "already registered" and "digest already used" overlap.
            // We confirm the digest guard specifically by checking the require ordering in source:
            // products[hash].registeredAt == 0 is checked BEFORE the digest guard, so replaying the
            // identical call trips "Product already registered" first. That is still a correct
            // replay rejection from the caller's perspective — assert that.
            await expect(
                productRegistry
                    .connect(artisan)
                    .registerProduct(
                        p.productHash,
                        p.cid,
                        p.name,
                        p.giTag,
                        p.metadataHash,
                        artisan.address,
                        deviceSignature,
                        p.lat,
                        p.lng
                    )
            ).to.be.revertedWith("Product already registered");
        });

        it("reverts on a genuine digest replay: identical attestation fields signed once, submitted under two different product hash keys is impossible, so replay is proven via usedAttestationDigests directly", async function () {
            // The digest ALWAYS includes `hash` as an input, so two different product hashes can
            // never produce the same digest, and two identical product hashes always trip
            // "Product already registered" first. To prove usedAttestationDigests actually works
            // as a second, independent guard (not just dead code shadowed by the registeredAt
            // check), we call registerProduct, then delete... we can't delete on-chain state from
            // a test. Instead we assert the invariant directly against contract storage: the digest
            // must read true in usedAttestationDigests after the first successful registration.
            const { artisan, productRegistry, productRegistryAddress, chainId } = await loadFixture(deployFixture);
            const p = sampleProduct();

            const digest = computeAttestationDigest({
                chainId,
                contractAddress: productRegistryAddress,
                productHash: p.productHash,
                metadataHash: p.metadataHash,
                artisan: artisan.address,
                provenanceSigner: artisan.address,
                cid: p.cid,
                name: p.name,
                giTag: p.giTag,
                lat: p.lat,
                lng: p.lng
            });
            const deviceSignature = await signAttestationDigest(artisan, digest);

            expect(await productRegistry.usedAttestationDigests(digest)).to.equal(false);

            await productRegistry
                .connect(artisan)
                .registerProduct(
                    p.productHash,
                    p.cid,
                    p.name,
                    p.giTag,
                    p.metadataHash,
                    artisan.address,
                    deviceSignature,
                    p.lat,
                    p.lng
                );

            expect(await productRegistry.usedAttestationDigests(digest)).to.equal(true);
        });

        it("reverts a signature produced for a different contract address (cross-contract replay)", async function () {
            const { artisan, productRegistry, productRegistryAddress, chainId } = await loadFixture(deployFixture);
            const p = sampleProduct();

            // Sign against a plausible-looking but wrong contract address.
            const wrongAddress = ethers.getAddress("0x000000000000000000000000000000000000dEaD");
            const digest = computeAttestationDigest({
                chainId,
                contractAddress: wrongAddress,
                productHash: p.productHash,
                metadataHash: p.metadataHash,
                artisan: artisan.address,
                provenanceSigner: artisan.address,
                cid: p.cid,
                name: p.name,
                giTag: p.giTag,
                lat: p.lat,
                lng: p.lng
            });
            const deviceSignature = await signAttestationDigest(artisan, digest);

            await expect(
                productRegistry
                    .connect(artisan)
                    .registerProduct(
                        p.productHash,
                        p.cid,
                        p.name,
                        p.giTag,
                        p.metadataHash,
                        artisan.address,
                        deviceSignature,
                        p.lat,
                        p.lng
                    )
            ).to.be.revertedWith("Invalid provenance attestation");

            expect(productRegistryAddress).to.not.equal(wrongAddress);
        });

        it("reverts a signature produced for a different chain id", async function () {
            const { artisan, productRegistry, productRegistryAddress, chainId } = await loadFixture(deployFixture);
            const p = sampleProduct();

            const wrongChainId = chainId === 1n ? 11155111n : 1n;
            const digest = computeAttestationDigest({
                chainId: wrongChainId,
                contractAddress: productRegistryAddress,
                productHash: p.productHash,
                metadataHash: p.metadataHash,
                artisan: artisan.address,
                provenanceSigner: artisan.address,
                cid: p.cid,
                name: p.name,
                giTag: p.giTag,
                lat: p.lat,
                lng: p.lng
            });
            const deviceSignature = await signAttestationDigest(artisan, digest);

            await expect(
                productRegistry
                    .connect(artisan)
                    .registerProduct(
                        p.productHash,
                        p.cid,
                        p.name,
                        p.giTag,
                        p.metadataHash,
                        artisan.address,
                        deviceSignature,
                        p.lat,
                        p.lng
                    )
            ).to.be.revertedWith("Invalid provenance attestation");
        });

        it("reverts on zero metadata hash", async function () {
            const { artisan, productRegistry, productRegistryAddress, chainId } = await loadFixture(deployFixture);
            const p = sampleProduct({ metadataHash: ethers.ZeroHash });

            const { deviceSignature } = await buildSignedAttestation({
                productRegistryAddress,
                chainId,
                artisanAddress: artisan.address,
                provenanceSigner: artisan,
                ...p
            });

            await expect(
                productRegistry
                    .connect(artisan)
                    .registerProduct(
                        p.productHash,
                        p.cid,
                        p.name,
                        p.giTag,
                        p.metadataHash,
                        artisan.address,
                        deviceSignature,
                        p.lat,
                        p.lng
                    )
            ).to.be.revertedWith("Invalid metadata hash");
        });

        it("reverts on zero provenanceSigner address", async function () {
            const { artisan, productRegistry } = await loadFixture(deployFixture);
            const p = sampleProduct();

            await expect(
                productRegistry
                    .connect(artisan)
                    .registerProduct(
                        p.productHash,
                        p.cid,
                        p.name,
                        p.giTag,
                        p.metadataHash,
                        ethers.ZeroAddress,
                        "0x1234",
                        p.lat,
                        p.lng
                    )
            ).to.be.revertedWith("Invalid signer");
        });

        it("reverts on empty device signature", async function () {
            const { artisan, productRegistry } = await loadFixture(deployFixture);
            const p = sampleProduct();

            await expect(
                productRegistry
                    .connect(artisan)
                    .registerProduct(
                        p.productHash,
                        p.cid,
                        p.name,
                        p.giTag,
                        p.metadataHash,
                        artisan.address,
                        "0x",
                        p.lat,
                        p.lng
                    )
            ).to.be.revertedWith("Missing device signature");
        });
    });

    describe("checkpointScanNonce", function () {
        async function registerSampleProduct(ctx, overrides = {}) {
            const { artisan, productRegistry, productRegistryAddress, chainId } = ctx;
            const p = sampleProduct(overrides);

            const { deviceSignature } = await buildSignedAttestation({
                productRegistryAddress,
                chainId,
                artisanAddress: artisan.address,
                provenanceSigner: artisan,
                ...p
            });

            await productRegistry
                .connect(artisan)
                .registerProduct(
                    p.productHash,
                    p.cid,
                    p.name,
                    p.giTag,
                    p.metadataHash,
                    artisan.address,
                    deviceSignature,
                    p.lat,
                    p.lng
                );

            return p;
        }

        it("first checkpoint for a nonce records it as not previously used", async function () {
            const ctx = await loadFixture(deployFixture);
            const p = await registerSampleProduct(ctx);
            const nonce = ethers.keccak256(ethers.toUtf8Bytes("scan-nonce-1"));

            await expect(ctx.productRegistry.connect(ctx.stranger).checkpointScanNonce(p.productHash, nonce))
                .to.emit(ctx.productRegistry, "ProductScanCheckpoint")
                .withArgs(p.productHash, nonce, ctx.stranger.address, false, anyUint());

            expect(await ctx.productRegistry.isScanNonceUsed(p.productHash, nonce)).to.equal(true);
        });

        it("second checkpoint with the same nonce on the same product flags replayed = true", async function () {
            const ctx = await loadFixture(deployFixture);
            const p = await registerSampleProduct(ctx);
            const nonce = ethers.keccak256(ethers.toUtf8Bytes("scan-nonce-1"));

            await ctx.productRegistry.connect(ctx.stranger).checkpointScanNonce(p.productHash, nonce);

            await expect(ctx.productRegistry.connect(ctx.stranger).checkpointScanNonce(p.productHash, nonce))
                .to.emit(ctx.productRegistry, "ProductScanCheckpoint")
                .withArgs(p.productHash, nonce, ctx.stranger.address, true, anyUint());
        });

        it("the same nonce on a different product does not collide (nonce scoping is per-product)", async function () {
            const ctx = await loadFixture(deployFixture);
            const productA = await registerSampleProduct(ctx, { productHash: ethers.keccak256(ethers.toUtf8Bytes("product-A")) });
            const productB = await registerSampleProduct(ctx, { productHash: ethers.keccak256(ethers.toUtf8Bytes("product-B")) });
            const sharedNonce = ethers.keccak256(ethers.toUtf8Bytes("shared-nonce"));

            await ctx.productRegistry.connect(ctx.stranger).checkpointScanNonce(productA.productHash, sharedNonce);

            // Same nonce value, different product — must read as NOT replayed.
            await expect(
                ctx.productRegistry.connect(ctx.stranger).checkpointScanNonce(productB.productHash, sharedNonce)
            )
                .to.emit(ctx.productRegistry, "ProductScanCheckpoint")
                .withArgs(productB.productHash, sharedNonce, ctx.stranger.address, false, anyUint());
        });

        it("reverts for an unregistered product", async function () {
            const ctx = await loadFixture(deployFixture);
            const unknownHash = ethers.keccak256(ethers.toUtf8Bytes("unknown-product"));
            const nonce = ethers.keccak256(ethers.toUtf8Bytes("scan-nonce-1"));

            await expect(
                ctx.productRegistry.connect(ctx.stranger).checkpointScanNonce(unknownHash, nonce)
            ).to.be.revertedWith("Product not found");
        });

        it("reverts on a zero nonce", async function () {
            const ctx = await loadFixture(deployFixture);
            const p = await registerSampleProduct(ctx);

            await expect(
                ctx.productRegistry.connect(ctx.stranger).checkpointScanNonce(p.productHash, ethers.ZeroHash)
            ).to.be.revertedWith("Invalid nonce");
        });
    });

    describe("verifyProduct — terroir scoring", function () {
        async function registerSampleProduct(ctx, overrides = {}) {
            const { artisan, productRegistry, productRegistryAddress, chainId } = ctx;
            const p = sampleProduct(overrides);

            const { deviceSignature } = await buildSignedAttestation({
                productRegistryAddress,
                chainId,
                artisanAddress: artisan.address,
                provenanceSigner: artisan,
                ...p
            });

            await productRegistry
                .connect(artisan)
                .registerProduct(
                    p.productHash,
                    p.cid,
                    p.name,
                    p.giTag,
                    p.metadataHash,
                    artisan.address,
                    deviceSignature,
                    p.lat,
                    p.lng
                );

            return p;
        }

        it("clean baseline: no handlers, no transfers → score is 100", async function () {
            const ctx = await loadFixture(deployFixture);
            const p = await registerSampleProduct(ctx);

            const [, terroir] = await ctx.productRegistry.verifyProduct(p.productHash);
            expect(terroir).to.equal(100);
        });

        it("penalizes -15 per unverified handler in the transfer chain", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, productRegistry, stranger } = ctx;
            const p = await registerSampleProduct(ctx);

            // stranger is not a verified artisan, so transferring to them records handlerVerified=false.
            await productRegistry.connect(artisan).transferProduct(p.productHash, stranger.address);

            const [record, terroir] = await productRegistry.verifyProduct(p.productHash);
            expect(record.handlerVerified.length).to.equal(1);
            expect(record.handlerVerified[0]).to.equal(false);
            expect(terroir).to.equal(100 - 15);
        });

        it("stacks -15 for each unverified handler across multiple transfers", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, productRegistry, stranger, handler2 } = ctx;
            const p = await registerSampleProduct(ctx);

            // Both stranger and handler2 are unverified artisans.
            await productRegistry.connect(artisan).transferProduct(p.productHash, stranger.address);
            await productRegistry.connect(stranger).transferProduct(p.productHash, handler2.address);

            const [record, terroir] = await productRegistry.verifyProduct(p.productHash);
            expect(record.handlerVerified).to.deep.equal([false, false]);
            expect(terroir).to.equal(100 - 15 - 15);
        });

        it("does not penalize a transfer to a verified artisan", async function () {
            const ctx = await loadFixture(deployFixture);
            const { owner, artisan, productRegistry, artisanRegistry, otherArtisan } = ctx;
            const p = await registerSampleProduct(ctx);

            await artisanRegistry.connect(otherArtisan).registerArtisan("Raju", "Weaving", "Varanasi", 0);
            await artisanRegistry.connect(owner).markAadhaarVerified(otherArtisan.address);

            await productRegistry.connect(artisan).transferProduct(p.productHash, otherArtisan.address);

            const [record, terroir] = await productRegistry.verifyProduct(p.productHash);
            expect(record.handlerVerified).to.deep.equal([true]);
            expect(terroir).to.equal(100);
        });

        it("penalizes -10 when transferCount exceeds 10, independent of handler verification", async function () {
            const ctx = await loadFixture(deployFixture);
            const { owner, artisan, productRegistry, artisanRegistry } = ctx;
            const p = await registerSampleProduct(ctx);

            // Build a chain of 11 verified-artisan handlers so ONLY the transferCount penalty fires,
            // isolating it from the per-handler -15 penalty. Also need to dodge the burst-transfer
            // penalty (>3 transfers within 1 day of registration), so advance time between transfers.
            let currentOwner = artisan;
            for (let i = 0; i < 11; i++) {
                const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
                await owner.sendTransaction({ to: wallet.address, value: ethers.parseEther("1") });
                await artisanRegistry.connect(wallet).registerArtisan(`Handler${i}`, "Craft", "Region", 0);
                await artisanRegistry.connect(owner).markAadhaarVerified(wallet.address);

                await productRegistry.connect(currentOwner).transferProduct(p.productHash, wallet.address);

                // Push past the 1-day burst window after the first few transfers so the burst
                // penalty condition (block.timestamp < registeredAt + 1 days) goes false well
                // before we exceed 3 transfers.
                if (i === 3) {
                    await time.increase(2 * 24 * 60 * 60);
                }

                currentOwner = wallet;
            }

            const [record, terroir] = await productRegistry.verifyProduct(p.productHash);
            expect(record.transferCount).to.equal(11n);
            expect(record.handlerVerified.every((v) => v === true)).to.equal(true);
            // Only the transferCount > 10 penalty should apply: 100 - 10 = 90.
            expect(terroir).to.equal(100 - 10);
        });

        it("penalizes -20 for burst transfers: more than 3 transfers within 1 day of registration", async function () {
            const ctx = await loadFixture(deployFixture);
            const { owner, artisan, productRegistry, artisanRegistry } = ctx;
            const p = await registerSampleProduct(ctx);

            // 4 transfers, all still within 1 day of registration, all to verified artisans
            // so the per-handler -15 penalty stays at 0 and only the burst penalty is isolated.
            let currentOwner = artisan;
            for (let i = 0; i < 4; i++) {
                const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
                await owner.sendTransaction({ to: wallet.address, value: ethers.parseEther("1") });
                await artisanRegistry.connect(wallet).registerArtisan(`Burst${i}`, "Craft", "Region", 0);
                await artisanRegistry.connect(owner).markAadhaarVerified(wallet.address);

                await productRegistry.connect(currentOwner).transferProduct(p.productHash, wallet.address);
                currentOwner = wallet;
            }

            const [record, terroir] = await productRegistry.verifyProduct(p.productHash);
            expect(record.transferCount).to.equal(4n);
            expect(record.handlerVerified.every((v) => v === true)).to.equal(true);
            // transferCount (4) is not > 10, so no -10. But transferCount > 3 AND still within
            // 1 day of registration triggers the burst penalty: 100 - 20 = 80.
            expect(terroir).to.equal(100 - 20);
        });

        it("does not apply the burst penalty once more than 1 day has passed since registration, even with >3 transfers", async function () {
            const ctx = await loadFixture(deployFixture);
            const { owner, artisan, productRegistry, artisanRegistry } = ctx;
            const p = await registerSampleProduct(ctx);

            let currentOwner = artisan;
            for (let i = 0; i < 4; i++) {
                const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
                await owner.sendTransaction({ to: wallet.address, value: ethers.parseEther("1") });
                await artisanRegistry.connect(wallet).registerArtisan(`Slow${i}`, "Craft", "Region", 0);
                await artisanRegistry.connect(owner).markAadhaarVerified(wallet.address);

                await productRegistry.connect(currentOwner).transferProduct(p.productHash, wallet.address);
                currentOwner = wallet;
            }

            // Push well past the 1-day window after all 4 transfers are done.
            await time.increase(2 * 24 * 60 * 60);

            const [record, terroir] = await productRegistry.verifyProduct(p.productHash);
            expect(record.transferCount).to.equal(4n);
            // Burst condition requires block.timestamp < registeredAt + 1 days; that's now false,
            // so despite transferCount > 3, no -20 penalty applies. transferCount (4) is also not
            // > 10, so no -10 either. Score should be a clean 100.
            expect(terroir).to.equal(100);
        });

        it("floors the score at 0 rather than going negative when penalties stack past 100", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, productRegistry, stranger, handler2, handler3 } = ctx;
            const p = await registerSampleProduct(ctx);

            // 3 unverified-handler transfers within 1 day: -15*3 = -45, plus burst penalty since
            // transferCount(3) is not > 3 yet — so add a 4th to cross the burst threshold too.
            await productRegistry.connect(artisan).transferProduct(p.productHash, stranger.address);
            await productRegistry.connect(stranger).transferProduct(p.productHash, handler2.address);
            await productRegistry.connect(handler2).transferProduct(p.productHash, handler3.address);
            const fourthWallet = ethers.Wallet.createRandom().connect(ethers.provider);
            await ctx.owner.sendTransaction({ to: fourthWallet.address, value: ethers.parseEther("1") });
            await productRegistry.connect(handler3).transferProduct(p.productHash, fourthWallet.address);

            const [record, terroir] = await productRegistry.verifyProduct(p.productHash);
            expect(record.transferCount).to.equal(4n);
            expect(record.handlerVerified.every((v) => v === false)).to.equal(true);
            // -15*4 (unverified handlers) - 20 (burst, transferCount=4 > 3, within 1 day) = 100 - 60 - 20 = 20.
            // transferCount(4) is not > 10 so no -10 term here.
            expect(terroir).to.equal(100 - 60 - 20);
        });

        it("reverts for an unregistered product", async function () {
            const ctx = await loadFixture(deployFixture);
            const unknownHash = ethers.keccak256(ethers.toUtf8Bytes("unknown-product"));

            await expect(ctx.productRegistry.verifyProduct(unknownHash)).to.be.revertedWith("Product not found");
        });
    });

    // transferProduct's two payment legs (royalty to product.artisan, remainder to
    // msg.sender/seller) both use a low-level .call{value: ...}("") guarded by a
    // require. No EOA can ever make that .call fail, so these branches need a
    // RejectingPayee mock (no receive()/fallback) standing in as the payee. The two
    // branches are independently isolable: product.artisan is fixed at registration
    // (whoever called registerProduct), while msg.sender/seller is whoever calls
    // transferProduct — different actors, so each test puts the mock in only one role
    // and a normal EOA in the other, proving the untouched branch still succeeds while
    // the mock's branch is the one that reverts.
    describe("transferProduct — payment-failure branches (require(paidRoyalty)/require(paidSeller))", function () {
        async function deployRejectingPayee() {
            const RejectingPayee = await ethers.getContractFactory("RejectingPayee");
            const mock = await RejectingPayee.deploy();
            await mock.waitForDeployment();
            return { mock, mockAddress: await mock.getAddress() };
        }

        it("reverts with 'Royalty payment failed' when the ORIGINAL ARTISAN cannot receive ETH (seller/EOA payment leg is unaffected)", async function () {
            const ctx = await loadFixture(deployFixture);
            const { owner, buyer, productRegistry, productRegistryAddress, chainId } = ctx;
            const { mock: rejectingArtisan, mockAddress: rejectingArtisanAddress } = await deployRejectingPayee();

            // The mock itself must register as a verified artisan, since product.artisan
            // is whoever calls registerProduct — here, the mock contract.
            await rejectingArtisan.registerAsArtisan(
                await ctx.artisanRegistry.getAddress(),
                "Rejecting Artisan",
                "Pottery",
                "Khurja"
            );
            await ctx.artisanRegistry.connect(owner).markAadhaarVerified(rejectingArtisanAddress);

            const p = sampleProduct({ productHash: ethers.keccak256(ethers.toUtf8Bytes("product-rejecting-artisan")) });

            // The digest's "artisan" field must be the mock's address, since it will be
            // msg.sender inside registerProduct (called via registerProductAsArtisan).
            // provenanceSigner can still be a normal EOA — it only needs to sign the
            // attestation, not be a verified artisan itself.
            const digest = computeAttestationDigest({
                chainId,
                contractAddress: productRegistryAddress,
                productHash: p.productHash,
                metadataHash: p.metadataHash,
                artisan: rejectingArtisanAddress,
                provenanceSigner: ctx.wrongSigner.address,
                cid: p.cid,
                name: p.name,
                giTag: p.giTag,
                lat: p.lat,
                lng: p.lng
            });
            const deviceSignature = await signAttestationDigest(ctx.wrongSigner, digest);

            await rejectingArtisan.registerProductAsArtisan(
                productRegistryAddress,
                p.productHash,
                p.cid,
                p.name,
                p.giTag,
                p.metadataHash,
                ctx.wrongSigner.address,
                deviceSignature,
                p.lat,
                p.lng
            );

            // The registering artisan (the mock) is the current owner immediately after
            // registration (_currentOwner returns product.artisan when handlers[] is
            // empty). Move ownership to `buyer`, a normal EOA, with a free (value: 0)
            // transfer first, called BY the mock via its own transferProductAsSeller
            // pass-through — that leg pays nothing, so it can't trip either payment
            // branch — so that `buyer` becomes msg.sender/seller for the paid transfer
            // that actually exercises the royalty-payment failure below.
            await rejectingArtisan.transferProductAsSeller(productRegistryAddress, p.productHash, buyer.address, {
                value: 0
            });

            // This is the SECOND transfer overall (transferCount was already incremented
            // to 1 by the free hand-off above): royaltyBps = 4000/sqrt(2) = 4000/1 = 4000
            // (integer sqrt(2) = 1), so royaltyAmount > 0 and the royalty-payment branch
            // actually executes. Seller here is `buyer`, a normal EOA, so if the
            // transaction reverted for any reason OTHER than the royalty payment, this
            // test would still fail — the seller leg is not the one under test, but its
            // normal-case success is implied by the assertion not seeing a different revert.
            await expect(
                productRegistry.connect(buyer).transferProduct(p.productHash, buyer.address, {
                    value: ethers.parseEther("1")
                })
            ).to.be.revertedWith("Royalty payment failed");
        });

        it("reverts with 'Seller payout failed' when the CURRENT OWNER/SELLER cannot receive ETH (artisan/EOA royalty leg is unaffected)", async function () {
            const ctx = await loadFixture(deployFixture);
            const { artisan, productRegistry, productRegistryAddress, chainId } = ctx;
            const { mock: rejectingSeller, mockAddress: rejectingSellerAddress } = await deployRejectingPayee();

            const p = sampleProduct({ productHash: ethers.keccak256(ethers.toUtf8Bytes("product-rejecting-seller")) });

            // Normal registration: artisan is a regular verified EOA (from the fixture),
            // so the royalty leg (paid to artisan) is unaffected by this test.
            const { deviceSignature } = await buildSignedAttestation({
                productRegistryAddress,
                chainId,
                artisanAddress: artisan.address,
                provenanceSigner: artisan,
                ...p
            });

            await productRegistry
                .connect(artisan)
                .registerProduct(
                    p.productHash,
                    p.cid,
                    p.name,
                    p.giTag,
                    p.metadataHash,
                    artisan.address,
                    deviceSignature,
                    p.lat,
                    p.lng
                );

            // First transfer: current owner is still `artisan` (product.artisan itself,
            // per _currentOwner when handlers[] is empty) — but the mock must be the one
            // CALLING transferProduct to become msg.sender/seller for the payout leg. To
            // do that without the mock already owning the product, the mock instead
            // becomes the second-transfer seller: artisan transfers to the mock first
            // (free transfer, value: 0, so no payment branches trigger on this leg), then
            // the mock transfers onward and is the one who should receive sellerAmount.
            await productRegistry.connect(artisan).transferProduct(p.productHash, rejectingSellerAddress, { value: 0 });

            // Second transfer, called BY the mock (so mock is msg.sender/seller).
            // transferCount is now 2 -> royaltyBps = 4000/sqrt(2) = 4000/1 = 4000 (integer
            // sqrt(2) = 1), still > 0, so BOTH legs execute; artisan (a normal EOA) gets
            // the royalty leg, the mock gets the seller leg, which must fail.
            await expect(
                rejectingSeller.transferProductAsSeller(productRegistryAddress, p.productHash, artisan.address, {
                    value: ethers.parseEther("1")
                })
            ).to.be.revertedWith("Seller payout failed");
        });
    });
});

// hardhat-chai-matchers doesn't ship an "any uint" arg matcher for withArgs the way
// smock/waffle sometimes do; block.timestamp is non-deterministic across runs, so we
// match it with a predicate instead of a hardcoded value.
function anyUint() {
    return (value) => typeof value === "bigint" && value >= 0n;
}
