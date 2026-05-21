import { API_BASE } from "./api";
import { emitOfferUnreadEvent } from "./offerUnreadEvents";

const TTL_MS = 5_000;
const POLL_HINT_MS = 400;

export type PatientInboxSummary = {
  new_offers: number;
  doctor_messages: number;
};

export type PatientInboxSummaryListener = (summary: PatientInboxSummary) => void;

let inflight: Promise<PatientInboxSummary> | null = null;
let cache: { expires: number; summary: PatientInboxSummary } | null = null;
let lastSummary: PatientInboxSummary = { new_offers: 0, doctor_messages: 0 };
const listeners = new Set<PatientInboxSummaryListener>();

function normalizeSummary(d: Record<string, unknown>): PatientInboxSummary {
  const newOffers = Math.max(0, Number(d.new_offers ?? 0) || 0);
  const doctorMessages = Math.max(0, Number(d.doctor_messages ?? 0) || 0);
  return { new_offers: newOffers, doctor_messages: doctorMessages };
}

export function patientInboxBadgeTotal(summary: PatientInboxSummary): number {
  return Math.max(0, summary.new_offers) + Math.max(0, summary.doctor_messages);
}

function publishSummary(summary: PatientInboxSummary): void {
  lastSummary = summary;
  for (const fn of listeners) {
    try {
      fn(summary);
    } catch {
      /* ignore subscriber errors */
    }
  }
}

export function subscribePatientInboxSummary(fn: PatientInboxSummaryListener): () => void {
  listeners.add(fn);
  fn(lastSummary);
  return () => {
    listeners.delete(fn);
  };
}

export function invalidatePatientInboxUnreadCache(): void {
  cache = null;
}

/**
 * GET /api/patient/inbox-summary — new offers + unread doctor messages in offer threads.
 */
export async function fetchPatientInboxSummary(token: string): Promise<PatientInboxSummary> {
  const now = Date.now();
  if (cache && cache.expires > now) return cache.summary;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/patient/inbox-summary`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const summary = res.ok && d?.ok !== false ? normalizeSummary(d) : lastSummary;
      cache = { expires: Date.now() + TTL_MS, summary };
      publishSummary(summary);
      return summary;
    } catch {
      return lastSummary;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** @deprecated Prefer fetchPatientInboxSummary — kept for tab badge helpers. */
export async function fetchPatientInboxUnreadTotal(token: string): Promise<number> {
  const s = await fetchPatientInboxSummary(token);
  return patientInboxBadgeTotal(s);
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

export function schedulePatientInboxSummaryRefresh(token: string): void {
  const t = String(token || "").trim();
  if (!t) return;
  invalidatePatientInboxUnreadCache();
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void fetchPatientInboxSummary(t);
  }, POLL_HINT_MS);
}

/** Doctor/clinic message on offer thread — refresh home Teklifler badge without manual reload. */
export function notifyPatientOfferInboundMessage(
  offerId: string,
  senderRole: string,
  opts?: { skipIfOfferChatOpen?: boolean; activeOfferId?: string | null },
): void {
  if (String(senderRole || "").toLowerCase() !== "doctor") return;
  const oid = String(offerId || "").trim();
  if (!oid) return;
  const active = String(opts?.activeOfferId ?? "").trim();
  if (opts?.skipIfOfferChatOpen && active && active === oid) return;

  emitOfferUnreadEvent({
    type: "offer_realtime_update",
    offerId: oid,
    recipient: "patient",
  });
}
