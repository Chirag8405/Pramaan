"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";
import TerritorScore from "../../components/TerritorScore";
import { getArtisan, transferProduct, verifyProduct } from "../../src/utils/contract";
import { RPC_URL } from "../../src/utils/constants";
import { appendEvidenceEntry } from "../../src/utils/evidence";

const publicClient = createPublicClient({
  chain: sepolia,
  transport: http(RPC_URL)
});

export default function TransferPage() {
  const [hash, setHash] = useState("");
  const [recordState, setRecordState] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [stepProgress, setStepProgress] = useState("");

  const [newOwnerInput, setNewOwnerInput] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState("");
  const [ensInfo, setEnsInfo] = useState("");
  const [newOwnerVerified, setNewOwnerVerified] = useState(null);

  const [paymentEth, setPaymentEth] = useState("0.05");
  const [transferSuccess, setTransferSuccess] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const hashFromUrl = params.get("hash") || "";

    if (!hashFromUrl) {
      return;
    }

    setHash(hashFromUrl);
    loadProduct(hashFromUrl);
  }, []);

  function truncateAddress(address) {
    if (!address) {
      return "-";
    }
    return address.slice(0, 6) + "..." + address.slice(-4);
  }

  function getCurrentOwner(record) {
    const handlers = record?.handlers || [];
    if (handlers.length === 0) {
      return record?.artisan || "";
    }
    return handlers[handlers.length - 1];
  }

  function calculateRoyaltyPercent(transferNumber) {
    const n = Math.max(1, Number(transferNumber || 1));
    return 40 / Math.sqrt(n);
  }

  function calculateProjectedTerroir(record, nextOwnerIsVerified) {
    if (!record) {
      return 0;
    }

    let score = 100;
    const existingUnverified = (record.handlerVerified || []).filter((value) => !value).length;
    score -= existingUnverified * 15;

    if (!nextOwnerIsVerified) {
      score -= 15;
    }

    const newTransferCount = Number(record.transferCount || 0) + 1;

    if (newTransferCount > 10) {
      score -= 10;
    }

    const now = Math.floor(Date.now() / 1000);
    const registeredAt = Number(record.registeredAt || 0);
    if (registeredAt > 0 && now < registeredAt + 86400 && newTransferCount > 3) {
      score -= 20;
    }

    return Math.max(0, Math.min(100, score));
  }

  async function loadProduct(inputHash) {
    const clean = String(inputHash || "").trim();
    if (!clean) {
      setStatus("Enter a product hash.");
      return;
    }

    setLoading(true);
    setStatus("Loading product from Sepolia...");
    setTransferSuccess(null);

    try {
      const data = await verifyProduct(clean);
      setRecordState(data);
      setStatus("Product loaded.");
    } catch (error) {
      setRecordState(null);
      setStatus(error?.shortMessage || error?.message || "Could not load product.");
    } finally {
      setLoading(false);
    }
  }

  async function resolveOwnerInput(value) {
    const text = String(value || "").trim();
    setEnsInfo("");
    setResolvedAddress("");
    setNewOwnerVerified(null);

    if (!text) {
      return;
    }

    let candidate = text;

    if (text.includes(".") && !text.startsWith("0x")) {
      try {
        const ensAddress = await publicClient.getEnsAddress({ name: text });
        if (ensAddress) {
          candidate = ensAddress;
          setEnsInfo("ENS resolved to " + ensAddress);
        } else {
          setEnsInfo("ENS name could not be resolved on this network.");
          return;
        }
      } catch (_error) {
        setEnsInfo("ENS resolution failed on this network.");
        return;
      }
    }

    if (!candidate.startsWith("0x") || candidate.length !== 42) {
      setEnsInfo("Invalid wallet address format.");
      return;
    }

    setResolvedAddress(candidate);

    try {
      const artisan = await getArtisan(candidate);
      setNewOwnerVerified(Boolean(artisan?.verified));
    } catch (_error) {
      setNewOwnerVerified(false);
    }
  }

  async function onConfirmTransfer(event) {
    event.preventDefault();

    if (!hash || !recordState?.record) {
      setStatus("Load a valid product hash first.");
      return;
    }

    const targetAddress = resolvedAddress || newOwnerInput.trim();
    if (!targetAddress || !targetAddress.startsWith("0x") || targetAddress.length !== 42) {
      setStatus("Please provide a valid new owner wallet address or resolvable ENS.");
      return;
    }

    setLoading(true);
    setTransferSuccess(null);
    setStepProgress("Step 1/2: Transferring ownership...");

    try {
      const transferNumber = Number(recordState.record.transferCount || 0) + 1;
      const royaltyPercent = calculateRoyaltyPercent(transferNumber);
      const buyerPayment = Number(paymentEth || 0);
      const artisanPayment = (buyerPayment * royaltyPercent) / 100;

      const receipt = await transferProduct(hash.trim(), targetAddress, paymentEth);

      setStepProgress("Step 2/2: Artisan royalty payment sent automatically...");

      const refreshed = await verifyProduct(hash.trim());
      setRecordState(refreshed);

      const txHash = receipt?.transactionHash || receipt?.hash || "";
      if (txHash) {
        appendEvidenceEntry({
          action: "Transfer",
          productHash: hash.trim(),
          txUrl: "https://sepolia.etherscan.io/tx/" + txHash,
          notes: "Transferred to " + targetAddress
        });
      }
      setTransferSuccess({
        txUrl: txHash ? "https://sepolia.etherscan.io/tx/" + txHash : "",
        newTerroir: refreshed.terroir,
        artisanPaymentEth: artisanPayment.toFixed(6)
      });
      setStatus("Transfer completed successfully.");
    } catch (error) {
      setStatus(error?.shortMessage || error?.message || "Transfer failed.");
    } finally {
      setLoading(false);
      setStepProgress("");
    }
  }

  const currentOwner = recordState?.record ? getCurrentOwner(recordState.record) : "";
  const currentTerroir = Number(recordState?.terroir || 0);
  const currentTransferCount = Number(recordState?.record?.transferCount || 0);
  const nextTransferNumber = currentTransferCount + 1;

  const royaltyPercent = calculateRoyaltyPercent(nextTransferNumber);
  const buyerPayment = Number(paymentEth || 0);
  const artisanPayment = (buyerPayment * royaltyPercent) / 100;

  const projectedTerroir = useMemo(() => {
    if (!recordState?.record || newOwnerVerified === null) {
      return null;
    }
    return calculateProjectedTerroir(recordState.record, newOwnerVerified);
  }, [recordState, newOwnerVerified]);

  const decaySamples = [1, 2, 4, 9].map((n) => ({
    n,
    percent: Math.floor(calculateRoyaltyPercent(n))
  }));

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Transfer Product Ownership</h1>
      <p style={{ margin: 0, color: "#466" }}>Transfer ownership with quadratic royalty and terroir impact preview.</p>

      <form onSubmit={(e) => { e.preventDefault(); loadProduct(hash); }} style={formStyle}>
        <input
          required
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          placeholder="Product hash (0x...)"
          style={inputStyle}
        />
        <button type="submit" disabled={loading} style={buttonStyle}>Load Product</button>
      </form>

      {status && <p style={{ margin: 0, color: "#355" }}>{status}</p>}

      {recordState?.record && (
        <>
          <div style={cardStyle}>
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>Current Product State</h3>
            <p style={textStyle}>Product: {recordState.record.productName}</p>
            <p style={textStyle}>Current Owner: {truncateAddress(currentOwner)}</p>
            <p style={textStyle}>Transfer Count: {String(currentTransferCount)}</p>
            <div style={{ maxWidth: 320 }}>
              <TerritorScore score={currentTerroir} />
            </div>
          </div>

          <form onSubmit={onConfirmTransfer} style={formStyle}>
            <input
              required
              value={newOwnerInput}
              onChange={(e) => {
                const value = e.target.value;
                setNewOwnerInput(value);
                resolveOwnerInput(value);
              }}
              placeholder="New owner wallet address or ENS"
              style={inputStyle}
            />

            {ensInfo && <p style={{ margin: 0, color: "#577" }}>{ensInfo}</p>}

            <input
              required
              type="number"
              min="0.0001"
              step="0.0001"
              value={paymentEth}
              onChange={(e) => setPaymentEth(e.target.value)}
              placeholder="Buyer payment (ETH)"
              style={inputStyle}
            />

            <div style={cardStyle}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Quadratic Royalty Calculator</h3>
              <p style={textStyle}>Current transfer number: {nextTransferNumber}</p>
              <p style={textStyle}>Formula: royalty = 40% / sqrt(N)</p>
              <p style={textStyle}>At transfer 1: 40% goes to artisan</p>
              <p style={textStyle}>At transfer 2: 28% goes to artisan</p>
              <p style={textStyle}>At transfer 4: 20% goes to artisan</p>
              <p style={textStyle}>At transfer 9: 13% goes to artisan</p>

              <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginTop: 10, minHeight: 120 }}>
                {decaySamples.map((item) => (
                  <div key={item.n} style={{ display: "grid", justifyItems: "center", gap: 6 }}>
                    <div
                      style={{
                        width: 48,
                        height: item.percent * 2,
                        background: "#7ec9b1",
                        border: "1px solid #5eb39a",
                        borderRadius: 6
                      }}
                    />
                    <div style={{ fontSize: 12, color: "#466" }}>N={item.n}</div>
                    <div style={{ fontSize: 12, color: "#274f45", fontWeight: 700 }}>{item.percent}%</div>
                  </div>
                ))}
              </div>

              <p style={{ marginTop: 12, marginBottom: 0, color: "#274f45", fontWeight: 700 }}>
                For this transfer: artisan receives {artisanPayment.toFixed(6)} ETH of your {buyerPayment.toFixed(6)} ETH payment
              </p>
            </div>

            {projectedTerroir !== null && (
              <div
                style={{
                  background: newOwnerVerified ? "#e2f7ed" : "#fff0e0",
                  border: "1px solid " + (newOwnerVerified ? "#9fd8c0" : "#e7c09f"),
                  borderRadius: 10,
                  padding: "10px 12px"
                }}
              >
                <div style={{ fontWeight: 700, color: newOwnerVerified ? "#186d4c" : "#8a5b09" }}>
                  {newOwnerVerified
                    ? "Score will remain " + currentTerroir + " — verified handler"
                    : "Score will drop from " + currentTerroir + " to " + projectedTerroir + " — unverified handler detected"}
                </div>
              </div>
            )}

            <button disabled={loading} type="submit" style={buttonStyle}>
              {loading ? "Processing..." : "Confirm Transfer"}
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

          {transferSuccess && (
            <div style={cardStyle}>
              <h3 style={{ marginTop: 0, marginBottom: 8, color: "#1f6d50" }}>Transfer Completed</h3>
              <p style={textStyle}>New Terroir Score: {transferSuccess.newTerroir}</p>
              <p style={textStyle}>Artisan payment: {transferSuccess.artisanPaymentEth} ETH</p>
              {transferSuccess.txUrl && (
                <p style={textStyle}>
                  Etherscan: <a href={transferSuccess.txUrl} target="_blank" rel="noreferrer" style={linkStyle}>View tx</a>
                </p>
              )}
            </div>
          )}

          <div style={cardStyle}>
            <p style={{ margin: 0, color: "#466" }}>
              Consumer verification link:{" "}
              <Link href={"/verify?hash=" + hash} style={linkStyle}>
                /verify?hash={hash}
              </Link>
            </p>
          </div>
        </>
      )}
    </section>
  );
}

const formStyle = {
  display: "grid",
  gap: 10,
  maxWidth: 760,
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
