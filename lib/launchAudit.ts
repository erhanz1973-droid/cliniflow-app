/**
 * Production-safe launch phase logging for TestFlight / ASC diagnostics.
 * Enable in release builds: EXPO_PUBLIC_LAUNCH_AUDIT=1 (set in eas.json).
 */
const LAUNCH_AUDIT =
  __DEV__ || String(process.env.EXPO_PUBLIC_LAUNCH_AUDIT || "").trim() === "1";

const t0 = Date.now();
const once = new Set<string>();

export function logLaunchPhase(phase: string, detail?: Record<string, unknown>): void {
  if (!LAUNCH_AUDIT) return;
  const ms = Date.now() - t0;
  const suffix = detail && Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : "";
  console.log(`[launch] ${phase} +${ms}ms${suffix}`);
}

export function logLaunchPhaseOnce(phase: string, detail?: Record<string, unknown>): void {
  if (once.has(phase)) return;
  once.add(phase);
  logLaunchPhase(phase, detail);
}

export function launchElapsedMs(): number {
  return Date.now() - t0;
}
