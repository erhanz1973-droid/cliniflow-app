import { recordCacheMetric, type CacheMetricEvent } from "./cacheMetrics";

type CacheEntry<T> = {
  data: T;
  fetchedAt: number;
};

const store = new Map<string, CacheEntry<unknown>>();

const KEY_METRIC: Partial<Record<string, { hit: CacheMetricEvent; miss: CacheMetricEvent }>> = {
  "doctor:dashboard:vm": { hit: "dashboard_cache_hit", miss: "dashboard_cache_miss" },
  "doctor:patients:page1": { hit: "patients_cache_hit", miss: "patients_cache_miss" },
  "doctor:inbox:threads": { hit: "inbox_cache_hit", miss: "inbox_cache_miss" },
  "doctor:requests:list": { hit: "requests_cache_hit", miss: "requests_cache_miss" },
};

function emitPeekMetric(key: string, hit: boolean): void {
  const m = KEY_METRIC[key];
  if (m) {
    recordCacheMetric(hit ? m.hit : m.miss, { key });
    return;
  }
  if (key.startsWith("doctor:patient-chat:")) {
    recordCacheMetric(hit ? "patient_chat_cache_hit" : "patient_chat_cache_miss", { key });
  }
}

export function getCachedResource<T>(key: string, maxAgeMs: number): T | null {
  const hit = store.get(key);
  if (!hit) {
    emitPeekMetric(key, false);
    return null;
  }
  if (Date.now() - hit.fetchedAt > maxAgeMs) {
    emitPeekMetric(key, false);
    return null;
  }
  emitPeekMetric(key, true);
  return hit.data as T;
}

/** Returns cached data even when stale (stale-while-revalidate UI). */
export function peekCachedResource<T>(key: string): T | null {
  const hit = store.get(key);
  const found = hit ? (hit.data as T) : null;
  if (KEY_METRIC[key]) emitPeekMetric(key, found != null);
  return found;
}

export function setCachedResource<T>(key: string, data: T): void {
  store.set(key, { data, fetchedAt: Date.now() });
}

export function cacheAgeMs(key: string): number | null {
  const hit = store.get(key);
  return hit ? Date.now() - hit.fetchedAt : null;
}
