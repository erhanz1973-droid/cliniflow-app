import { Platform } from "react-native";
import { sanitizeTelemetryPayload } from "./sanitizeTelemetry";

export type TelemetryEventPayload = Record<string, unknown>;

type Queued = { name: string; payload: Record<string, unknown>; ts: number };

const queue: Queued[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

const FLUSH_DEBOUNCE_MS = 6000;
const MAX_QUEUE = 40;

/**
 * Product / device telemetry entrypoint. Batches in-memory; plug PostHog / Firebase / HTTP in `flushNow()`.
 *
 * **Where to view metrics**
 * - Today: set `EXPO_PUBLIC_ANALYTICS_DEBUG=1` (or dev) to log `[telemetry]` lines in Metro / device logs.
 * - Recommended: add `posthog-react-native` or `@react-native-firebase/analytics` and forward `batch` in `flushNow()`.
 * - Avoid Supabase tables for high-volume clickstream unless you own retention + indexing.
 *
 * **Privacy**: payloads are passed through `sanitizeTelemetryPayload` — no tokens, URLs, message text, or clinical fields.
 */
function flushNow(): void {
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_QUEUE);
  if (__DEV__ || String(process.env.EXPO_PUBLIC_ANALYTICS_DEBUG || "").trim() === "1") {
    for (const row of batch) {
      console.log(`[telemetry] ${row.name}`, row.payload, `@${row.ts}`);
    }
  }
  /* Future: PostHog.capture / Firebase.analytics().logEvent / fetch(API) — strip PII in sanitizeTelemetryPayload only. */
  void batch;
}

function scheduleFlush(): void {
  if (flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushNow();
  }, FLUSH_DEBOUNCE_MS);
}

/** Fire-and-forget event; safe to call from any thread of UI logic. */
export function trackEvent(name: string, payload?: TelemetryEventPayload): void {
  try {
    const base: Record<string, unknown> = {
      platform: Platform.OS,
      ...sanitizeTelemetryPayload(payload),
    };
    queue.push({ name, payload: base, ts: Date.now() });
    if (queue.length >= MAX_QUEUE) flushNow();
    else scheduleFlush();
  } catch {
    /* never throw from telemetry */
  }
}
