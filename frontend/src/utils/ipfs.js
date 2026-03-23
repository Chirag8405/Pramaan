import { Web3Storage } from "web3.storage";

const WEB3STORAGE_TOKEN = process.env.NEXT_PUBLIC_WEB3STORAGE_TOKEN;

export async function uploadToIPFS(file) {
  if (!file) {
    throw new Error("uploadToIPFS requires a file.");
  }

  if (!WEB3STORAGE_TOKEN) {
    throw new Error("Missing NEXT_PUBLIC_WEB3STORAGE_TOKEN environment variable.");
  }

  const client = new Web3Storage({ token: WEB3STORAGE_TOKEN });
  const cid = await client.put([file], { wrapWithDirectory: false });
  return cid;
}

export function getIPFSUrl(cid) {
  if (!cid) {
    throw new Error("getIPFSUrl requires a CID.");
  }

  return "https://" + cid + ".ipfs.w3s.link";
}
