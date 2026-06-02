/** Detect patient-sent URLs — staff should not open (phishing / malware risk). */

const URL_PATTERN =
  /(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/**
 * @param {string} [text]
 */
export function messageContainsExternalLink(text: string): boolean {
  const t = String(text || "").trim();
  if (!t) return false;
  URL_PATTERN.lastIndex = 0;
  return URL_PATTERN.test(t);
}

/**
 * @param {string} [text]
 */
export function extractExternalLinks(text: string): string[] {
  const t = String(text || "").trim();
  if (!t) return [];
  URL_PATTERN.lastIndex = 0;
  const found = t.match(URL_PATTERN) || [];
  return [...new Set(found.map((s) => s.replace(/[.,;:!?)]+$/, "")))];
}
