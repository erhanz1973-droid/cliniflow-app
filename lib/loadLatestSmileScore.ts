import AsyncStorage from "@react-native-async-storage/async-storage";
import { extractSmileScoreFromPayload } from "./smileScore";
import { loadSmileScoreHistory } from "./smileScoreHistory";

export const TG_ANALYSIS_CACHE_PREFIX = "@cliniflow:tg-analysis:v1:";
export const TG_ANALYSIS_HASH_CACHE_PREFIX = "@cliniflow:tg-analysis-hash:v1:";

export type LatestSmileScoreSnapshot = {
  smileScore: number;
  potentialScore: number;
  cachedAt: number;
  fileUrl?: string;
};

function parseCacheEntry(raw: string): LatestSmileScoreSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as {
      cachedAt?: number;
      fileUrl?: string;
      aiData?: Record<string, unknown>;
    };
    const smile = extractSmileScoreFromPayload(parsed.aiData ?? null);
    if (!smile) return null;
    return {
      smileScore: smile.smileScore,
      potentialScore: smile.potentialScore,
      cachedAt: Number(parsed.cachedAt) || 0,
      fileUrl: parsed.fileUrl ? String(parsed.fileUrl) : undefined,
    };
  } catch {
    return null;
  }
}

/** Most recent smile analysis for this patient (history first, then TG cache). */
export async function loadLatestSmileScoreForPatient(
  patientId: string,
): Promise<LatestSmileScoreSnapshot | null> {
  const pid = String(patientId || "").trim();
  if (!pid) return null;

  const history = await loadSmileScoreHistory(pid);
  if (history.length > 0) {
    const last = history[history.length - 1];
    return {
      smileScore: last.smileScore,
      potentialScore: last.potentialScore,
      cachedAt: last.analyzedAt,
      fileUrl: last.fileUrl,
    };
  }

  try {
    const keys = await AsyncStorage.getAllKeys();
    const relevant = keys.filter(
      (k) =>
        k.startsWith(`${TG_ANALYSIS_CACHE_PREFIX}${pid}:`) ||
        k.startsWith(`${TG_ANALYSIS_HASH_CACHE_PREFIX}${pid}:`),
    );
    if (!relevant.length) return null;

    const rows = await AsyncStorage.multiGet(relevant);
    let best: LatestSmileScoreSnapshot | null = null;
    for (const [, raw] of rows) {
      if (!raw) continue;
      const snap = parseCacheEntry(raw);
      if (!snap) continue;
      if (!best || snap.cachedAt > best.cachedAt) best = snap;
    }
    return best;
  } catch {
    return null;
  }
}
