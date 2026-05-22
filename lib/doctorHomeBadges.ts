import {
  fetchDoctorThreadSummary,
  fetchDoctorUnreadBreakdown,
  invalidateDoctorMessagingCache,
  type DoctorThreadSummaryRow,
} from "./doctorMessaging";
import { fetchDoctorOfferUnreadMap } from "./doctorRequestsUnread";
import {
  DOCTOR_REQUESTS_LIST_CACHE_KEY,
  type DoctorRequestRow,
} from "./doctorRequestsCache";
import { peekCachedResource } from "./resourceCache";
import { subscribeOfferUnreadEvents } from "./offerUnreadEvents";

export type DoctorHomeBadgeSection = "inbox" | "requests" | "patients";

export type DoctorHomeBadgeLive = {
  inbox: number;
  requests: number;
  patients: number;
};

export type DoctorHomeBadgeDisplay = DoctorHomeBadgeLive;

let live: DoctorHomeBadgeLive = { inbox: 0, requests: 0, patients: 0 };
const baselines: Partial<DoctorHomeBadgeLive> = {};
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      /* ignore */
    }
  }
}

function displayCount(section: DoctorHomeBadgeSection): number {
  const current = Math.max(0, Number(live[section]) || 0);
  const base = baselines[section];
  if (base == null) return current;
  return Math.max(0, current - Math.max(0, Number(base) || 0));
}

export function getDoctorHomeBadgeDisplay(): DoctorHomeBadgeDisplay {
  return {
    inbox: displayCount("inbox"),
    requests: displayCount("requests"),
    patients: displayCount("patients"),
  };
}

export function getDoctorHomeBadgeLive(): DoctorHomeBadgeLive {
  return { ...live };
}

/** Doctor opened inbox / requests / patients — hide badge until counts rise above this snapshot. */
export function acknowledgeDoctorHomeBadge(section: DoctorHomeBadgeSection): void {
  baselines[section] = live[section];
  notify();
}

/** New inbound activity — show badge again when counts increase. */
export function resetDoctorHomeBadgeAck(section: DoctorHomeBadgeSection | DoctorHomeBadgeSection[]): void {
  const list = Array.isArray(section) ? section : [section];
  for (const s of list) {
    delete baselines[s];
  }
  notify();
}

export function subscribeDoctorHomeBadges(fn: () => void): () => void {
  listeners.add(fn);
  fn();
  return () => {
    listeners.delete(fn);
  };
}

function sumOfferUnreadFromRows(rows: DoctorRequestRow[]): number {
  let n = 0;
  for (const r of rows) {
    n += Math.max(0, Number(r.unread_count) || 0);
  }
  return n;
}

function sumEnrolledPatientUnread(threads: DoctorThreadSummaryRow[]): number {
  let n = 0;
  for (const row of threads) {
    if (row.threadKind === "offer") continue;
    const enrolled = row.leadPrimaryResponder?.threadIsLead === false;
    if (!enrolled) continue;
    n += Math.max(0, Number(row.unreadFromPatient) || 0);
  }
  return n;
}

export async function refreshDoctorHomeBadgeLiveCounts(
  token: string,
  opts?: { pendingRequestCount?: number },
): Promise<DoctorHomeBadgeDisplay> {
  const t = String(token || "").trim();
  if (!t) return getDoctorHomeBadgeDisplay();

  const pending = Math.max(0, Math.floor(Number(opts?.pendingRequestCount) || 0));

  try {
    const [bd, leadSummary, rosterSummary, offerMap] = await Promise.all([
      fetchDoctorUnreadBreakdown(t),
      fetchDoctorThreadSummary(t, { refresh: false, onlyActive: true }),
      fetchDoctorThreadSummary(t, { refresh: false, onlyActive: false }),
      fetchDoctorOfferUnreadMap(t).catch(() => ({} as Record<string, number>)),
    ]);

    const meta = leadSummary.inboxMeta;
    let inbox =
      Number(meta?.lead_inbox_unread_count) ||
      (Number(meta?.chatUnreadTotal) || 0) + (Number(meta?.offerUnreadTotal) || 0);
    if (!Number.isFinite(inbox) || inbox < 0) {
      inbox = bd.offerUnread + bd.chatUnread;
    }

    const cachedReqs = peekCachedResource<DoctorRequestRow[]>(DOCTOR_REQUESTS_LIST_CACHE_KEY);
    let offerUnread = Object.values(offerMap || {}).reduce((s, n) => s + Math.max(0, Number(n) || 0), 0);
    if (cachedReqs?.length) {
      const fromRows = sumOfferUnreadFromRows(cachedReqs);
      if (fromRows > 0) offerUnread = fromRows;
    }
    if (!offerUnread) offerUnread = bd.offerUnread;

    let patients = sumEnrolledPatientUnread(rosterSummary.threads || []);
    if (patients === 0) patients = bd.chatUnread;

    live = {
      inbox: Math.max(0, Math.floor(inbox)),
      requests: Math.max(0, pending + Math.floor(offerUnread)),
      patients: Math.max(0, Math.floor(patients)),
    };
  } catch {
    /* keep previous live */
  }

  notify();
  return getDoctorHomeBadgeDisplay();
}

/** Call from dashboard mount — keeps badges in sync with offer events. */
export function bindDoctorHomeBadgeOfferEvents(token: string | undefined): () => void {
  const t = String(token || "").trim();
  if (!t) return () => {};
  return subscribeOfferUnreadEvents((ev) => {
    if (ev.recipient !== "doctor") return;
    if (ev.type === "offer_activity" || ev.type === "offer_realtime_update") {
      resetDoctorHomeBadgeAck(["inbox", "requests"]);
      void refreshDoctorHomeBadgeLiveCounts(t);
      return;
    }
    if (ev.type === "offer_mark_read") {
      invalidateDoctorMessagingCache();
      void refreshDoctorHomeBadgeLiveCounts(t);
    }
  });
}
