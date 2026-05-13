/** Imperative host for a small in-app banner (doctor stack). */

export type DoctorForegroundBannerPayload = {
  title: string;
  body: string;
};

type HostFn = (payload: DoctorForegroundBannerPayload | null) => void;

let host: HostFn | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

export function registerDoctorForegroundBannerHost(cb: HostFn): () => void {
  host = cb;
  return () => {
    if (host === cb) host = null;
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
  };
}

export function showDoctorForegroundBanner(payload: DoctorForegroundBannerPayload, visibleMs = 4500): void {
  if (!host) return;
  if (clearTimer) clearTimeout(clearTimer);
  host(payload);
  clearTimer = setTimeout(() => {
    clearTimer = null;
    host?.(null);
  }, visibleMs);
}
