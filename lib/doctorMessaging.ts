import { API_BASE } from "./api";

/** Client-side: align roughly with server DOCTOR_MSG_THREAD_SUMMARY_TTL_MS (12s). */
const THREAD_SUMMARY_CLIENT_TTL_MS = 18_000;
/** Short TTL so dashboard focus + poll + interval collapse to one HTTP round-trip when simultaneous. */
const UNREAD_TOTAL_CLIENT_TTL_MS = 4_000;

/** Find-a-clinic / lead thread: single primary responder (`assigned_doctor_id`); clinic-wide visibility. */
export type LeadPrimaryResponder = {
  doctorId: string | null;
  displayName: string | null;
  unassigned: boolean;
  /** Mirrors `patient_chat_threads.is_lead` — false after clinic enrollment (shared-care thread). */
  threadIsLead?: boolean;
};

export type DoctorThreadSummaryRow = {
  patientDbId: string;
  patientPublicId?: string | null;
  patientLegacyId?: string | null;
  patientName: string;
  unreadFromPatient: number;
  lastMessage?: {
    id?: string;
    text?: string;
    from?: string;
    type?: string;
    createdAt?: number | null;
    readAt?: unknown;
  } | null;
  lastActivityAt?: number | null;
  /** Present when this row is a lead (`patient_chat_threads.is_lead`) for the clinic. */
  leadPrimaryResponder?: LeadPrimaryResponder | null;
};

export type DoctorThreadSummaryResponse = {
  ok?: boolean;
  threads?: DoctorThreadSummaryRow[];
  visiblePatientCount?: number;
  resolvedPatientCount?: number;
  cached?: boolean;
  hint?: string;
};

let unreadInflight: Promise<number> | null = null;
let unreadCache: { expires: number; total: number } | null = null;

let threadSummaryInflight: Promise<DoctorThreadSummaryResponse> | null = null;
let threadSummaryCache: { expires: number; body: DoctorThreadSummaryResponse } | null = null;

/** Clears client caches (e.g. pull-to-refresh on inbox). */
export function invalidateDoctorMessagingCache(): void {
  unreadCache = null;
  threadSummaryCache = null;
}

/** Bust thread-summary only — cheaper than full invalidate; use after send or foreground activity. */
export function invalidateDoctorThreadSummaryCacheOnly(): void {
  threadSummaryCache = null;
}

/** Badge aggregate only — after ack-open or similar. */
export function invalidateDoctorUnreadCacheOnly(): void {
  unreadCache = null;
}

/**
 * GET /api/doctor/messages/unread-counts?totalOnly=1 — deduped in-flight + brief TTL
 * so dashboard load + useFocusEffect + 30s poll do not stack duplicate queries.
 */
export async function fetchDoctorUnreadTotalOnly(token: string): Promise<number> {
  const now = Date.now();
  if (unreadCache && unreadCache.expires > now) {
    return unreadCache.total;
  }
  if (unreadInflight) return unreadInflight;

  unreadInflight = (async () => {
    try {
      const res = await fetch(
        `${API_BASE}/api/doctor/messages/unread-counts?totalOnly=1`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        }
      );
      const d = await res.json().catch(() => ({}));
      const total = Number(d?.totalUnread ?? d?.total ?? 0);
      const n = Number.isFinite(total) ? total : 0;
      unreadCache = { expires: Date.now() + UNREAD_TOTAL_CLIENT_TTL_MS, total: n };
      return n;
    } catch {
      return unreadCache?.total ?? 0;
    } finally {
      unreadInflight = null;
    }
  })();

  return unreadInflight;
}

/**
 * GET /api/doctor/messages/thread-summary — one round-trip for inbox rows.
 * @param refresh bypasses short client cache (still uses server cache unless refresh=1 is passed through).
 */
export async function fetchDoctorThreadSummary(
  token: string,
  opts?: { refresh?: boolean; onlyActive?: boolean }
): Promise<DoctorThreadSummaryResponse> {
  const now = Date.now();
  if (!opts?.refresh && threadSummaryCache && threadSummaryCache.expires > now) {
    return threadSummaryCache.body;
  }
  if (threadSummaryInflight && !opts?.refresh) return threadSummaryInflight;

  const q = new URLSearchParams();
  if (opts?.onlyActive !== false) q.set("onlyActive", "1");
  if (opts?.refresh) q.set("refresh", "1");
  const qs = q.toString();

  const run = (async () => {
    const res = await fetch(
      `${API_BASE}/api/doctor/messages/thread-summary${qs ? `?${qs}` : ""}`,
      {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      }
    );
    const body = (await res.json().catch(() => ({}))) as DoctorThreadSummaryResponse;
    threadSummaryCache = {
      expires: Date.now() + THREAD_SUMMARY_CLIENT_TTL_MS,
      body,
    };
    return body;
  })();

  threadSummaryInflight = run.finally(() => {
    threadSummaryInflight = null;
  });

  return run;
}
