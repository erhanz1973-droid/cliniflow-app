import { useLanguage } from "./language-context";

export const LANG_TO_LOCALE: Record<string, string> = {
  tr: "tr-TR",
  en: "en-GB",
  ru: "ru-RU",
  ka: "ka-GE",
};

/** Maps a language code to a BCP-47 locale string. */
export function langToLocale(lang: string): string {
  return LANG_TO_LOCALE[lang] ?? "en-GB";
}

/** Returns the BCP-47 locale string matching the current app language. */
export function useDateLocale(): string {
  const { currentLanguage } = useLanguage();
  return langToLocale(currentLanguage);
}
