/**
 * Heuristic filters for the quote / treatment-request clinic picker:
 * derives searchable tokens from AI analysis JSON and scores clinic rows.
 */

import { cityMatchesQuery } from "./citySearchNormalize";

export type QuoteClinicRow = {
  id: string;
  name: string;
  city?: string | null;
  rating?: number | null;
  /** Optional extras preserved by callers (e.g. browse list). */
  clinicCode?: string | null;
};

/** Terms commonly present in AI analysis text (EN/TR/RU-ish); match substrings in JSON blob. */
const DENTAL_HINTS: { token: string; needle: string }[] = [
  { token: "implant", needle: "implant" },
  { token: "ortodonti", needle: "orthodont" },
  { token: "ortodonti", needle: "braces" },
  { token: "ortodonti", needle: "invisalign" },
  { token: "kaplama", needle: "veneer" },
  { token: "kaplama", needle: "lamina" },
  { token: "kaplama", needle: "crown" },
  { token: "kanal", needle: "root canal" },
  { token: "kanal", needle: "endodont" },
  { token: "çekim", needle: "extraction" },
  { token: "köprü", needle: "bridge" },
  { token: "protez", needle: "denture" },
  { token: "protez", needle: "prosthe" },
  { token: "beyazlatma", needle: "whiten" },
  { token: "dolgu", needle: "filling" },
  { token: "dolgu", needle: "composite" },
  { token: "periodont", needle: "periodont" },
  { token: "gülüş", needle: "smile" },
];

const MAX_KEYWORD_TOKENS = 6;
const MAX_RESULTS = 25;

function analysisBlob(analysis: Record<string, unknown> | null | undefined): string {
  if (!analysis || typeof analysis !== "object") return "";
  try {
    return JSON.stringify(analysis).toLowerCase();
  } catch {
    return "";
  }
}

/** Distinct search tokens inferred from AI analysis (for clinic name matching). */
export function extractDentalSearchTokens(analysis: Record<string, unknown> | null | undefined): string[] {
  const blob = analysisBlob(analysis);
  if (!blob) return [];
  const seen = new Set<string>();
  for (const { token, needle } of DENTAL_HINTS) {
    if (needle.length >= 4 && blob.includes(needle)) {
      seen.add(token);
    }
  }
  return [...seen].slice(0, MAX_KEYWORD_TOKENS);
}

function haystack(c: QuoteClinicRow): string {
  return `${c.name || ""} ${c.city || ""}`.toLowerCase();
}

/**
 * Prefer clinics whose name/city loosely match inferred treatment tokens; keep high ratings on top.
 * If tokens are empty or nothing matches, returns up to MAX_RESULTS sorted by rating.
 */
export function rankClinicsForQuoteRequest(
  rows: QuoteClinicRow[],
  tokens: string[],
): QuoteClinicRow[] {
  if (!rows.length) return [];

  let pool = [...rows];

  if (tokens.length) {
    const matched = pool.filter((c) => {
      const h = haystack(c);
      return tokens.some((t) => t.length >= 3 && h.includes(t));
    });
    if (matched.length) pool = matched;
  }

  pool.sort((a, b) => {
    const ra = typeof a.rating === "number" ? a.rating : -1;
    const rb = typeof b.rating === "number" ? b.rating : -1;
    if (rb !== ra) return rb - ra;
    return (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" });
  });

  return pool.slice(0, MAX_RESULTS);
}

/** Substring filter for city / neighborhood (userRefine); multilingual normalization. */
export function filterClinicsByCityHint(rows: QuoteClinicRow[], raw: string): QuoteClinicRow[] {
  const q = String(raw || "").trim();
  if (q.length < 2) return rows;
  return rows.filter((c) => cityMatchesQuery(q, c.city));
}
