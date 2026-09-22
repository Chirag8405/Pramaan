"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import {
  connectWallet,
  getConnectedAddressIfAvailable,
  getProductMeta,
  getProductNftTokenIdsOwnedBy,
  verifyProduct
} from "../../src/utils/contract";
import { getIPFSUrl } from "../../src/utils/ipfs";

// One ProductNFT token, resolved back to its ProductRegistry record. ProductNFT
// token IDs and ProductRegistry product hashes are two separate ID spaces with no
// on-chain link between them -- the only bridge is the IPFS metadata itself, whose
// CID is stored on the NFT (`provenanceCid`) and whose *contents* embed the
// productHash that was used to register it. So resolving one product requires:
// on-chain read (productMeta) -> IPFS fetch (recover productHash) -> on-chain read
// (verifyProduct, for the live, custody-based trust score).
async function resolveProduct(tokenId) {
  const meta = await getProductMeta(tokenId);

  const metadataUrl = getIPFSUrl(meta.provenanceCid);
  const response = await fetch(metadataUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Could not fetch metadata for token " + tokenId);
  }
  const metadata = await response.json();

  const productHash = String(metadata?.productHash || "").trim();
  if (!productHash) {
    throw new Error("Metadata for token " + tokenId + " has no productHash.");
  }

  let liveTerroir = null;
  try {
    const { terroir } = await verifyProduct(productHash);
    liveTerroir = Number(terroir);
  } catch (_error) {
    // Non-fatal: still show the product with its frozen mint-time score.
  }

  const imageCid = String(metadata?.imageCid || "").trim();

  return {
    tokenId,
    productHash,
    productName: metadata?.productName || "Unknown product",
    giTag: metadata?.giTag || "",
    batchId: metadata?.batchIdentity?.batchId || "",
    productionDate: metadata?.batchIdentity?.productionDate || "",
    mintedTerroirScore: meta.terroirScore,
    liveTerroir,
    imageUrl: imageCid ? getIPFSUrl(imageCid) : "",
    verifyUrl: "/verify?hash=" + productHash,
    transferUrl: "/transfer?hash=" + productHash + "&tokenId=" + tokenId
  };
}

export default function MyProductsPage() {
  const [address, setAddress] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [products, setProducts] = useState([]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    const existing = getConnectedAddressIfAvailable();
    if (existing) {
      setAddress(existing);
    }
  }, [hydrated]);

  useEffect(() => {
    if (!address) {
      setProducts([]);
      return;
    }

    let active = true;

    async function load() {
      setLoading(true);
      setStatus("Looking up your minted products...");
      setProducts([]);

      try {
        const tokenIds = await getProductNftTokenIdsOwnedBy(address);

        if (!active) {
          return;
        }

        if (tokenIds.length === 0) {
          setStatus("No products found for this wallet yet.");
          return;
        }

        setStatus("Loading details for " + tokenIds.length + " product(s)...");

        const settled = await Promise.allSettled(tokenIds.map(resolveProduct));
        if (!active) {
          return;
        }

        const resolved = settled
          .filter((result) => result.status === "fulfilled")
          .map((result) => result.value);
        const failedCount = settled.length - resolved.length;

        setProducts(resolved);
        setStatus(
          failedCount > 0
            ? "Loaded " + resolved.length + " product(s) -- " + failedCount + " could not be resolved."
            : ""
        );
      } catch (error) {
        if (active) {
          setStatus(error?.shortMessage || error?.message || "Could not load your products.");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, [address]);

  async function onConnect() {
    try {
      const result = await connectWallet();
      setAddress(result.address);
    } catch (error) {
      setStatus(error?.shortMessage || error?.message || "Failed to connect wallet.");
    }
  }

  if (!hydrated) {
    return (
      <section className="grid gap-4">
        <h1 className="m-0 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[#f3f6f4]">
          My Products
        </h1>
        <p className="m-0 text-[#aebbb5]">Loading...</p>
      </section>
    );
  }

  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[#f3f6f4]">
          My Products
        </h1>
        <p className="m-0 text-[#aebbb5]">Every product you&apos;ve registered and minted, with its live metadata.</p>
      </div>

      <div>
        <Button onClick={onConnect} className="min-w-44">
          {address ? "Connected: " + address.slice(0, 8) + "..." : "Connect Wallet"}
        </Button>
      </div>

      {status && <p className="m-0 text-[#aebbb5]">{status}</p>}

      {!address && (
        <Card className="max-w-3xl">
          <CardContent className="pt-6 text-sm text-[#aebbb5]">
            Connect the wallet you registered products with to see them here.
          </CardContent>
        </Card>
      )}

      {products.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <Card key={product.tokenId} className="border-[#26312b] bg-[#131917]">
              <CardHeader className="pb-2">
                <CardTitle className="text-base text-[#f3f6f4]">{product.productName}</CardTitle>
                <CardDescription>{product.giTag || "No GI tag"}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                {product.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={product.imageUrl}
                    alt={product.productName}
                    className="h-40 w-full rounded-lg border border-[#26312b] object-cover"
                  />
                )}

                <div className="grid gap-1 text-xs text-[#8a9891]">
                  <p className="m-0">Token ID: <span className="font-mono text-[#f3f6f4]">{product.tokenId}</span></p>
                  <p className="m-0">Batch: <span className="text-[#f3f6f4]">{product.batchId || "-"}</span></p>
                  <p className="m-0">Produced: <span className="text-[#f3f6f4]">{product.productionDate || "-"}</span></p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="neutral">Minted score: {product.mintedTerroirScore}</Badge>
                  {product.liveTerroir !== null && (
                    <Badge variant={product.liveTerroir >= 80 ? "default" : "warm"}>
                      Live score: {product.liveTerroir}
                    </Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link href={product.verifyUrl} className="no-underline">
                    <Button >Verify</Button>
                  </Link>
                  <Link href={product.transferUrl} className="no-underline">
                    <Button  variant="secondary">Sell</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!loading && address && products.length === 0 && !status && (
        <Card className="max-w-3xl">
          <CardContent className="pt-6 text-sm text-[#aebbb5]">
            No products registered yet.{" "}
            <Link href="/register-product" className="font-semibold text-[#34d399] no-underline">
              Register your first one
            </Link>
            .
          </CardContent>
        </Card>
      )}
    </section>
  );
}
