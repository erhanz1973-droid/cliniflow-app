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
    return { ...parsed, fingerprint: fp };
  } catch {
    return null;
  }
}

export async function saveTreatmentGuideAnalysisCache(
  patientId: string,
  entry: CachedTreatmentGuideAnalysis,
  aliasFingerprints: string[] = [],
): Promise<void> {
  const pid = String(patientId || "").trim();
  if (!pid || !entry.fingerprint) return;
  try {
    const serialized = JSON.stringify(entry);
    await AsyncStorage.setItem(storageKey(pid, entry.fingerprint), serialized);
    const aliases = new Set(
      aliasFingerprints.map((a) => String(a || "").trim()).filter((a) => a && a !== entry.fingerprint),
    );
    for (const alias of aliases) {
      await AsyncStorage.setItem(storageKey(pid, alias), serialized);
    }
    const hash = String(entry.contentHash || "").trim().toLowerCase();
    if (hash) {
      await AsyncStorage.setItem(`${HASH_PREFIX}${pid}:${hash}`, serialized);
    }
  } catch {
    /* non-fatal */
  }
}

/** Try hash, then exact fingerprint, then any alias path match. */
export async function loadTreatmentGuideAnalysisCacheAny(
  patientId: string,
  opts: { fingerprint?: string; contentHash?: string | null },
): Promise<CachedTreatmentGuideAnalysis | null> {
  const hash = String(opts.contentHash || "").trim().toLowerCase();
  if (hash) {
    const byHash = await loadTreatmentGuideAnalysisCacheByHash(patientId, hash);
    if (byHash) return byHash;
  }
  const fp = String(opts.fingerprint || "").trim();
  if (fp) {
    const byFp = await loadTreatmentGuideAnalysisCache(patientId, fp);
    if (byFp) return byFp;
  }
  return null;
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
