import { API_BASE } from "./api";
import type { CoordinationResponder } from "./coordinationResponderLabel";

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

export type DoctorInboxMeta = {
  onlyActive?: boolean;
  chatThreadCount?: number;
  offerThreadCount?: number;
  lead_inbox_query_result_count?: number;
  lead_inbox_filtered_count?: number;
  chatUnreadTotal?: number;
  offerUnreadTotal?: number;
  lead_inbox_unread_count?: number;
};

export type DoctorThreadSummaryRow = {
  /** `patient` = clinic/patient chat; `offer` = treatment offer thread (lead phase). */
  threadKind?: "patient" | "offer";
  offerId?: string | null;
  requestId?: string | null;
  treatmentType?: string | null;
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
  /** AI vs doctor conversation owner for coordination leads. */
  coordinationResponder?: CoordinationResponder | null;
};

export type DoctorThreadSummaryResponse = {
  ok?: boolean;
  threads?: DoctorThreadSummaryRow[];
  inboxMeta?: DoctorInboxMeta;
  visiblePatientCount?: number;
  resolvedPatientCount?: number;
  cached?: boolean;
  hint?: string;
};

function threadActivityMs(row: DoctorThreadSummaryRow): number {
  const direct = Number(row.lastActivityAt);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const fromMsg = Number(row.lastMessage?.createdAt);
  if (Number.isFinite(fromMsg) && fromMsg > 0) return fromMsg;
  return 0;
}

/** Newest conversation first (matches server thread-summary sort; safe if API order drifts). */
export function sortDoctorThreadsByActivity(rows: DoctorThreadSummaryRow[]): DoctorThreadSummaryRow[] {
  return [...rows].sort((a, b) => {
    const bt = threadActivityMs(b);
    const at = threadActivityMs(a);
    if (bt !== at) return bt - at;
    const bu = Math.max(0, Number(b.unreadFromPatient) || 0);
    const au = Math.max(0, Number(a.unreadFromPatient) || 0);
    if (bu !== au) return bu - au;
    const bk = b.offerId || b.patientDbId || "";
    const ak = a.offerId || a.patientDbId || "";
    return String(bk).localeCompare(String(ak));
  });
}

let unreadInflight: Promise<{ total: number; offerUnread: number; chatUnread: number }> | null = null;
let unreadCache: { expires: number; total: number; offerUnread: number; chatUnread: number } | null = null;

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
export type DoctorUnreadBreakdown = {
  total: number;
  offerUnread: number;
  chatUnread: number;
};

export async function fetchDoctorUnreadBreakdown(token: string): Promise<DoctorUnreadBreakdown> {
  const now = Date.now();
  if (unreadCache && unreadCache.expires > now) {
    return {
      total: unreadCache.total,
      offerUnread: unreadCache.offerUnread,
      chatUnread: unreadCache.chatUnread,
    };
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
      const offerUnread = Number(d?.offerUnread ?? 0);
      const chatUnread = Number(d?.chatUnread ?? Math.max(0, total - offerUnread));
      const row: DoctorUnreadBreakdown = {
        total: Number.isFinite(total) ? total : 0,
        offerUnread: Number.isFinite(offerUnread) ? offerUnread : 0,
        chatUnread: Number.isFinite(chatUnread) ? chatUnread : 0,
      };
      unreadCache = { expires: Date.now() + UNREAD_TOTAL_CLIENT_TTL_MS, ...row };
      return row;
    } catch {
      return {
        total: unreadCache?.total ?? 0,
        offerUnread: unreadCache?.offerUnread ?? 0,
        chatUnread: unreadCache?.chatUnread ?? 0,
      };
    } finally {
      unreadInflight = null;
    }
  })();

  return unreadInflight;
}

/** Badge aggregate (chat + offer threads) for dashboard tab badges. */
export async function fetchDoctorUnreadTotalOnly(token: string): Promise<number> {
  const row = await fetchDoctorUnreadBreakdown(token);
  return row.total;
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
