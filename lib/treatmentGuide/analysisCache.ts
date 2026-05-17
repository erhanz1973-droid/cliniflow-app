import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "@cliniflow:tg-analysis:v1:";

export type CachedTreatmentGuideAnalysis = {
  fingerprint: string;
  contentHash?: string;
  fileUrl: string;
  aiData: Record<string, unknown>;
  cachedAt: number;
};

const HASH_PREFIX = "@cliniflow:tg-analysis-hash:v1:";

/** Stable key for local file or remote URL — ignores query tokens. */
export function normalizeImageFingerprint(uri: string): string {
  const s = String(uri || "").trim();
  if (!s) return "";
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const u = new URL(s);
      return decodeURIComponent(u.pathname);
    } catch {
      return s.split("?")[0];
    }
  }
  return s;
}

function storageKey(patientId: string, fingerprint: string): string {
  return `${PREFIX}${patientId}:${fingerprint}`;
}

export async function loadTreatmentGuideAnalysisCache(
  patientId: string,
  fingerprint: string,
): Promise<CachedTreatmentGuideAnalysis | null> {
  const pid = String(patientId || "").trim();
  const fp = String(fingerprint || "").trim();
  if (!pid || !fp) return null;
  try {
    const raw = await AsyncStorage.getItem(storageKey(pid, fp));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTreatmentGuideAnalysis;
    if (!parsed?.aiData || typeof parsed.aiData !== "object") return null;
    if (parsed.fingerprint !== fp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function saveTreatmentGuideAnalysisCache(
  patientId: string,
  entry: CachedTreatmentGuideAnalysis,
): Promise<void> {
  const pid = String(patientId || "").trim();
  if (!pid || !entry.fingerprint) return;
  try {
    await AsyncStorage.setItem(storageKey(pid, entry.fingerprint), JSON.stringify(entry));
    const hash = String(entry.contentHash || "").trim().toLowerCase();
    if (hash) {
      await AsyncStorage.setItem(`${HASH_PREFIX}${pid}:${hash}`, JSON.stringify(entry));
    }
  } catch {
    /* non-fatal */
  }
}

export async function loadTreatmentGuideAnalysisCacheByHash(
  patientId: string,
  contentHash: string,
): Promise<CachedTreatmentGuideAnalysis | null> {
  const pid = String(patientId || "").trim();
  const hash = String(contentHash || "").trim().toLowerCase();
  if (!pid || !hash) return null;
  try {
    const raw = await AsyncStorage.getItem(`${HASH_PREFIX}${pid}:${hash}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedTreatmentGuideAnalysis;
    if (!parsed?.aiData || typeof parsed.aiData !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}
