export function getSafeNextPath(value: FormDataEntryValue | string | null | undefined) {
  const path = typeof value === "string" ? value : "";
  return /^\/invites\/[A-Za-z0-9_-]{43}$/.test(path) || /^\/recruitment\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(path) ? path : null;
}
