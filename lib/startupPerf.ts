/**
 * Cold/warm startup timing. Search Metro: [perf:startup] doctor:home:
 */
const t0 = Date.now();

const once = new Set<string>();

export function markStartup(phase: string, detail?: Record<string, unknown>): void {
  const ms = Date.now() - t0;
  if (__DEV__) {
    console.log(`[perf:startup] ${phase} +${ms}ms`, detail ?? {});
  }
}

export function markStartupOnce(phase: string, detail?: Record<string, unknown>): void {
  if (once.has(phase)) return;
  once.add(phase);
  markStartup(phase, detail);
}

export type DoctorHomePhase = "first_paint" | "data_ready" | "interactive";

export function markDoctorHome(
  phase: DoctorHomePhase,
  detail?: Record<string, unknown>
): void {
  const key = `doctor:home:${phase}`;
  if (once.has(key)) return;
  once.add(key);
  const ms = Date.now() - t0;
  if (__DEV__) {
    console.log(`[perf:startup] ${key} +${ms}ms`, detail ?? {});
    console.timeEnd?.(`[perf:startup] ${key}`);
  }
}

export function startDoctorHomeTimer(phase: DoctorHomePhase): void {
  if (!__DEV__) return;
  const key = `doctor:home:${phase}`;
  if (once.has(key)) return;
  console.time(`[perf:startup] ${key}`);
}

export function startupElapsedMs(): number {
  return Date.now() - t0;
}
