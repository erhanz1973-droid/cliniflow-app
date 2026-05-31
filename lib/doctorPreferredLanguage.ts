import AsyncStorage from "@react-native-async-storage/async-storage";

import { apiFetchJson } from "./api";

const STORAGE_KEY = "doctor:preferredLanguage";
const SUPPORTED = new Set(["tr", "en", "ka", "ru", "de", "fr", "ar"]);

let memoryLang: string | null = null;

export function normalizeDoctorPreferredLanguage(input?: string | null) {
  const raw = String(input || "")
    .trim()
    .toLowerCase()
    .slice(0, 12);
  const two = raw.slice(0, 2);
  if (SUPPORTED.has(two)) return two;
  if (raw.startsWith("tr")) return "tr";
  if (raw.startsWith("en")) return "en";
  if (raw.startsWith("ka")) return "ka";
  if (raw.startsWith("ru")) return "ru";
  if (raw.startsWith("de")) return "de";
  if (raw.startsWith("fr")) return "fr";
  if (raw.startsWith("ar")) return "ar";
  return "tr";
}

export async function getDoctorPreferredLanguage(): Promise<string> {
  if (memoryLang) return memoryLang;
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      memoryLang = normalizeDoctorPreferredLanguage(stored);
      return memoryLang;
    }
  } catch {
    /* ignore */
  }

  try {
    const me = await apiFetchJson<{
      ok?: boolean;
      doctor?: { preferredLanguage?: string | null };
    }>("/api/doctor/me", { timeoutMs: 12_000 });
    const fromApi = me?.doctor?.preferredLanguage;
    if (fromApi) {
      memoryLang = normalizeDoctorPreferredLanguage(fromApi);
      void AsyncStorage.setItem(STORAGE_KEY, memoryLang);
      return memoryLang;
    }
  } catch {
    /* offline / auth */
  }

  memoryLang = "tr";
  return memoryLang;
}

export async function setDoctorPreferredLanguage(lang: string) {
  const normalized = normalizeDoctorPreferredLanguage(lang);
  memoryLang = normalized;
  await AsyncStorage.setItem(STORAGE_KEY, normalized);
  try {
    await apiFetchJson("/api/doctor/language", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: normalized }),
    });
  } catch {
    /* local cache still updated */
  }
  return normalized;
}
