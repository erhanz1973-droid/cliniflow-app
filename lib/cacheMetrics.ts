/**
 * Lightweight cache visibility for perf tuning. Search logs: dashboard_cache_hit
 */

export type CacheMetricEvent =
  | "dashboard_cache_hit"
  | "dashboard_cache_miss"
  | "patients_cache_hit"
  | "patients_cache_miss"
  | "inbox_cache_hit"
  | "inbox_cache_miss"
  | "treatment_plan_cache_hit"
  | "treatment_plan_cache_miss"
  | "diagnosis_cache_hit"
  | "diagnosis_cache_miss"
  | "requests_cache_hit"
  | "requests_cache_miss"
  | "patient_chat_cache_hit"
  | "patient_chat_cache_miss";

const counts = new Map<CacheMetricEvent, number>();

export function recordCacheMetric(event: CacheMetricEvent, detail?: Record<string, unknown>): void {
  counts.set(event, (counts.get(event) ?? 0) + 1);
  if (__DEV__) {
    console.log(`[cache] ${event}`, {
      count: counts.get(event),
      ...detail,
    });
  }
}

export function getCacheMetricCounts(): Readonly<Record<string, number>> {
  return Object.fromEntries(counts);
}
