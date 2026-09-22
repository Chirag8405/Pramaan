// Builds an absolute base URL for links/QR codes that may be opened on a different
// device than the one that generated them (e.g. a QR code scanned by a retailer's
// phone). A relative path like "/verify?hash=..." only works within the same origin,
// so anything meant to be shared or scanned needs the full origin prepended.
export function getShareBaseUrl() {
  const configured =
    String(process.env.NEXT_PUBLIC_APP_URL || "").trim() ||
    String(process.env.NEXT_PUBLIC_VERCEL_URL || "").trim();

  if (configured) {
    const normalized = configured.replace(/\/$/, "");
    if (/^https?:\/\//i.test(normalized)) {
      return normalized;
    }
    return "https://" + normalized;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "";
}
