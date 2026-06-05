/** Ensure URLs open correctly in Linking / WebBrowser (prepend https when missing). */
export function normalizeExternalUrl(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  if (/^mailto:/i.test(s) || /^tel:/i.test(s)) return s;
  if (s.startsWith("//")) return `https:${s}`;
  return `https://${s}`;
}
