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
