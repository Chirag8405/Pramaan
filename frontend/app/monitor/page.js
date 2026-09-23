"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, formatEther, http, webSocket } from "viem";
import { sepolia } from "viem/chains";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent } from "../../components/ui/card";
import { PRODUCT_ABI, PRODUCT_NFT_ABI } from "../../src/utils/abi";
import {
  DYNAMIC_ROYALTY_ADDRESS,
  ESCROW_MARKETPLACE_ADDRESS,
  PRODUCT_NFT_ADDRESS,
  PRODUCT_REGISTRY_ADDRESS,
  RPC_URL,
  WS_RPC_URL
} from "../../src/utils/constants";

const ESCROW_EVENTS_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "escrowId", type: "uint256" },
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: true, internalType: "address", name: "buyer", type: "address" },
      { indexed: false, internalType: "address", name: "seller", type: "address" },
      { indexed: false, internalType: "uint256", name: "salePrice", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "shippingDeadline", type: "uint256" }
    ],
    name: "EscrowCreated",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "escrowId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "confirmDeadline", type: "uint256" }
    ],
    name: "EscrowShipped",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "escrowId", type: "uint256" },
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "artisanAmount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "sellerAmount", type: "uint256" }
    ],
    name: "EscrowCompleted",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "escrowId", type: "uint256" },
      { indexed: true, internalType: "address", name: "buyer", type: "address" },
      { indexed: false, internalType: "uint256", name: "amount", type: "uint256" }
    ],
    name: "EscrowRefunded",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "escrowId", type: "uint256" },
      { indexed: true, internalType: "address", name: "raisedBy", type: "address" },
      { indexed: false, internalType: "string", name: "reason", type: "string" }
    ],
    name: "EscrowDisputed",
    type: "event"
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "escrowId", type: "uint256" },
      { indexed: false, internalType: "bool", name: "sellerWins", type: "bool" },
      { indexed: false, internalType: "string", name: "resolution", type: "string" }
    ],
    name: "EscrowResolved",
    type: "event"
  }
];

const ROYALTY_EVENTS_ABI = [
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: true, internalType: "address", name: "seller", type: "address" },
      { indexed: true, internalType: "address", name: "artisan", type: "address" },
      { indexed: false, internalType: "uint256", name: "transferId", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "salePrice", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "artisanAmount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "sellerAmount", type: "uint256" }
    ],
    name: "RoyaltySettled",
    type: "event"
  }
];

export default function MonitorPage() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("Connecting to live event stream...");
  const [feeds, setFeeds] = useState([]);
  const unsubRef = useRef([]);
  const eventIdsRef = useRef(new Set());

  // PHASE 6 · STEP 1 — two separate viem clients for two separate jobs: wsClient
  // stays open over a WebSocket for live, real-time event push notifications;
  // httpClient does one-off request/response reads (used below only to fetch each
  // live event's block timestamp -- no historical backfill, see the note on
  // watchContractEvent below for why).
  const wsClient = useMemo(() => {
    return createPublicClient({
      chain: sepolia,
      transport: webSocket(WS_RPC_URL)
    });
  }, []);

  const httpClient = useMemo(() => {
    return createPublicClient({
      chain: sepolia,
      transport: http(RPC_URL)
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    async function attachWatchers() {
      const hasProductFeed = Boolean(PRODUCT_REGISTRY_ADDRESS);
      const hasEscrowFeed = Boolean(ESCROW_MARKETPLACE_ADDRESS);
      const hasRoyaltyFeed = Boolean(DYNAMIC_ROYALTY_ADDRESS);
      const hasNftFeed = Boolean(PRODUCT_NFT_ADDRESS);

      if (!hasProductFeed && !hasEscrowFeed && !hasRoyaltyFeed && !hasNftFeed) {
        setStatus("No contract addresses configured for monitoring.");
        return;
      }

      const pushEvent = (item) => {
        if (!mounted) {
          return;
        }
        if (!item?.id || eventIdsRef.current.has(item.id)) {
          return;
        }
        eventIdsRef.current.add(item.id);
        setEvents((prev) => {
          const next = [item, ...prev];
          return next.slice(0, 120);
        });
      };

      // Same retry-with-backoff shape as withRpcRetry in
      // app/api/verify-aadhaar/route.js (attempts=3, backoffsMs=[300, 900]) --
      // that function can't be imported here (it's a server-only route module,
      // this is a client component), so this mirrors it locally rather than
      // inventing a different strategy for the same class of problem.
      //
      // Why this is needed at all: wsClient (WebSocket, publicnode) and
      // httpClient (HTTP, Alchemy) are two DIFFERENT RPC providers watching the
      // same chain. A block freshly mined can be pushed by wsClient's live
      // subscription a moment before httpClient's own provider has that exact
      // block queryable yet -- observed directly as a genuine, if brief,
      // BlockNotFoundError right at the moment of a fresh transaction.
      function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }

      async function getBlockWithRetry(blockNumber, attempts = 3, backoffsMs = [300, 900]) {
        let lastError;
        for (let attempt = 0; attempt < attempts; attempt += 1) {
          try {
            return await httpClient.getBlock({ blockNumber });
          } catch (error) {
            lastError = error;
            if (attempt < attempts - 1) {
              await delay(backoffsMs[attempt] ?? backoffsMs[backoffsMs.length - 1]);
            }
          }
        }
        throw lastError;
      }

      const withBlockTimestamp = async (log, payload) => {
        // Fallback if the block is still somehow unavailable after all retries:
        // show the event now, with an honest "time unknown" label, rather than
        // letting one problematic block crash the whole live feed.
        try {
          const block = await getBlockWithRetry(log.blockNumber);
          return {
            ...payload,
            time: new Date(Number(block.timestamp) * 1000).toLocaleString(),
            blockNumber: Number(log.blockNumber),
            txHash: log.transactionHash
          };
        } catch (_error) {
          return {
            ...payload,
            time: "Time unknown (block not yet available from this RPC)",
            blockNumber: Number(log.blockNumber),
            txHash: log.transactionHash
          };
        }
      };

      try {
        const activeFeeds = [];
        const unwatchFns = [];

        // PHASE 6 · STEP 2 — attach a live WebSocket watcher for each event type,
        // across all four contracts (this same watchContractEvent pattern repeats
        // below for ProductNFT, EscrowMarketplace, and DynamicRoyalty). New on-chain
        // events push into the feed the moment they're mined -- no polling, no
        // manual refresh. Deliberately no historical backfill here: this RPC's free
        // tier caps eth_getLogs at a 10-block range, which is functionally useless
        // for scanning any meaningful window of history, so this page only ever
        // shows events from the moment it's opened onward (see the note in the UI).
        if (hasProductFeed) {
          const eventNameToErrorLabel = (eventName) =>
            "Live event stream error for ProductRegistry." + eventName + ". Check the WebSocket endpoint.";

          const unwatchRegistered = wsClient.watchContractEvent({
            address: PRODUCT_REGISTRY_ADDRESS,
            abi: PRODUCT_ABI,
            eventName: "ProductRegistered",
            onLogs: async (logs) => {
              for (const log of logs) {
                const item = await withBlockTimestamp(log, {
                  id: String(log.transactionHash) + ":" + String(log.logIndex) + ":reg",
                  type: "ProductRegistered",
                  source: "ProductRegistry",
                  hash: log.args.productHash
                });
                pushEvent(item);
              }
            },
            onError: () => {
              setStatus(eventNameToErrorLabel("ProductRegistered"));
            }
          });

          const unwatchTransferred = wsClient.watchContractEvent({
            address: PRODUCT_REGISTRY_ADDRESS,
            abi: PRODUCT_ABI,
            eventName: "ProductTransferred",
            onLogs: async (logs) => {
              for (const log of logs) {
                const item = await withBlockTimestamp(log, {
                  id: String(log.transactionHash) + ":" + String(log.logIndex) + ":xfer",
                  type: "ProductTransferred",
                  source: "ProductRegistry",
                  hash: log.args.productHash,
                  from: log.args.from,
                  to: log.args.to,
                  count: Number(log.args.transferCount)
                });
                pushEvent(item);
              }
            },
            onError: () => {
              setStatus(eventNameToErrorLabel("ProductTransferred"));
            }
          });

          const unwatchProvenance = wsClient.watchContractEvent({
            address: PRODUCT_REGISTRY_ADDRESS,
            abi: PRODUCT_ABI,
            eventName: "ProductProvenanceSigned",
            onLogs: async (logs) => {
              for (const log of logs) {
                const item = await withBlockTimestamp(log, {
                  id: String(log.transactionHash) + ":" + String(log.logIndex) + ":prov",
                  type: "ProductProvenanceSigned",
                  source: "ProductRegistry",
                  hash: log.args.productHash,
                  metadataHash: log.args.metadataHash,
                  signer: log.args.signer
                });
                pushEvent(item);
              }
            },
            onError: () => {
              setStatus(eventNameToErrorLabel("ProductProvenanceSigned"));
            }
          });

          const unwatchScanCheckpoint = wsClient.watchContractEvent({
            address: PRODUCT_REGISTRY_ADDRESS,
            abi: PRODUCT_ABI,
            eventName: "ProductScanCheckpoint",
            onLogs: async (logs) => {
              for (const log of logs) {
                const item = await withBlockTimestamp(log, {
                  id: String(log.transactionHash) + ":" + String(log.logIndex) + ":scan",
                  type: "ProductScanCheckpoint",
                  source: "ProductRegistry",
                  hash: log.args.productHash,
                  nonce: log.args.nonce,
                  scanner: log.args.scanner,
                  replayed: Boolean(log.args.replayed)
                });
                pushEvent(item);
              }
            },
            onError: () => {
              setStatus(eventNameToErrorLabel("ProductScanCheckpoint"));
            }
          });

          unwatchFns.push(unwatchRegistered, unwatchTransferred, unwatchProvenance, unwatchScanCheckpoint);
          activeFeeds.push("ProductRegistry");
        }

        if (hasNftFeed) {
          const unwatchMinted = wsClient.watchContractEvent({
            address: PRODUCT_NFT_ADDRESS,
            abi: PRODUCT_NFT_ABI,
            eventName: "ProductMinted",
            onLogs: async (logs) => {
              for (const log of logs) {
                const item = await withBlockTimestamp(log, {
                  id: String(log.transactionHash) + ":" + String(log.logIndex) + ":mint",
                  type: "ProductMinted",
                  source: "ProductNFT",
                  tokenId: Number(log.args.tokenId),
                  artisan: log.args.artisan,
                  to: log.args.recipient
                });
                pushEvent(item);
              }
            },
            onError: () => {
              setStatus("Live event stream error for ProductNFT.ProductMinted. Check the WebSocket endpoint.");
            }
          });

          unwatchFns.push(unwatchMinted);
          activeFeeds.push("ProductNFT");
        }

        if (hasEscrowFeed) {
          const escrowEventNames = [
            "EscrowCreated",
            "EscrowShipped",
            "EscrowCompleted",
            "EscrowRefunded",
            "EscrowDisputed",
            "EscrowResolved"
          ];

          const mapEscrowLog = (eventName, args) => {
            const base = {
              id: "",
              type: eventName,
              source: "EscrowMarketplace"
            };

            if (eventName === "EscrowCreated") {
              Object.assign(base, {
                escrowId: Number(args.escrowId),
                tokenId: Number(args.tokenId),
                buyer: args.buyer,
                seller: args.seller,
                salePriceEth: formatEther(args.salePrice || 0n)
              });
            } else if (eventName === "EscrowShipped") {
              Object.assign(base, {
                escrowId: Number(args.escrowId),
                confirmDeadline: Number(args.confirmDeadline)
              });
            } else if (eventName === "EscrowCompleted") {
              Object.assign(base, {
                escrowId: Number(args.escrowId),
                tokenId: Number(args.tokenId),
                artisanAmountEth: formatEther(args.artisanAmount || 0n),
                sellerAmountEth: formatEther(args.sellerAmount || 0n)
              });
            } else if (eventName === "EscrowRefunded") {
              Object.assign(base, {
                escrowId: Number(args.escrowId),
                buyer: args.buyer,
                refundEth: formatEther(args.amount || 0n)
              });
            } else if (eventName === "EscrowDisputed") {
              Object.assign(base, {
                escrowId: Number(args.escrowId),
                raisedBy: args.raisedBy,
                reason: args.reason
              });
            } else if (eventName === "EscrowResolved") {
              Object.assign(base, {
                escrowId: Number(args.escrowId),
                sellerWins: Boolean(args.sellerWins),
                resolution: args.resolution
              });
            }

            return base;
          };

          for (const eventName of escrowEventNames) {
            const unwatchEscrowEvent = wsClient.watchContractEvent({
              address: ESCROW_MARKETPLACE_ADDRESS,
              abi: ESCROW_EVENTS_ABI,
              eventName,
              onLogs: async (logs) => {
                for (const log of logs) {
                  const args = log.args || {};
                  const base = mapEscrowLog(eventName, args);
                  base.id = String(log.transactionHash) + ":" + String(log.logIndex) + ":" + eventName;
                  const item = await withBlockTimestamp(log, base);
                  pushEvent(item);
                }
              },
              onError: () => {
                setStatus("Live event stream error for EscrowMarketplace." + eventName + ". Check the WebSocket endpoint.");
              }
            });

            unwatchFns.push(unwatchEscrowEvent);
          }

          activeFeeds.push("EscrowMarketplace");
        }

        if (hasRoyaltyFeed) {
          const unwatchRoyalty = wsClient.watchContractEvent({
            address: DYNAMIC_ROYALTY_ADDRESS,
            abi: ROYALTY_EVENTS_ABI,
            eventName: "RoyaltySettled",
            onLogs: async (logs) => {
              for (const log of logs) {
                const args = log.args || {};
                const item = await withBlockTimestamp(log, {
                  id: String(log.transactionHash) + ":" + String(log.logIndex) + ":RoyaltySettled",
                  type: "RoyaltySettled",
                  source: "DynamicRoyalty",
                  tokenId: Number(args.tokenId),
                  transferId: Number(args.transferId),
                  seller: args.seller,
                  artisan: args.artisan,
                  salePriceEth: formatEther(args.salePrice || 0n),
                  artisanAmountEth: formatEther(args.artisanAmount || 0n),
                  sellerAmountEth: formatEther(args.sellerAmount || 0n)
                });
                pushEvent(item);
              }
            },
            onError: () => {
              setStatus("Live event stream error for DynamicRoyalty.RoyaltySettled. Check the WebSocket endpoint.");
            }
          });

          unwatchFns.push(unwatchRoyalty);
          activeFeeds.push("DynamicRoyalty");
        }

        unsubRef.current = unwatchFns;
        setFeeds(activeFeeds);
        setStatus("Live stream connected.");
      } catch (error) {
        setStatus("Could not attach live event watchers: " + (error?.shortMessage || error?.message || "unknown error") + ".");
      }
    }

    attachWatchers();

    return () => {
      mounted = false;
      for (const stop of unsubRef.current) {
        if (typeof stop === "function") {
          stop();
        }
      }
      unsubRef.current = [];
    };
  }, [httpClient, wsClient]);

  return (
    <section className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="m-0 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-[#f3f6f4]">
          Live Monitor
        </h1>
        <p className="m-0 text-[#aebbb5]">
          Unified realtime lifecycle stream for registration, transfer, escrow, disputes, and settlement.
        </p>
        <p className="m-0 text-sm text-[#8a9891]">
          Showing events from now onward -- historical backfill isn&apos;t available on this RPC tier.
        </p>
        <p className="m-0 font-bold text-[#aebbb5]">{status}</p>
        {feeds.length > 0 && (
          <p className="m-0 text-[#8a9891]">Active feeds: {feeds.join(", ")}</p>
        )}
      </div>

      <div className="grid gap-3">
        {events.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-[#aebbb5]">
              No events yet. Trigger register, transfer, escrow, or settlement flows to populate timeline.
            </CardContent>
          </Card>
        )}

        {/* PHASE 6 · STEP 3 — the payoff: a live-updating feed, deduplicated by
            pushEvent's id check above. */}
        {events.map((event) => (
          <Card key={event.id}>
            <CardContent className="grid gap-1.5 pt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge>{event.type}</Badge>
                <span className="text-[#8a9891]">{event.time}</span>
              </div>
              <div className="text-sm text-[#8a9891]">Source: {event.source}</div>
              {event.hash && <div className="break-all font-mono text-sm text-[#aebbb5]">Product Hash: {event.hash}</div>}
              {typeof event.escrowId === "number" && <div className="text-[#aebbb5]">Escrow ID: {event.escrowId}</div>}
              {typeof event.tokenId === "number" && <div className="text-[#aebbb5]">Token ID: {event.tokenId}</div>}
              {event.from && <div className="break-all font-mono text-sm text-[#aebbb5]">From: {event.from}</div>}
              {event.to && <div className="break-all font-mono text-sm text-[#aebbb5]">To: {event.to}</div>}
              {event.buyer && <div className="break-all font-mono text-sm text-[#aebbb5]">Buyer: {event.buyer}</div>}
              {event.seller && <div className="break-all font-mono text-sm text-[#aebbb5]">Seller: {event.seller}</div>}
              {event.raisedBy && <div className="break-all font-mono text-sm text-[#aebbb5]">Raised By: {event.raisedBy}</div>}
              {event.artisan && <div className="break-all font-mono text-sm text-[#aebbb5]">Artisan: {event.artisan}</div>}
              {event.signer && <div className="break-all font-mono text-sm text-[#aebbb5]">Signer: {event.signer}</div>}
              {event.scanner && <div className="break-all font-mono text-sm text-[#aebbb5]">Scanner: {event.scanner}</div>}
              {event.metadataHash && (
                <div className="break-all font-mono text-sm text-[#aebbb5]">Metadata Hash: {event.metadataHash}</div>
              )}
              {event.nonce && <div className="break-all font-mono text-sm text-[#aebbb5]">Nonce: {event.nonce}</div>}
              {typeof event.count === "number" && <div className="text-[#aebbb5]">Transfer Count: {event.count}</div>}
              {typeof event.transferId === "number" && <div className="text-[#aebbb5]">Transfer ID: {event.transferId}</div>}
              {typeof event.replayed === "boolean" && (
                <div className="text-[#aebbb5]">Replay: {event.replayed ? "Detected" : "Fresh nonce"}</div>
              )}
              {event.salePriceEth && <div className="text-[#aebbb5]">Sale Price: {event.salePriceEth} ETH</div>}
              {event.refundEth && <div className="text-[#aebbb5]">Refund: {event.refundEth} ETH</div>}
              {event.artisanAmountEth && <div className="text-[#aebbb5]">Artisan Amount: {event.artisanAmountEth} ETH</div>}
              {event.sellerAmountEth && <div className="text-[#aebbb5]">Seller Amount: {event.sellerAmountEth} ETH</div>}
              {typeof event.sellerWins === "boolean" && (
                <div className="text-[#aebbb5]">Resolution: {event.sellerWins ? "Seller wins" : "Buyer wins"}</div>
              )}
              {event.reason && <div className="text-[#aebbb5]">Reason: {event.reason}</div>}
              {event.resolution && <div className="text-[#aebbb5]">Resolution Notes: {event.resolution}</div>}
              <a
                href={"https://sepolia.etherscan.io/tx/" + event.txHash}
                target="_blank"
                rel="noreferrer"
                className="w-fit font-semibold text-[#34d399] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#34d399] rounded"
              >
                View tx
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
