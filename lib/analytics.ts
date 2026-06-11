/**
 * Product analytics facade — local queue only (no network). See `trackEvent` flush hook for providers.
 */
import { trackEvent } from "./analytics/trackEvent";

export function track(event: string, props?: Record<string, unknown>): void {
  trackEvent(event, props);
  if (__DEV__ && String(process.env.EXPO_PUBLIC_ANALYTICS_DEBUG || "").trim() === "1") {
    console.log(`[analytics] ${event}`, props ?? {});
  }
}
