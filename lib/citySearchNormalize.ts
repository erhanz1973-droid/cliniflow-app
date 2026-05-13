/**
 * Multilingual city matching for client-side (and mirrored in `../../lib/citySearchNormalize.cjs` for API).
 * Georgian / Cyrillic / Latin variants fold to comparable ASCII keys so "Tiflis", "tbilisi",
 * "თბილისი", "Тбилиси" align.
 *
 * Keep backend `lib/citySearchNormalize.cjs` in sync when changing this file.
 */

/** Known exonyms / spellings → canonical compact Latin slug (ASCII, no spaces). */
const CITY_ALIAS_TO_CANONICAL: Record<string, string> = {
  tiflis: "tbilisi",
  tiflisi: "tbilisi",
  tifliszi: "tbilisi",
  tiphlisi: "tbilisi",
  tifliss: "tbilisi",
  stambul: "istanbul",
  constantinople: "istanbul",
  konstantinopolis: "istanbul",
  kiev: "kyiv",
  kyjev: "kyiv",
  munich: "munchen",
  munchen: "munchen",
  vienne: "wien",
};

const GEORGIAN_TO_LATIN: Record<string, string> = {
  ა: "a",
  ბ: "b",
  გ: "g",
  დ: "d",
  ე: "e",
  ვ: "v",
  ზ: "z",
  თ: "t",
  ი: "i",
  კ: "k",
  ლ: "l",
  მ: "m",
  ნ: "n",
  ო: "o",
  პ: "p",
  ჟ: "zh",
  რ: "r",
  ს: "s",
  ტ: "t",
  უ: "u",
  ფ: "p",
  ქ: "k",
  ღ: "gh",
  ყ: "q",
  შ: "sh",
  ჩ: "ch",
  ც: "ts",
  ძ: "dz",
  წ: "ts",
  ჭ: "ch",
  ხ: "kh",
  ჯ: "j",
  ჰ: "h",
};

const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  і: "i",
  ї: "yi",
  є: "ye",
  ґ: "g",
};

function stripLatinDiacritics(s: string): string {
  try {
    return s.normalize("NFD").replace(/\p{M}/gu, "");
  } catch {
    return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
}

function mapChar(ch: string): string {
  const lo = ch.toLowerCase();
  if (GEORGIAN_TO_LATIN[ch]) return GEORGIAN_TO_LATIN[ch];
  if (GEORGIAN_TO_LATIN[lo]) return GEORGIAN_TO_LATIN[lo];
  if (CYRILLIC_TO_LATIN[ch]) return CYRILLIC_TO_LATIN[ch];
  if (CYRILLIC_TO_LATIN[lo]) return CYRILLIC_TO_LATIN[lo];
  return lo;
}

/**
 * Lowercase, strip Latin accents, transliterate Georgian + Cyrillic to Latin-ish ASCII.
 */
export function normalizeCityLatin(raw: string): string {
  const s = String(raw || "")
    .normalize("NFKC")
    .trim();
  if (!s) return "";
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x10a0 && cp <= 0x10ff) {
      out += mapChar(ch);
      continue;
    }
    if (cp >= 0x0400 && cp <= 0x04ff) {
      out += mapChar(ch);
      continue;
    }
    out += ch;
  }
  return stripLatinDiacritics(out).toLowerCase();
}

/** Collapse to a-z0-9 only (compact key for substring / alias match). */
export function compactCityKey(latinNormalized: string): string {
  return String(latinNormalized || "").replace(/[^a-z0-9]+/g, "");
}

/** Full pipeline: raw user or DB string → compact ASCII key. */
export function citySearchCompactKey(raw: string): string {
  return compactCityKey(normalizeCityLatin(raw));
}

/** Map known exonyms to canonical compact form (tbilisi, istanbul, …). */
export function canonicalCityCompact(compact: string): string {
  const c = String(compact || "").trim();
  if (!c) return "";
  return CITY_ALIAS_TO_CANONICAL[c] || c;
}

/**
 * True if `cityStr` (e.g. clinic.city from DB) matches free-text `query` (min 2 chars after normalize).
 */
export function cityMatchesQuery(query: string, cityStr: string | null | undefined): boolean {
  const qRaw = String(query || "").trim();
  if (qRaw.length < 2) return true;

  const qComp = citySearchCompactKey(qRaw);
  if (qComp.length < 2) return true;

  const hComp = citySearchCompactKey(String(cityStr || ""));
  if (!hComp) return false;

  const qCanon = canonicalCityCompact(qComp);
  const hCanon = canonicalCityCompact(hComp);

  if (hComp.includes(qComp) || hCanon.includes(qComp)) return true;
  if (qCanon !== qComp && (hComp.includes(qCanon) || hCanon.includes(qCanon))) return true;
  if (hCanon === qCanon && qCanon.length >= 2) return true;
  return false;
}
