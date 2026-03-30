import type { Language } from "./i18n";

/**
 * Pick human-readable ICD row text for the active UI language.
 * Uses title_* / description_* when present; falls back across languages then category / generic description.
 */
export function localizedIcdTitle(item: Record<string, unknown>, lang: Language): string {
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "");

  const byLang: Record<Language, string[]> = {
    tr: [s(item.title_tr), s(item.description_tr)],
    en: [s(item.title_en), s(item.description_en)],
    ru: [s(item.title_ru), s(item.description_ru)],
    ka: [s(item.title_ka), s(item.description_ka)],
  };

  const primary = byLang[lang]?.find(Boolean);
  if (primary) return primary;

  const fallbacks = [
    s(item.title_en),
    s(item.title_tr),
    s(item.description_en),
    s(item.description_tr),
    s(item.description_ru),
    s(item.description_ka),
    s(item.description),
    s(item.icd10_description),
    s(item.category),
  ];
  return fallbacks.find(Boolean) || "";
}
