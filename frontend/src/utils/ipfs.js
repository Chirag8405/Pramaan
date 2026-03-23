export async function uploadToIPFS(file) {
  if (!file) {
    throw new Error("uploadToIPFS requires a file.");
  }

  const body = new FormData();
  body.append("file", file);

  const response = await fetch("/api/ipfs/upload", {
    method: "POST",
    body
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "IPFS upload failed.");
  }

  if (!payload?.cid) {
    throw new Error("Pinata upload succeeded but CID was missing.");
  }

  return payload.cid;
}

export function getIPFSUrl(cid) {
  if (!cid) {
    throw new Error("getIPFSUrl requires a CID.");
  }

  const gateway = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud";
  return gateway.replace(/\/$/, "") + "/ipfs/" + cid;
}
