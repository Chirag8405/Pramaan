"use client";

import Link from "next/link";
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
  verifyProduct
} from "../../src/utils/contract";
import { hashProduct } from "../../src/utils/hash";
import { getIPFSUrl, uploadToIPFS } from "../../src/utils/ipfs";

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

  async function onImageChange(event) {
    const file = event.target.files?.[0] || null;
    setProductImage(file);
    setProductHash("");
    setSuccess(null);

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

    try {
      const hash = await hashProduct(file);
      setProductHash(hash);
    } catch (error) {
      setStatusText(error?.message || "Could not hash selected file.");
    }
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

    setLoading(true);
    setStatusText("");
    setSuccess(null);
    setStepProgress("Step 1/4: Uploading product image to IPFS...");

    try {
      const imageCid = await uploadToIPFS(productImage);
      const autoBatch = buildAutoBatchIdentity(productHash);

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
      let mintTerroirScore = 100;
      try {
        // Best-effort read; do not fail mint flow if RPC/state indexing lags.
        const verification = await verifyProduct(productHash);
        mintTerroirScore = Number(verification?.terroir || 100);
      } catch (_verifyError) {
        mintTerroirScore = 100;
      }

      const mintResult = await mintProductTwin(
        walletAddress,
        metadataUrl,
        mintTerroirScore,
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

      setSuccess({
        productHash,
        imageUrl,
        metadataUrl,
        mintedTokenId,
        provenanceSigner: signerAddress || walletAddress,
        batchId: autoBatch.batchId,
        lotNumber: autoBatch.lotNumber,
        batchSize: autoBatch.batchSize,
        productionDate: autoBatch.productionDate,
        txUrl: txHash ? "https://sepolia.etherscan.io/tx/" + txHash : "",
        mintTxUrl: mintTxHash ? "https://sepolia.etherscan.io/tx/" + mintTxHash : "",
        verifyUrl,
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
          terroir: 100,
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
        <h1 className="m-0 text-3xl font-bold text-[#20473d]">Register Product</h1>
        <p className="m-0 text-[#49665e]">Checking artisan identity...</p>
      </section>
    );
  }

  if (!isVerified) {
    return (
      <section className="grid gap-4">
        <h1 className="m-0 text-3xl font-bold text-[#20473d]">Register Product</h1>
        <p className="m-0 font-semibold text-[#8a1f1f]">
          {statusText || "You must register as an artisan before registering products."}
        </p>
        <Card className="max-w-2xl bg-[#fff9f9]">
          <CardContent className="grid gap-2 p-4 text-[#49665e]">
            {walletAddress && <p className="m-0">Wallet: {walletAddress}</p>}
            <p className="m-0">SBT Token ID: {tokenId}</p>
            <Link href="/artisan" className="w-fit no-underline">
              <Button>Go to Artisan Registration</Button>
            </Link>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 text-3xl font-bold text-[#20473d]">Register Product</h1>
        <p className="m-0 text-[#49665e]">Upload product proof, hash it, pin to IPFS, then register on-chain.</p>
      </div>

      <Card className="max-w-4xl">
        <CardHeader className="pb-2">
          <CardTitle>Verified Artisan</CardTitle>
          <CardDescription>This identity is eligible to register product twins.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3 md:col-span-2">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Wallet</p>
            <p className="m-0 break-all font-mono text-sm text-[#20473d]">{walletAddress}</p>
          </div>

          <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Name</p>
            <p className="m-0 text-lg font-semibold text-[#20473d]">{artisan?.name || "-"}</p>
          </div>

          <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">SBT Token ID</p>
            <p className="m-0 text-lg font-semibold text-[#20473d]">{tokenId}</p>
          </div>

          <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Craft Type</p>
            <p className="m-0 text-base font-medium text-[#20473d]">{artisan?.craft || "-"}</p>
          </div>

          <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">GI Region</p>
            <p className="m-0 text-base font-medium text-[#20473d]">{artisan?.giRegion || giRegions[String(artisan?.craft || "")] || "-"}</p>
          </div>

          <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Aadhaar Status</p>
            <div className="mt-1">
              <Badge variant={artisan?.isAadhaarVerified ? "default" : "warm"}>
                {artisan?.isAadhaarVerified ? "Verified" : "Not Verified"}
              </Badge>
            </div>
          </div>

          <div className="rounded-xl border border-[#dce8e3] bg-[#f8fcfb] p-3">
            <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Fraud Flag</p>
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
          <CardTitle>Product Metadata</CardTitle>
          <CardDescription>Demo-friendly form with visible auto-filled logistics fields and background attestation security.</CardDescription>
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
                className="w-full max-w-md rounded-xl border border-[#d3e6df]"
              />
            )}

            {productHash && (
              <p className="m-0 font-mono text-[#2f5a50]">
                Product hash: {getTruncatedHash(productHash)}
              </p>
            )}

            <Button type="submit" disabled={loading} className="w-fit">
              {loading ? "Processing..." : "Register Product"}
            </Button>

            {stepProgress && (
              <div className="rounded-lg border border-dashed border-[#b4d8cb] bg-[#eff8f4] px-3 py-2 text-[#2f5a50]">
                {stepProgress}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {statusText && <p className="m-0 text-[#355]">{statusText}</p>}

      {success && (
        <Card className="max-w-4xl border-[#cde6dc] bg-[#f4fbf8]">
          <CardHeader className="pb-2">
            <CardTitle className="text-[#1f6d50]">Registration Complete</CardTitle>
            <CardDescription>Product twin has been anchored successfully.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-[#355]">
            <div className="rounded-xl border border-[#c9e2d8] bg-white p-3">
              <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Product Hash</p>
              <p className="m-0 break-all font-mono text-sm text-[#20473d]">{success.productHash}</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-[#c9e2d8] bg-white p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Provenance Signer</p>
                <p className="m-0 font-mono text-sm text-[#20473d]" title={success.provenanceSigner}>
                  {getTruncatedAddress(success.provenanceSigner)}
                </p>
              </div>

              <div className="rounded-xl border border-[#c9e2d8] bg-white p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Production Date</p>
                <p className="m-0 text-base font-semibold text-[#20473d]">{success.productionDate}</p>
              </div>

              <div className="rounded-xl border border-[#c9e2d8] bg-white p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Batch ID</p>
                <p className="m-0 text-base font-semibold text-[#20473d]">{success.batchId}</p>
              </div>

              <div className="rounded-xl border border-[#c9e2d8] bg-white p-3">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Lot and Size</p>
                <p className="m-0 text-base font-semibold text-[#20473d]">{success.lotNumber} • {success.batchSize}</p>
              </div>

              <div className="rounded-xl border border-[#c9e2d8] bg-white p-3 md:col-span-2">
                <p className="m-0 text-xs font-semibold uppercase tracking-wide text-[#607b72]">Product NFT Token ID</p>
                <p className="m-0 text-lg font-semibold text-[#20473d]">{success.mintedTokenId || "Auto-detect on Transfer page"}</p>
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

            <div style={{ maxWidth: 340 }}>
              <TerritorScore score={100} />
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
