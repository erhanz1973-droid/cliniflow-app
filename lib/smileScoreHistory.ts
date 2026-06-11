import AsyncStorage from "@react-native-async-storage/async-storage";
import { extractSmileScoreFromPayload } from "./smileScore";
import type { SmileScoreHistoryEntry } from "./smileScoreTypes";

const HISTORY_KEY_PREFIX = "@cliniflow:smile-history:v1:";
const BACKFILL_FLAG_PREFIX = "@cliniflow:smile-history-backfill:v1:";
const TG_ANALYSIS_CACHE_PREFIX = "@cliniflow:tg-analysis:v1:";
const TG_ANALYSIS_HASH_CACHE_PREFIX = "@cliniflow:tg-analysis-hash:v1:";
const MAX_ENTRIES = 48;

function historyKey(patientId: string): string {
  return `${HISTORY_KEY_PREFIX}${String(patientId || "").trim()}`;
}

export async function loadSmileScoreHistory(
  patientId: string,
): Promise<SmileScoreHistoryEntry[]> {
  const pid = String(patientId || "").trim();
  if (!pid) return [];
  try {
    const raw = await AsyncStorage.getItem(historyKey(pid));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SmileScoreHistoryEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => e && Number.isFinite(Number(e.smileScore)))
      .sort((a, b) => Number(a.analyzedAt) - Number(b.analyzedAt));
  } catch {
    return [];
  }
}

export async function appendSmileScoreHistory(
  patientId: string,
  entry: Omit<SmileScoreHistoryEntry, "id"> & { id?: string },
): Promise<SmileScoreHistoryEntry[]> {
  const pid = String(patientId || "").trim();
  if (!pid) return [];

  const list = await loadSmileScoreHistory(pid);
  const hash = String(entry.contentHash || "").trim().toLowerCase();
  if (hash && list.some((e) => String(e.contentHash || "").toLowerCase() === hash)) {
    return list;
  }

  const row: SmileScoreHistoryEntry = {
    id: entry.id || `ss_${entry.analyzedAt}_${Math.random().toString(36).slice(2, 8)}`,
    analyzedAt: entry.analyzedAt,
    smileScore: entry.smileScore,
    potentialScore: entry.potentialScore,
    strengths: entry.strengths || [],
    improvementAreas: entry.improvementAreas || [],
    recommendations: entry.recommendations || [],
    fileUrl: entry.fileUrl,
    contentHash: entry.contentHash,
    categoryScores: entry.categoryScores,
  };

  const next = [...list, row].slice(-MAX_ENTRIES);
  await AsyncStorage.setItem(historyKey(pid), JSON.stringify(next));
  return next;
}

/** Persist analysis API payload into append-only history. */
export async function recordSmileAnalysisFromPayload(
  patientId: string,
  aiData: Record<string, unknown>,
  opts?: { fileUrl?: string; contentHash?: string | null; analyzedAt?: number },
): Promise<SmileScoreHistoryEntry | null> {
  const smile = extractSmileScoreFromPayload(aiData);
  if (!smile) return null;
  const rows = await appendSmileScoreHistory(patientId, {
    analyzedAt: opts?.analyzedAt ?? Date.now(),
    smileScore: smile.smileScore,
    potentialScore: smile.potentialScore,
    strengths: smile.strengths,
    improvementAreas: smile.improvementAreas,
    recommendations: smile.recommendations,
    fileUrl: opts?.fileUrl,
    contentHash: opts?.contentHash || undefined,
  });
  return rows[rows.length - 1] ?? null;
}

export function groupHistoryByMonth(
  history: SmileScoreHistoryEntry[],
  locale = "en",
): { label: string; score: number; analyzedAt: number }[] {
  const byMonth = new Map<string, { label: string; score: number; analyzedAt: number }>();
  for (const e of history) {
    const d = new Date(e.analyzedAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleDateString(locale, { month: "long" });
    const prev = byMonth.get(key);
    if (!prev || e.analyzedAt >= prev.analyzedAt) {
      byMonth.set(key, { label, score: e.smileScore, analyzedAt: e.analyzedAt });
    }
  }
  return Array.from(byMonth.values()).sort((a, b) => a.analyzedAt - b.analyzedAt);
}

/** One-time import of cached treatment-guide analyses into append-only history. */
export async function backfillSmileHistoryFromCache(
  patientId: string,
): Promise<SmileScoreHistoryEntry[]> {
  const pid = String(patientId || "").trim();
  if (!pid) return [];

  let history = await loadSmileScoreHistory(pid);
  if (history.length > 0) return history;

  const flagKey = `${BACKFILL_FLAG_PREFIX}${pid}`;
  try {
    if (await AsyncStorage.getItem(flagKey)) return history;
  } catch {
    /* non-fatal */
  }

  try {
    const keys = await AsyncStorage.getAllKeys();
    const relevant = keys.filter(
      (k) =>
        k.startsWith(`${TG_ANALYSIS_CACHE_PREFIX}${pid}:`) ||
        k.startsWith(`${TG_ANALYSIS_HASH_CACHE_PREFIX}${pid}:`),
    );
    if (!relevant.length) {
      await AsyncStorage.setItem(flagKey, "1");
      return history;
    }

    const rows = await AsyncStorage.multiGet(relevant);
    const entries: {
      cachedAt: number;
      aiData: Record<string, unknown>;
      fileUrl?: string;
      contentHash?: string;
    }[] = [];

    for (const [, raw] of rows) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as {
          cachedAt?: number;
          fileUrl?: string;
          contentHash?: string;
          aiData?: Record<string, unknown>;
        };
        const smile = extractSmileScoreFromPayload(parsed.aiData ?? null);
        if (!smile) continue;
        entries.push({
          cachedAt: Number(parsed.cachedAt) || Date.now(),
          aiData: parsed.aiData ?? {},
          fileUrl: parsed.fileUrl ? String(parsed.fileUrl) : undefined,
          contentHash: parsed.contentHash ? String(parsed.contentHash) : undefined,
        });
      } catch {
        /* skip corrupt cache row */
      }
    }

    entries.sort((a, b) => a.cachedAt - b.cachedAt);
    for (const e of entries) {
      await recordSmileAnalysisFromPayload(pid, e.aiData, {
        fileUrl: e.fileUrl,
        contentHash: e.contentHash,
        analyzedAt: e.cachedAt,
      });
    }
    history = await loadSmileScoreHistory(pid);
  } catch {
    /* non-fatal */
  }

  try {
    await AsyncStorage.setItem(flagKey, "1");
  } catch {
    /* non-fatal */
  }
  return history;
}

export function smileScoreDelta(
  history: SmileScoreHistoryEntry[],
): { current: number; previous: number | null; delta: number | null } | null {
  if (history.length === 0) return null;
  const sorted = [...history].sort((a, b) => a.analyzedAt - b.analyzedAt);
  const current = sorted[sorted.length - 1];
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
  return {
    current: current.smileScore,
    previous: previous?.smileScore ?? null,
    delta:
      previous != null
        ? Math.round((current.smileScore - previous.smileScore) * 10) / 10
        : null,
  };
}
