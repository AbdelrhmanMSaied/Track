export function getSafeNextPath(value: FormDataEntryValue | string | null | undefined) {
  const path = typeof value === "string" ? value : "";
  return /^\/invites\/[A-Za-z0-9_-]{43}$/.test(path) ? path : null;
}
