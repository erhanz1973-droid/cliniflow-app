/** Mirror of backend lib/cityCodes.cjs — keep aliases in sync. */

const KNOWN_CODES = new Set(["tbilisi"]);

const EXACT_UNICODE_ALIASES = new Map([
  ["тбилиси", "tbilisi"],
  ["Тбилиси", "tbilisi"],
  ["თბილისი", "tbilisi"],
]);

const LOWERCASE_ALIASES: Record<string, string> = {
  tbilisi: "tbilisi",
  tiflis: "tbilisi",
  tblisi: "tbilisi",
  tiblisi: "tbilisi",
  тбилиси: "tbilisi",
};

export function resolveCityCode(raw: unknown): string | null {
  if (raw == null) return null;
  const s0 = String(raw).trim();
  if (!s0) return null;
  const fromExact = EXACT_UNICODE_ALIASES.get(s0);
  if (fromExact) return fromExact;
  const lower = s0.toLowerCase();
  if (KNOWN_CODES.has(lower)) return lower;
  const fromAlias = LOWERCASE_ALIASES[lower];
  if (fromAlias) return fromAlias;
  return null;
}

/** i18n key for canonical slug, e.g. city.tbilisi */
export function cityTranslationKey(canonicalSlug: string | null | undefined): string | null {
  if (!canonicalSlug || !String(canonicalSlug).trim()) return null;
  return `city.${String(canonicalSlug).trim().toLowerCase()}`;
}

/** Lowercase ASCII slug for APIs — mirror backend `normalizeCity`. */
export function normalizeCity(raw: unknown): string {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
  return s;
}
