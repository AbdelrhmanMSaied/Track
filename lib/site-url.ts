export function getSiteUrl(origin?: string | null) {
  let url =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    origin ||
    "http://localhost:3000";

  if (!url.startsWith("http")) url = `https://${url}`;
  return url.replace(/\/$/, "");
}
