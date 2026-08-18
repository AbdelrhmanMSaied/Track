export function getSiteUrl(origin?: string | null) {
  let url = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_VERCEL_URL;

  if (!url && process.env.NODE_ENV === "development") {
    const candidate = new URL(origin || "http://localhost:3000");
    if (!["localhost", "127.0.0.1"].includes(candidate.hostname)) throw new Error("Invalid development origin");
    url = candidate.origin;
  }

  if (!url) throw new Error("NEXT_PUBLIC_SITE_URL is required outside development");

  if (!url.startsWith("http")) url = `https://${url}`;
  return url.replace(/\/$/, "");
}
