/**
 * DEV timing for navigation/focus work. Search Metro logs: [perf:focus]
 */
const active = new Map<string, number>();

export function focusPerfStart(label: string): () => void {
  if (!__DEV__) return () => {};
  active.set(label, Date.now());
  console.time(`[perf:focus] ${label}`);
  return () => {
    const started = active.get(label);
    console.timeEnd(`[perf:focus] ${label}`);
    if (started != null) {
      const ms = Date.now() - started;
      if (ms > 120) {
        console.warn(`[perf:focus] slow ${label} ${ms}ms`);
      }
      active.delete(label);
    }
  };
}

export function focusPerfMark(label: string, detail?: Record<string, unknown>): void {
  if (!__DEV__) return;
  console.log(`[perf:focus] ${label}`, detail ?? {});
}
