/**
 * Lightweight analytics facade — swap implementation (PostHog, Segment, etc.) in one place.
 */
export function track(event: string, props?: Record<string, unknown>): void {
  try {
    if (__DEV__) {
      console.log(`[analytics] ${event}`, props ?? {});
    }
    // Hook your provider here, e.g. posthog?.capture(event, props);
  } catch {
    /* non-fatal */
  }
}
