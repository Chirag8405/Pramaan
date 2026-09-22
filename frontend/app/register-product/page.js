"use client";

import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import TerritorScore from "../../components/TerritorScore";
import { giRegions } from "../../src/utils/craftDetector";
import {
  connectWallet,
  findLatestMintedTokenIdByRecipient,
  getArtisan,
  getArtisanTokenId,
  isVerifiedArtisan,
  mintProductTwin,
  registerProduct,
  verifyCraftImage
} from "../../src/utils/contract";
import { hashProduct } from "../../src/utils/hash";
import { getIPFSUrl, uploadToIPFS } from "../../src/utils/ipfs";
import { getShareBaseUrl } from "../../src/utils/url";

function sanitizeHexBytes(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }
  return text.startsWith("0x") ? text : "0x" + text;
}

function sanitizeAddress(value) {
  return String(value || "").trim();
}

const DEFAULT_JAIPUR_LAT = "26.9124";
const DEFAULT_JAIPUR_LNG = "75.7873";

function buildAutoBatchIdentity(productHash) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const yyyymmdd = "" + yyyy + mm + dd;
  const hashSuffix = String(productHash || "").replace(/^0x/, "").slice(0, 8).toUpperCase() || "DEMO";

  return {
    batchId: "BATCH-" + yyyymmdd + "-" + hashSuffix,
    lotNumber: "LOT-" + yyyymmdd,
    batchSize: "1",
    productionDate: yyyy + "-" + mm + "-" + dd
  };
}

function toDdMmYyyy(isoDate) {
  const text = String(isoDate || "");
  const parts = text.split("-");
  if (parts.length !== 3) {
    return text;
  }
  return parts[2] + "-" + parts[1] + "-" + parts[0];
}

export default function RegisterProductPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [walletAddress, setWalletAddress] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [artisan, setArtisan] = useState(null);
  const [tokenId, setTokenId] = useState("-");

  const [form, setForm] = useState({
    name: "",
    giTag: "",
    lat: DEFAULT_JAIPUR_LAT,
    lng: DEFAULT_JAIPUR_LNG,
    provenanceSigner: "",
    deviceSignature: ""
  });

  const [productImage, setProductImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [productHash, setProductHash] = useState("");
  const [aiChecking, setAiChecking] = useState(false);
  const [aiScore, setAiScore] = useState(null);
  const [aiReason, setAiReason] = useState("");
  const [aiError, setAiError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [stepProgress, setStepProgress] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const autoBatchPreview = buildAutoBatchIdentity(productHash);

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const wallet = await connectWallet();
        const address = wallet.address;

        if (!mounted) {
          return;
        }

        setWalletAddress(address);

        const artisanRecord = await getArtisan(address);
        const verified = Boolean(await isVerifiedArtisan(address));
        const hasRegistration = Number(artisanRecord?.registeredAt || 0) > 0;

        if (!mounted) {
          return;
        }

        setIsVerified(verified);
        setArtisan(artisanRecord);

        if (!verified) {
          if (hasRegistration) {
            setStatusText(
              "Artisan SBT found, but wallet is not fully verified yet. Open Artisan page and sync Aadhaar on-chain."
            );
          } else {
            setStatusText("You must register as an artisan before registering products.");
          }

          try {
            const id = await getArtisanTokenId(address);
            if (mounted) {
              setTokenId(String(id));
            }
          } catch (_idError) {
            if (mounted) {
              setTokenId("Unknown");
            }
          }
          return;
        }

        setForm((prev) => ({
          ...prev,
          giTag: "",
          provenanceSigner: address
        }));

        try {
          const id = await getArtisanTokenId(address);
          if (mounted) {
            setTokenId(String(id));
          }
        } catch (_idError) {
          if (mounted) {
            setTokenId("Unknown");
          }
        }
      } catch (error) {
        if (mounted) {
          setStatusText(error?.message || "Could not connect wallet.");
        }
      } finally {
        if (mounted) {
          setChecking(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  // PHASE 2 · STEP 2 — sends the image to /api/verify-craft, a real vision-LLM call
  // (OpenAI or Gemini) that judges whether it genuinely looks like an artisan
  // workshop scene. The returned score gates both submission below (>= 70 required)
  // and, later, the on-chain NFT mint itself (ProductNFT.MIN_TERROIR_SCORE).
  async function runAiCheck(file) {
    setAiChecking(true);
    setAiScore(null);
    setAiReason("");
    setAiError("");

    try {
      const result = await verifyCraftImage(file);
      setAiScore(Number(result?.terroir_score));
      setAiReason(String(result?.reason || ""));
    } catch (error) {
      const message = error?.message || "Could not run the AI authenticity check.";
      setAiError(message.trim().replace(/\.+$/, ""));
    } finally {
      setAiChecking(false);
    }
  }

  async function onImageChange(event) {
    const file = event.target.files?.[0] || null;
    setProductImage(file);
    setProductHash("");
    setSuccess(null);
    setAiChecking(false);
    setAiScore(null);
    setAiReason("");
    setAiError("");

    if (!file) {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl("");
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewUrl(URL.createObjectURL(file));

    // PHASE 2 · STEP 1 — hash the image the moment it's selected (before any upload
    // or submit) so productHash exists as soon as possible for the UI to display.
    try {
      const hash = await hashProduct(file);
      setProductHash(hash);
    } catch (error) {
      setStatusText(error?.message || "Could not hash selected file.");
    }

    // PHASE 2 · STEP 2 — kick off the AI authenticity check immediately too, in
    // parallel with the user filling out the rest of the form below.
    await runAiCheck(file);
  }

  function getTruncatedHash(hash) {
    if (!hash || hash.length < 20) {
      return hash;
    }
    return hash.slice(0, 10) + "..." + hash.slice(-6);
  }

  function getTruncatedAddress(address) {
    const text = String(address || "");
    if (!text || text.length < 14) {
      return text;
    }
    return text.slice(0, 8) + "..." + text.slice(-6);
  }

  function isAlreadyRegisteredError(error) {
    const text = String(error?.shortMessage || error?.message || "").toLowerCase();
    return text.includes("product already registered");
  }

  async function onSubmit(event) {
    event.preventDefault();

    if (!productImage) {
      setStatusText("Please upload a product image.");
      return;
    }

    if (!productHash) {
      setStatusText("Product hash not ready yet.");
      return;
    }

    if (aiChecking) {
      setStatusText("AI authenticity check is still running. Please wait.");
      return;
    }

    if (aiError) {
      setStatusText("Could not run the AI authenticity check: " + aiError + ". Re-upload the image to retry.");
      return;
    }

    if (typeof aiScore !== "number" || Number.isNaN(aiScore)) {
      setStatusText("Upload a product image and wait for the AI authenticity check to complete.");
      return;
    }

    if (aiScore < 70) {
      const trimmedReason = aiReason.trim().replace(/\.+$/, "");
      setStatusText(
        "AI authenticity check scored this image " +
        aiScore +
        "/100" +
        (trimmedReason ? " — " + trimmedReason : "") +
        ". Minimum 70 required; registration is blocked."
      );
      return;
    }

    setLoading(true);
    setStatusText("");
    setSuccess(null);
    setStepProgress("Step 1/4: Uploading product image to IPFS...");

    try {
      // PHASE 2 · STEP 3 — upload the raw image to IPFS (via Pinata, through our own
      // /api/ipfs/upload route). Returns a CID; the image itself now lives on IPFS,
      // not on this app's own server.
      const imageCid = await uploadToIPFS(productImage);
      const autoBatch = buildAutoBatchIdentity(productHash);

      // PHASE 2 · STEP 4 — build the attestation metadata JSON, embedding the image's
      // CID plus batch identity, and upload THAT to IPFS too. This second CID (not
      // the image's) is what actually gets stored on-chain as ProductRegistry's
      // ipfsCid -- fetching it is what recovers the image CID + batch info later.
      const metadataPayload = {
        schema: "pramaan.attestation.v1",
        productHash,
        productName: form.name.trim(),
        giTag: form.giTag.trim(),
        imageCid,
        batchIdentity: {
          batchId: autoBatch.batchId,
          lotNumber: autoBatch.lotNumber,
          batchSize: autoBatch.batchSize,
          productionDate: autoBatch.productionDate
        }
      };

      const metadataFile = new File(
        [JSON.stringify(metadataPayload, null, 2)],
        "pramaan-attestation-" + productHash.slice(2, 10) + ".json",
        { type: "application/json" }
      );

      setStepProgress("Step 2/4: Uploading attestation metadata to IPFS...");
      const metadataCid = await uploadToIPFS(metadataFile);

      setStepProgress("Step 3/4: Anchoring product identity on Sepolia...");

      const latScaled = Math.round(Number(form.lat) * 1000000);
      const lngScaled = Math.round(Number(form.lng) * 1000000);

      const signerAddress = sanitizeAddress(form.provenanceSigner);
      const deviceSignature = sanitizeHexBytes(form.deviceSignature);

      if (signerAddress && !/^0x[0-9a-fA-F]{40}$/.test(signerAddress)) {
        throw new Error("Invalid provenance signer address.");
      }

      if (deviceSignature && !/^0x([0-9a-fA-F]{2})+$/.test(deviceSignature)) {
        throw new Error("Invalid device signature. Expected hex bytes.");
      }

      if (signerAddress && signerAddress.toLowerCase() !== walletAddress.toLowerCase() && !deviceSignature) {
        throw new Error("Custom provenance signer requires explicit device signature.");
      }

      // PHASE 2 · STEP 5 — anchor the product on-chain. Inside registerProduct()
      // (src/utils/contract.js) this computes a metadataHash binding these on-chain
      // fields to the IPFS content, then signs an attestation digest -- by default
      // with this same wallet acting as its own "device", unless a separate
      // provenanceSigner/deviceSignature was supplied below. ProductRegistry.sol then
      // verifies that signature on-chain via ECDSA recovery before storing anything.
      const receipt = await registerProduct(
        productHash,
        metadataCid,
        form.name.trim(),
        form.giTag.trim(),
        latScaled,
        lngScaled,
        {
          provenanceSigner: signerAddress,
          deviceSignature,
          batchId: autoBatch.batchId,
          lotNumber: autoBatch.lotNumber,
          batchSize: autoBatch.batchSize,
          productionDate: autoBatch.productionDate
        }
      );

      setStepProgress("Step 4/5: Minting Product NFT twin...");

      const metadataUrl = getIPFSUrl(metadataCid);

      // PHASE 2 · STEP 6 — mint the "digital twin" NFT. aiScore was already validated
      // (>= 70) above, before any IPFS/on-chain calls were made — this is the real AI
      // vision score, not a custody read, matching what ProductNFT.mintProduct's
      // terroirScore param actually gates on. Internally this also registers this
      // artisan as the token's original minter with DynamicRoyalty, which is what
      // makes future resale royalty payouts possible (Phase 5).
      const mintResult = await mintProductTwin(
        walletAddress,
        metadataUrl,
        aiScore,
        metadataCid
      );

      let mintedTokenId = mintResult?.tokenId ? String(mintResult.tokenId) : "";
      if (!mintedTokenId) {
        try {
          const latestTokenId = await findLatestMintedTokenIdByRecipient(walletAddress);
          if (latestTokenId > 0) {
            mintedTokenId = String(latestTokenId);
          }
        } catch (_lookupError) {
          mintedTokenId = "";
        }
      }

      setStepProgress("Step 5/5: Confirming...");

      const txHash = receipt?.transactionHash || receipt?.hash || "";
      const mintTxHash =
        mintResult?.receipt?.transactionHash ||
        mintResult?.receipt?.hash ||
        mintResult?.transactionHash ||
        mintResult?.hash ||
        "";
      const imageUrl = getIPFSUrl(imageCid);
      const verifyUrl = "/verify?hash=" + productHash;
      const transferUrl =
        "/transfer?hash=" +
        productHash +
        (mintedTokenId ? "&tokenId=" + encodeURIComponent(mintedTokenId) : "");
      // PHASE 2 · STEP 7 — build the shareable verify link and QR code (rendered
      // below in the success card). Absolute, not relative: a phone scanning the
      // code is a different device than the one that registered the product, so
      // "/verify?hash=..." alone would have nothing to resolve against.
      const verifyUrlAbsolute = getShareBaseUrl() + verifyUrl;

      setSuccess({
        productHash,
        imageUrl,
        metadataUrl,
        mintedTokenId,
        mintedTerroirScore: aiScore,
        provenanceSigner: signerAddress || walletAddress,
        batchId: autoBatch.batchId,
        lotNumber: autoBatch.lotNumber,
        batchSize: autoBatch.batchSize,
        productionDate: autoBatch.productionDate,
        txUrl: txHash ? "https://sepolia.etherscan.io/tx/" + txHash : "",
        mintTxUrl: mintTxHash ? "https://sepolia.etherscan.io/tx/" + mintTxHash : "",
        verifyUrl,
        verifyUrlAbsolute,
        transferUrl
      });

      if (typeof window !== "undefined") {
        const snapshot = {
          hash: productHash,
          record: {
            productHash,
            ipfsCid: metadataCid,
            artisan: walletAddress,
            productName: form.name.trim(),
            giTag: form.giTag.trim(),
            registeredAt: Math.floor(Date.now() / 1000),
            transferCount: 0,
            handlers: [],
            handlerVerified: []
          },
          terroir: aiScore,
          mintedTokenId: mintedTokenId || ""
        };
        window.sessionStorage.setItem("pramaan:lastRegisteredProduct", JSON.stringify(snapshot));
      }

      setStatusText("Product registered and NFT minted successfully.");
    } catch (error) {
      if (isAlreadyRegisteredError(error)) {
        const verifyUrl = "/verify?hash=" + productHash;
        setStatusText("Product already registered. Redirecting to verification page...");
        setStepProgress("Opening existing record...");
        router.push(verifyUrl);
      } else {
        setStatusText(error?.shortMessage || error?.message || "Product registration failed.");
      }
    } finally {
      setLoading(false);
      setStepProgress("");
    }
  }

  if (checking) {
    return (
      <section className="grid gap-3">
        <h1 className="m-0 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[#f3f6f4]">
          Register Product
        </h1>
        <p className="m-0 text-[#aebbb5]">Checking artisan identity...</p>
      </section>
    );
  }

  if (!isVerified) {
    return (
      <section className="grid gap-4">
        <h1 className="m-0 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[#f3f6f4]">
          Register Product
        </h1>
        <p className="m-0 font-semibold text-[#f87171]">
          {statusText || "You must register as an artisan before registering products."}
        </p>
        <Card className="max-w-2xl border-[#4a1f1f]">
          <CardContent className="grid gap-2 p-4 text-[#aebbb5]">
            {walletAddress && <p className="m-0">Wallet: {walletAddress}</p>}
            <p className="m-0">Artisan Identity ID: {tokenId}</p>
            <Link href="/artisan" className="w-fit no-underline">
              <Button>Go to Artisan Registration</Button>
            </Link>
          </CardContent>
        </Card>
      </section>
    );
  }

  const trimmedAiReason = aiReason.trim().replace(/\.+$/, "");

  const registerDisabled =
    loading ||
    aiChecking ||
    Boolean(aiError) ||
    typeof aiScore !== "number" ||
    Number.isNaN(aiScore) ||
    aiScore < 70;

  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[#f3f6f4]">
          Register Product
        </h1>
        <p className="m-0 text-[#aebbb5]">Upload a photo of your finished product to create its permanent provenance record.</p>
      </div>

      <Card className="max-w-4xl">
        <CardHeader className="pb-2">
          <CardTitle>Verified Artisan</CardTitle>
          <CardDescription>This identity can register products under its own provenance record.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-3 md:col-span-2">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Wallet</p>
            <p className="m-0 break-all font-mono text-sm text-[#f3f6f4]">{walletAddress}</p>
          </div>

          <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Name</p>
            <p className="m-0 text-lg font-semibold text-[#f3f6f4]">{artisan?.name || "-"}</p>
          </div>

          <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Artisan Identity ID</p>
            <p className="m-0 text-lg font-semibold text-[#f3f6f4]">{tokenId}</p>
          </div>

          <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Craft Type</p>
            <p className="m-0 text-base font-medium text-[#f3f6f4]">{artisan?.craft || "-"}</p>
          </div>

          <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">GI Region</p>
            <p className="m-0 text-base font-medium text-[#f3f6f4]">{artisan?.giRegion || giRegions[String(artisan?.craft || "")] || "-"}</p>
          </div>

          <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Aadhaar Status</p>
            <div className="mt-1">
              <Badge variant={artisan?.isAadhaarVerified ? "default" : "warm"}>
                {artisan?.isAadhaarVerified ? "Verified" : "Not Verified"}
              </Badge>
            </div>
          </div>

          <div className="rounded-xl border border-[#26312b] bg-[#1a211e] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Fraud Flag</p>
            <div className="mt-1">
              <Badge variant={artisan?.isFraudulent ? "warm" : "default"}>
                {artisan?.isFraudulent ? "Flagged" : "Clear"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader className="pb-2">
          <CardTitle>Product Details</CardTitle>
          <CardDescription>Batch and lot numbers are filled in automatically; the record is signed and secured behind the scenes.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-3">
            <Input
              required
              placeholder="Product name (e.g. First Flush Darjeeling 2024)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <Input
              required
              placeholder="Category (GI Tag)"
              value={form.giTag}
              onChange={(e) => setForm({ ...form, giTag: e.target.value })}
            />
            <Input
              required
              type="number"
              placeholder="Latitude (auto-filled)"
              value={form.lat}
              onChange={(e) => setForm({ ...form, lat: e.target.value })}
            />
            <Input
              required
              type="number"
              placeholder="Longitude (auto-filled)"
              value={form.lng}
              onChange={(e) => setForm({ ...form, lng: e.target.value })}
            />

            <Input type="file" accept="image/*" required onChange={onImageChange} />

            {previewUrl && (
              <img
                src={previewUrl}
                alt="Product preview"
                className="w-full max-w-md rounded-xl border border-[#26312b]"
              />
            )}

            {productHash && (
              <p className="m-0 font-mono text-[#34d399]">
                Product hash: {getTruncatedHash(productHash)}
              </p>
            )}

            {aiChecking && (
              <div className="flex items-center gap-2">
                <div className="spinner" />
                <span className="text-[#aebbb5]">Checking craft authenticity...</span>
              </div>
            )}

            {aiError && (
              <div className="rounded-xl border border-[#4a1f1f] bg-[#3a1414] px-3 py-2 font-semibold text-[#f87171]">
                Could not run the AI authenticity check: {aiError}. Re-upload the image to retry.
              </div>
            )}

            {typeof aiScore === "number" && !aiChecking && !aiError && (
              <div className="grid gap-2">
                <TerritorScore score={aiScore} />
                {aiReason && <p className="m-0 text-sm text-[#aebbb5]">{aiReason}</p>}
                {aiScore < 70 && (
                  <div className="rounded-xl border border-[#4a1f1f] bg-[#3a1414] px-3 py-2 font-semibold text-[#f87171]">
                    AI authenticity check scored this image {aiScore}/100{trimmedAiReason ? " — " + trimmedAiReason : ""}.
                    Minimum 70 required — registration blocked.
                  </div>
                )}
              </div>
            )}

            <Button type="submit" disabled={registerDisabled} className="w-fit">
              {loading ? "Processing..." : "Register Product"}
            </Button>

            {stepProgress && (
              <div className="rounded-lg border border-dashed border-[#35443c] bg-[#1a211e] px-3 py-2 text-[#34d399]">
                {stepProgress}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {statusText && <p className="m-0 text-[#aebbb5]">{statusText}</p>}

      {success && (
        <Card className="max-w-4xl border-[#1f4a38] bg-[#0f2e22]">
          <CardHeader className="pb-2">
            <CardTitle className="text-[#4ade80]">Registration Complete</CardTitle>
            <CardDescription>Product twin has been anchored successfully.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-[#aebbb5]">
            <div className="rounded-xl border border-[#26312b] bg-[#131917] p-3">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Product Hash</p>
              <p className="m-0 break-all font-mono text-sm text-[#f3f6f4]">{success.productHash}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[#26312b] bg-[#131917] p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Provenance Signer</p>
                <p className="m-0 font-mono text-sm text-[#f3f6f4]" title={success.provenanceSigner}>
                  {getTruncatedAddress(success.provenanceSigner)}
                </p>
              </div>

              <div className="rounded-xl border border-[#26312b] bg-[#131917] p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Production Date</p>
                <p className="m-0 text-base font-semibold text-[#f3f6f4]">{success.productionDate}</p>
              </div>

              <div className="rounded-xl border border-[#26312b] bg-[#131917] p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Batch ID</p>
                <p className="m-0 text-base font-semibold text-[#f3f6f4]">{success.batchId}</p>
              </div>

              <div className="rounded-xl border border-[#26312b] bg-[#131917] p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Lot and Size</p>
                <p className="m-0 text-base font-semibold text-[#f3f6f4]">{success.lotNumber} • {success.batchSize}</p>
              </div>

              <div className="rounded-xl border border-[#26312b] bg-[#131917] p-3 md:col-span-2">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">Product NFT Token ID</p>
                <p className="m-0 text-lg font-semibold text-[#f3f6f4]">{success.mintedTokenId || "Auto-detect on Transfer page"}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <a href={success.imageUrl} target="_blank" rel="noreferrer" className="no-underline">
                <Button variant="secondary">Open IPFS Image</Button>
              </a>
              <a href={success.metadataUrl} target="_blank" rel="noreferrer" className="no-underline">
                <Button variant="secondary">Open Attestation Metadata</Button>
              </a>
              {success.txUrl && (
                <a href={success.txUrl} target="_blank" rel="noreferrer" className="no-underline">
                  <Button variant="secondary">View Registration Tx</Button>
                </a>
              )}
              {success.mintTxUrl && (
                <a href={success.mintTxUrl} target="_blank" rel="noreferrer" className="no-underline">
                  <Button variant="secondary">View Mint Tx</Button>
                </a>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Link href={success.verifyUrl} className="no-underline">
                <Button>Open Verify Page</Button>
              </Link>
              <Link href={success.transferUrl} className="no-underline">
                <Button variant="secondary">Open Transfer Page</Button>
              </Link>
            </div>

            <div className="grid gap-2 rounded-xl border border-[#26312b] bg-[#131917] p-3" style={{ width: "fit-content" }}>
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#8a9891]">
                Scan to Verify (Retailer QR)
              </p>
              <div className="rounded-lg bg-white p-3" style={{ width: "fit-content" }}>
                <QRCodeSVG value={success.verifyUrlAbsolute} size={180} />
              </div>
              <p className="m-0 max-w-[220px] break-all font-mono text-[10px] text-[#8a9891]">
                {success.verifyUrlAbsolute}
              </p>
            </div>

            <div style={{ maxWidth: 340 }}>
              <TerritorScore score={success.mintedTerroirScore} />
            </div>
          </CardContent>
        </Card>
      )}

      <style jsx>{`
        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid #26312b;
          border-top-color: #34d399;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </section>
  );
}
