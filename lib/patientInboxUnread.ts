import { API_BASE } from "./api";

const TTL_MS = 5_000;

let inflight: Promise<number> | null = null;
let cache: { expires: number; total: number } | null = null;

export function invalidatePatientInboxUnreadCache(): void {
  cache = null;
}

/**
 * GET /api/patient/inbox-summary — offers + offer-thread replies (not main clinic chat).
 */
export async function fetchPatientInboxUnreadTotal(token: string): Promise<number> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.total;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/patient/inbox-summary`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const d = await res.json().catch(() => ({}));
      const total = Number(d?.total_unread ?? d?.offers_unread ?? 0);
      const n = Number.isFinite(total) ? total : 0;
      cache = { expires: Date.now() + TTL_MS, total: n };
      return n;
    } catch {
      return cache?.total ?? 0;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
