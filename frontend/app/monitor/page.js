"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, http, webSocket } from "viem";
import { sepolia } from "viem/chains";
import { PRODUCT_ABI } from "../../src/utils/abi";
import { PRODUCT_REGISTRY_ADDRESS, RPC_URL, WS_RPC_URL } from "../../src/utils/constants";

export default function MonitorPage() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState("Connecting to live event stream...");
  const unsubRef = useRef([]);

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
      if (!PRODUCT_REGISTRY_ADDRESS) {
        setStatus("Missing PRODUCT_REGISTRY_ADDRESS in env.");
        return;
      }

      const pushEvent = (item) => {
        if (!mounted) {
          return;
        }
        setEvents((prev) => [item, ...prev].slice(0, 60));
      };

      try {
        const unwatchRegistered = wsClient.watchContractEvent({
          address: PRODUCT_REGISTRY_ADDRESS,
          abi: PRODUCT_ABI,
          eventName: "ProductRegistered",
          onLogs: async (logs) => {
            for (const log of logs) {
              const block = await httpClient.getBlock({ blockNumber: log.blockNumber });
              pushEvent({
                id: String(log.transactionHash) + ":reg",
                type: "ProductRegistered",
                hash: log.args.productHash,
                txHash: log.transactionHash,
                time: new Date(Number(block.timestamp) * 1000).toLocaleString()
              });
            }
          },
          onError: () => {
            setStatus("Live stream error. Check WS endpoint.");
          }
        });

        const unwatchTransferred = wsClient.watchContractEvent({
          address: PRODUCT_REGISTRY_ADDRESS,
          abi: PRODUCT_ABI,
          eventName: "ProductTransferred",
          onLogs: async (logs) => {
            for (const log of logs) {
              const block = await httpClient.getBlock({ blockNumber: log.blockNumber });
              pushEvent({
                id: String(log.transactionHash) + ":xfer",
                type: "ProductTransferred",
                hash: log.args.productHash,
                txHash: log.transactionHash,
                from: log.args.from,
                to: log.args.to,
                count: Number(log.args.transferCount),
                time: new Date(Number(block.timestamp) * 1000).toLocaleString()
              });
            }
          },
          onError: () => {
            setStatus("Live stream error. Check WS endpoint.");
          }
        });

        unsubRef.current = [unwatchRegistered, unwatchTransferred];
        setStatus("Live stream connected.");
      } catch (_error) {
        setStatus("Could not connect to websocket stream.");
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
    <section style={{ display: "grid", gap: 14 }}>
      <h1 style={{ margin: 0 }}>Live Monitor</h1>
      <p style={{ margin: 0, color: "#466" }}>
        Realtime timeline of ProductRegistered and ProductTransferred events.
      </p>
      <p style={{ margin: 0, color: "#355", fontWeight: 700 }}>{status}</p>

      <div style={{ display: "grid", gap: 10 }}>
        {events.length === 0 && (
          <div style={cardStyle}>No events yet. Trigger register/transfer flows to populate timeline.</div>
        )}

        {events.map((event) => (
          <div key={event.id} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ color: "#1f6d50" }}>{event.type}</strong>
              <span style={{ color: "#55756c" }}>{event.time}</span>
            </div>
            <div style={monoText}>Product Hash: {event.hash}</div>
            {event.from && <div style={monoText}>From: {event.from}</div>}
            {event.to && <div style={monoText}>To: {event.to}</div>}
            {typeof event.count === "number" && <div style={{ color: "#355" }}>Transfer Count: {event.count}</div>}
            <a href={"https://sepolia.etherscan.io/tx/" + event.txHash} target="_blank" rel="noreferrer" style={linkStyle}>
              View tx
            </a>
          </div>
        ))}
      </div>
    </section>
  );
}

const cardStyle = {
  background: "#fff",
  border: "1px solid #d9ebe4",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 6
};

const monoText = {
  color: "#355",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  wordBreak: "break-all"
};

const linkStyle = {
  color: "#176f52",
  fontWeight: 700,
  textDecoration: "none"
};
