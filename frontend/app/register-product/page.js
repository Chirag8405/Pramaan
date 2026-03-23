"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import TerritorScore from "../../components/TerritorScore";
import { giRegions } from "../../src/utils/craftDetector";
import { getArtisan, getArtisanTokenId, connectWallet, isVerifiedArtisan, registerProduct } from "../../src/utils/contract";
import { hashProduct } from "../../src/utils/hash";
import { getIPFSUrl, uploadToIPFS } from "../../src/utils/ipfs";

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
    lat: "",
    lng: "",
    batchSize: ""
  });

  const [productImage, setProductImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [productHash, setProductHash] = useState("");
  const [statusText, setStatusText] = useState("");
  const [stepProgress, setStepProgress] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);

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
          giTag: String(artisanRecord.craft || "")
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
    setStepProgress("Step 1/3: Uploading product image to IPFS...");

    try {
      const cid = await uploadToIPFS(productImage);

      setStepProgress("Step 2/3: Anchoring product identity on Sepolia...");

      const latScaled = Math.round(Number(form.lat) * 1000000);
      const lngScaled = Math.round(Number(form.lng) * 1000000);

      const receipt = await registerProduct(
        productHash,
        cid,
        form.name.trim(),
        form.giTag.trim(),
        latScaled,
        lngScaled
      );

      setStepProgress("Step 3/3: Confirming...");

      const txHash = receipt?.transactionHash || receipt?.hash || "";
      const ipfsUrl = getIPFSUrl(cid);
      const verifyUrl = "/verify?hash=" + productHash;
      const transferUrl = "/transfer?hash=" + productHash;

      setSuccess({
        productHash,
        ipfsUrl,
        txUrl: txHash ? "https://sepolia.etherscan.io/tx/" + txHash : "",
        verifyUrl,
        transferUrl
      });

      setStatusText("Product registered successfully.");
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
      <section style={{ display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Register Product</h1>
        <p style={{ margin: 0, color: "#466" }}>Checking artisan identity...</p>
      </section>
    );
  }

  if (!isVerified) {
    return (
      <section style={{ display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Register Product</h1>
        <p style={{ margin: 0, color: "#8a1f1f", fontWeight: 600 }}>
          {statusText || "You must register as an artisan before registering products."}
        </p>
        {walletAddress && <p style={{ margin: 0, color: "#466" }}>Wallet: {walletAddress}</p>}
        <p style={{ margin: 0, color: "#466" }}>SBT Token ID: {tokenId}</p>
        <Link href="/artisan" style={linkStyle}>
          Go to Artisan Registration
        </Link>
      </section>
    );
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Register Product</h1>
      <p style={{ margin: 0, color: "#466" }}>
        Upload product proof, hash it, pin to IPFS, then register on-chain.
      </p>

      <div style={cardStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 10 }}>Verified Artisan</h3>
        <p style={textStyle}>Wallet: {walletAddress}</p>
        <p style={textStyle}>Name: {artisan?.name}</p>
        <p style={textStyle}>Craft Type: {artisan?.craft}</p>
        <p style={textStyle}>GI Region: {artisan?.giRegion || giRegions[String(artisan?.craft || "")] || "-"}</p>
        <p style={textStyle}>Aadhaar Verified: {artisan?.isAadhaarVerified ? "Yes" : "No"}</p>
        <p style={textStyle}>Fraud Flag: {artisan?.isFraudulent ? "Yes" : "No"}</p>
        <p style={textStyle}>SBT Token ID: {tokenId}</p>
      </div>

      <form onSubmit={onSubmit} style={formStyle}>
        <input
          required
          placeholder="Product name (e.g. First Flush Darjeeling 2024)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          style={inputStyle}
        />
        <input
          required
          placeholder="GI Tag"
          value={form.giTag}
          readOnly
          style={inputStyle}
        />
        <input
          required
          type="number"
          placeholder="Latitude"
          value={form.lat}
          onChange={(e) => setForm({ ...form, lat: e.target.value })}
          style={inputStyle}
        />
        <input
          required
          type="number"
          placeholder="Longitude"
          value={form.lng}
          onChange={(e) => setForm({ ...form, lng: e.target.value })}
          style={inputStyle}
        />

        <input
          type="number"
          placeholder="Batch size (optional)"
          value={form.batchSize}
          onChange={(e) => setForm({ ...form, batchSize: e.target.value })}
          style={inputStyle}
        />

        <input type="file" accept="image/*" required onChange={onImageChange} style={inputStyle} />

        {previewUrl && (
          <img
            src={previewUrl}
            alt="Product preview"
            style={{ width: "100%", maxWidth: 360, borderRadius: 10, border: "1px solid #d3e6df" }}
          />
        )}

        {productHash && (
          <p style={{ margin: 0, color: "#2f5a50", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            Product hash: {getTruncatedHash(productHash)}
          </p>
        )}

        <button type="submit" disabled={loading} style={buttonStyle}>
          {loading ? "Processing..." : "Register Product"}
        </button>

        {stepProgress && (
          <div
            style={{
              border: "1px dashed #b4d8cb",
              borderRadius: 8,
              padding: "8px 10px",
              color: "#2f5a50",
              background: "#eff8f4"
            }}
          >
            {stepProgress}
          </div>
        )}
      </form>

      {statusText && <p style={{ margin: 0, color: "#355" }}>{statusText}</p>}

      {success && (
        <div style={cardStyle}>
          <h3 style={{ marginTop: 0, marginBottom: 8, color: "#1f6d50" }}>Registration Complete</h3>
          <p style={textStyle}>Product hash: {success.productHash}</p>
          <p style={textStyle}>
            IPFS Image:{" "}
            <a href={success.ipfsUrl} target="_blank" rel="noreferrer" style={linkStyle}>
              {success.ipfsUrl}
            </a>
          </p>
          {success.txUrl && (
            <p style={textStyle}>
              Etherscan:{" "}
              <a href={success.txUrl} target="_blank" rel="noreferrer" style={linkStyle}>
                View tx
              </a>
            </p>
          )}

          <div style={{ maxWidth: 340, marginTop: 12 }}>
            <TerritorScore score={100} />
          </div>

          <p style={textStyle}>
            Verification URL:{" "}
            <Link href={success.verifyUrl} style={linkStyle}>
              {success.verifyUrl}
            </Link>
          </p>

          <Link href={success.transferUrl} style={buttonStyle}>
            Transfer Ownership
          </Link>
        </div>
      )}
    </section>
  );
}

const formStyle = {
  display: "grid",
  gap: 10,
  maxWidth: 560,
  background: "#fff",
  border: "1px solid #d9ebe4",
  borderRadius: 12,
  padding: 14
};

const inputStyle = {
  border: "1px solid #cfe2db",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14
};

const buttonStyle = {
  background: "#1D9E75",
  color: "white",
  border: "none",
  borderRadius: 8,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
  width: "fit-content",
  textDecoration: "none",
  display: "inline-block"
};

const cardStyle = {
  background: "#fff",
  border: "1px solid #d9ebe4",
  borderRadius: 12,
  padding: 14,
  maxWidth: 760
};

const textStyle = { margin: "4px 0", color: "#355" };

const linkStyle = {
  color: "#176f52",
  fontWeight: 700,
  textDecoration: "none"
};
