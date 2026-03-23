export async function hashProduct(file) {
  if (!file) {
    throw new Error("hashProduct requires a file.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const digestBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const digestArray = Array.from(new Uint8Array(digestBuffer));

  const hex = digestArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return "0x" + hex;
}

async function digestUtf8String(value) {
  const encoded = new TextEncoder().encode(value);
  const digestBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const digestArray = Array.from(new Uint8Array(digestBuffer));
  const hex = digestArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return "0x" + hex;
}

export async function hashMetadataObject(metadata) {
  const canonicalJson = JSON.stringify(metadata, Object.keys(metadata).sort());
  return digestUtf8String(canonicalJson);
}

export function makeScanNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
