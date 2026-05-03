import { cityTranslationKey, resolveCityCode } from "./cityCodes";

export function formatClinicCityLabel(
  cityRaw: string | null | undefined,
  t: (key: string) => string,
): string {
  const code = resolveCityCode(cityRaw);
  if (code) {
    const k = cityTranslationKey(code);
    if (k) {
      const lbl = t(k);
      if (lbl && lbl !== k) return lbl;
    }
  }
  const s = typeof cityRaw === "string" ? cityRaw.trim() : "";
  return s || "—";
}
