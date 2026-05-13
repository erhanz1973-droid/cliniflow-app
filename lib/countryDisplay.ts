/**
 * Centralized country display: flag emoji + English label + optional ISO-3166-1 alpha-2.
 * Use everywhere we show a country (selectors, discovery, cards, headers).
 */

/** Known countries — prefer consistent labels & flags (Unicode regional pairs for unknowns still work). */
const KNOWN: Record<string, { flag: string; labelEn: string }> = {
  TR: { flag: "🇹🇷", labelEn: "Türkiye" },
  GE: { flag: "🇬🇪", labelEn: "Georgia" },
  GB: { flag: "🇬🇧", labelEn: "United Kingdom" },
  US: { flag: "🇺🇸", labelEn: "United States" },
  DE: { flag: "🇩🇪", labelEn: "Germany" },
  FR: { flag: "🇫🇷", labelEn: "France" },
  NL: { flag: "🇳🇱", labelEn: "Netherlands" },
  IT: { flag: "🇮🇹", labelEn: "Italy" },
  ES: { flag: "🇪🇸", labelEn: "Spain" },
  PT: { flag: "🇵🇹", labelEn: "Portugal" },
  PL: { flag: "🇵🇱", labelEn: "Poland" },
  RO: { flag: "🇷🇴", labelEn: "Romania" },
  BG: { flag: "🇧🇬", labelEn: "Bulgaria" },
  GR: { flag: "🇬🇷", labelEn: "Greece" },
  CY: { flag: "🇨🇾", labelEn: "Cyprus" },
  AE: { flag: "🇦🇪", labelEn: "United Arab Emirates" },
  SA: { flag: "🇸🇦", labelEn: "Saudi Arabia" },
  AZ: { flag: "🇦🇿", labelEn: "Azerbaijan" },
  AM: { flag: "🇦🇲", labelEn: "Armenia" },
  UA: { flag: "🇺🇦", labelEn: "Ukraine" },
  CH: { flag: "🇨🇭", labelEn: "Switzerland" },
  AT: { flag: "🇦🇹", labelEn: "Austria" },
  BE: { flag: "🇧🇪", labelEn: "Belgium" },
  SE: { flag: "🇸🇪", labelEn: "Sweden" },
  NO: { flag: "🇳🇴", labelEn: "Norway" },
  DK: { flag: "🇩🇰", labelEn: "Denmark" },
  FI: { flag: "🇫🇮", labelEn: "Finland" },
  IE: { flag: "🇮🇪", labelEn: "Ireland" },
  CZ: { flag: "🇨🇿", labelEn: "Czechia" },
  HU: { flag: "🇭🇺", labelEn: "Hungary" },
  HR: { flag: "🇭🇷", labelEn: "Croatia" },
  RS: { flag: "🇷🇸", labelEn: "Serbia" },
  IL: { flag: "🇮🇱", labelEn: "Israel" },
  EG: { flag: "🇪🇬", labelEn: "Egypt" },
  IQ: { flag: "🇮🇶", labelEn: "Iraq" },
  IR: { flag: "🇮🇷", labelEn: "Iran" },
  IN: { flag: "🇮🇳", labelEn: "India" },
  CN: { flag: "🇨🇳", labelEn: "China" },
  JP: { flag: "🇯🇵", labelEn: "Japan" },
  KR: { flag: "🇰🇷", labelEn: "South Korea" },
  AU: { flag: "🇦🇺", labelEn: "Australia" },
  CA: { flag: "🇨🇦", labelEn: "Canada" },
  MX: { flag: "🇲🇽", labelEn: "Mexico" },
  BR: { flag: "🇧🇷", labelEn: "Brazil" },
  AR: { flag: "🇦🇷", labelEn: "Argentina" },
  ZA: { flag: "🇿🇦", labelEn: "South Africa" },
  NG: { flag: "🇳🇬", labelEn: "Nigeria" },
  KE: { flag: "🇰🇪", labelEn: "Kenya" },
  RU: { flag: "🇷🇺", labelEn: "Russia" },
  KZ: { flag: "🇰🇿", labelEn: "Kazakhstan" },
  UZ: { flag: "🇺🇿", labelEn: "Uzbekistan" },
};

/** UK is not ISO-3166 alpha-2 (GB is); normalize so UI matches APIs that emit either. */
export function normalizeCountryCode(raw: string | null | undefined): string {
  let s = String(raw ?? "").trim().toUpperCase();
  if (s === "UK") s = "GB";
  if (!/^[A-Z]{2}$/.test(s)) return "";
  return s;
}

/**
 * Regional-indicator pair from ISO-3166 alpha-2 (e.g. GB → 🇬🇧).
 * @see https://en.wikipedia.org/wiki/Regional_indicator_symbol
 */
export function isoAlpha2ToFlagEmoji(iso2: string): string {
  const c = iso2.toUpperCase();
  if (c.length !== 2 || !/^[A-Z]{2}$/.test(c)) return "🏳️";
  const BASE = 0x1f1e6;
  const cp = (ch: string) => BASE + (ch.charCodeAt(0) - 65);
  return String.fromCodePoint(cp(c[0]), cp(c[1]));
}

function regionLabelEn(iso2: string): string {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    const n = dn.of(iso2);
    if (n && typeof n === "string") return n;
  } catch {
    /* Intl unsupported */
  }
  return iso2;
}

export type CountryMeta = {
  /** Normalized ISO-3166 alpha-2 when parseable; otherwise empty */
  iso2: string;
  flag: string;
  /** Primary English label */
  labelEn: string;
};

/**
 * Resolve metadata for display. Unknown ISO-2: computed flag + Intl region name (English).
 * Non–ISO-2 strings (e.g. full country name from legacy data): globe + raw text.
 */
export function getCountryMeta(raw: string | null | undefined): CountryMeta {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return { iso2: "", flag: "🏳️", labelEn: "" };
  }

  const iso2 = normalizeCountryCode(trimmed);
  if (iso2) {
    const known = KNOWN[iso2];
    if (known) {
      return { iso2, flag: known.flag, labelEn: known.labelEn };
    }
    return {
      iso2,
      flag: isoAlpha2ToFlagEmoji(iso2),
      labelEn: regionLabelEn(iso2),
    };
  }

  return {
    iso2: "",
    flag: "🌍",
    labelEn: trimmed,
  };
}

export type FormatCountryOptions = {
  /** Append " · GB" style secondary ISO code */
  showIso?: boolean;
};

/**
 * Single-line label for selectors and cards: "🇬🇧 United Kingdom" or "🇬🇧 United Kingdom · GB".
 * Empty input → "" (caller supplies placeholder).
 */
export function formatCountryDisplay(
  raw: string | null | undefined,
  opts?: FormatCountryOptions
): string {
  const meta = getCountryMeta(raw);
  if (!meta.labelEn && !meta.iso2) return "";
  const main = `${meta.flag} ${meta.labelEn}`;
  if (opts?.showIso && meta.iso2) {
    return `${main} · ${meta.iso2}`;
  }
  return main;
}

/** Secondary line: ISO code only (use under primary in dense layouts). */
export function formatCountryIsoSecondary(raw: string | null | undefined): string | null {
  const iso = normalizeCountryCode(raw);
  return iso || null;
}
