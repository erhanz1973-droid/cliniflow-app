import { safeGetItem, safeSetItem } from "./asyncStorageSafe";
import { normalizeCountryCode } from "./countryDisplay";

/** Find-a-clinic discovery filters — survives app restart until user changes them. */
const STORAGE_KEY = "@clinifly:findClinicDiscoveryPrefs";

export type FindClinicDiscoveryPrefs = {
  country: string;
  city: string;
};

export async function loadFindClinicDiscoveryPrefs(): Promise<FindClinicDiscoveryPrefs> {
  try {
    const raw = (await safeGetItem(STORAGE_KEY))?.trim();
    if (!raw) return { country: "", city: "" };
    const parsed = JSON.parse(raw) as Partial<FindClinicDiscoveryPrefs>;
    const country = normalizeCountryCode(String(parsed.country ?? "")) || "";
    const city = String(parsed.city ?? "").trim();
    return { country, city };
  } catch {
    return { country: "", city: "" };
  }
}

export async function saveFindClinicDiscoveryPrefs(
  prefs: FindClinicDiscoveryPrefs,
): Promise<void> {
  const country = normalizeCountryCode(String(prefs.country ?? "")) || "";
  const city = String(prefs.city ?? "").trim();
  await safeSetItem(STORAGE_KEY, JSON.stringify({ country, city }));
}
