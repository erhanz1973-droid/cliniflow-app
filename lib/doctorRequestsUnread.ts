import { API_BASE } from "./api";
import { invalidateDoctorUnreadCacheOnly } from "./doctorMessaging";
import {
  DOCTOR_REQUESTS_LIST_CACHE_KEY,
  type DoctorRequestRow,
} from "./doctorRequestsCache";
import { emitOfferUnreadEvent, type OfferUnreadEvent } from "./offerUnreadEvents";
import { peekCachedResource, setCachedResource } from "./resourceCache";

export function rowOfferId(row: DoctorRequestRow): string {
  return String(row.my_offer_id || row.my_offer?.id || "").trim();
}

/** Merge server per-offer unread map into list rows (does not touch resource cache). */
export function mergeUnreadMapIntoRows(
  rows: DoctorRequestRow[],
  byOffer: Record<string, number>,
): DoctorRequestRow[] {
  if (!rows.length || !byOffer || typeof byOffer !== "object") return rows;
  return rows.map((row) => {
    const oid = rowOfferId(row);
    if (!oid || !(oid in byOffer)) return row;
    if (isEnrolledSharedCareRow(row)) return { ...row, unread_count: 0 };
    return { ...row, unread_count: Math.max(0, Number(byOffer[oid]) || 0) };
  });
}

function isEnrolledSharedCareRow(row: DoctorRequestRow): boolean {
  return row.lead_thread_is_lead === false;
}

function patchCachedRequests(
  mutator: (rows: DoctorRequestRow[]) => DoctorRequestRow[],
): DoctorRequestRow[] | null {
  const cached = peekCachedResource<DoctorRequestRow[]>(DOCTOR_REQUESTS_LIST_CACHE_KEY);
  if (!cached?.length) return null;
  const next = mutator(cached.map((r) => ({ ...r })));
  setCachedResource(DOCTOR_REQUESTS_LIST_CACHE_KEY, next);
  return next;
}

/** Increment unread on the matching request card (offer thread). */
export function bumpDoctorRequestUnreadByOfferId(
  offerId: string,
  delta = 1,
): DoctorRequestRow[] | null {
  const oid = String(offerId || "").trim();
  if (!oid || delta === 0) return null;
  return patchCachedRequests((rows) =>
    rows.map((row) => {
      if (rowOfferId(row) !== oid) return row;
      if (isEnrolledSharedCareRow(row)) return { ...row, unread_count: 0 };
      const prev = Math.max(0, Number(row.unread_count) || 0);
      return { ...row, unread_count: prev + delta };
    }),
  );
}

export function setDoctorRequestUnreadByOfferId(
  offerId: string,
  count: number,
): DoctorRequestRow[] | null {
  const oid = String(offerId || "").trim();
  if (!oid) return null;
  const n = Math.max(0, Math.floor(Number(count) || 0));
  return patchCachedRequests((rows) =>
    rows.map((row) => {
      if (rowOfferId(row) !== oid) return row;
      if (isEnrolledSharedCareRow(row)) return { ...row, unread_count: 0 };
      return { ...row, unread_count: n };
    }),
  );
}

export function clearDoctorRequestUnreadByOfferId(offerId: string): DoctorRequestRow[] | null {
  return setDoctorRequestUnreadByOfferId(offerId, 0);
}

/** Server truth — patch all cached rows that have my_offer_id in map. */
export function applyDoctorRequestUnreadMap(
  byOffer: Record<string, number>,
): DoctorRequestRow[] | null {
  if (!byOffer || typeof byOffer !== "object") return null;
  return patchCachedRequests((rows) => mergeUnreadMapIntoRows(rows, byOffer));
}

/** Unread / recent activity first — within same tier, newest request first. */
export function sortDoctorRequestsForInbox(rows: DoctorRequestRow[]): DoctorRequestRow[] {
  return [...rows].sort((a, b) => {
    const au = Math.max(0, Number(a.unread_count) || 0);
    const bu = Math.max(0, Number(b.unread_count) || 0);
    if (au > 0 && bu === 0) return -1;
    if (bu > 0 && au === 0) return 1;
    if (bu !== au) return bu - au;
    const at = Date.parse(String(a.created_at || "")) || 0;
    const bt = Date.parse(String(b.created_at || "")) || 0;
    return bt - at;
  });
}

let offerUnreadMapInflight: Promise<Record<string, number>> | null = null;

/** Lightweight unread map for cache patch (no full treatment-requests reload). */
export async function fetchDoctorOfferUnreadMap(token: string): Promise<Record<string, number>> {
  const t = String(token || "").trim();
  if (!t) return {};
  if (offerUnreadMapInflight) return offerUnreadMapInflight;

  offerUnreadMapInflight = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/doctor/treatment-requests/offer-unread`, {
        headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) return {};
      const raw = data?.by_offer ?? data?.byOffer ?? {};
      if (!raw || typeof raw !== "object") return {};
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw)) {
        const id = String(k || "").trim();
        if (!id) continue;
        out[id] = Math.max(0, Number(v) || 0);
      }
      return out;
    } catch {
      return {};
    } finally {
      offerUnreadMapInflight = null;
    }
  })();

  return offerUnreadMapInflight;
}

export async function syncDoctorRequestUnreadFromServer(
  token: string,
  currentRows?: DoctorRequestRow[] | null,
): Promise<DoctorRequestRow[] | null> {
  const map = await fetchDoctorOfferUnreadMap(token);
  const base =
    currentRows?.length
      ? currentRows
      : peekCachedResource<DoctorRequestRow[]>(DOCTOR_REQUESTS_LIST_CACHE_KEY);
  if (base?.length) {
    const merged = sortDoctorRequestsForInbox(mergeUnreadMapIntoRows(base, map));
    setCachedResource(DOCTOR_REQUESTS_LIST_CACHE_KEY, merged);
    return merged;
  }
  return applyDoctorRequestUnreadMap(map);
}

/** Patient message on offer thread — patch list unless doctor is already in that offer chat. */
export function notifyDoctorOfferInboundMessage(
  offerId: string,
  senderRole: string,
  opts?: { skipIfOfferChatOpen?: boolean; activeOfferId?: string | null },
): void {
  if (String(senderRole || "").toLowerCase() !== "patient") return;
  const oid = String(offerId || "").trim();
  if (!oid) return;
  const active = String(opts?.activeOfferId ?? "").trim();
  if (opts?.skipIfOfferChatOpen && active && active === oid) return;

  const next = bumpDoctorRequestUnreadByOfferId(oid, 1);
  invalidateDoctorUnreadCacheOnly();
  if (next) {
    emitOfferUnreadEvent({ type: "offer_realtime_update", offerId: oid, recipient: "doctor" });
  } else {
    emitOfferUnreadEvent({ type: "offer_activity", offerId: oid, recipient: "doctor" });
  }
}

/** Read patched cache for UI refresh (bump/clear happens before emit). */
export function readDoctorRequestsListFromCache(): DoctorRequestRow[] | null {
  const cached = peekCachedResource<DoctorRequestRow[]>(DOCTOR_REQUESTS_LIST_CACHE_KEY);
  return cached?.length ? sortDoctorRequestsForInbox(cached) : cached;
}

export function handleDoctorOfferUnreadEvent(ev: OfferUnreadEvent): DoctorRequestRow[] | null {
  if (ev.recipient !== "doctor") return null;
  if (ev.type === "offer_mark_read" && ev.offerId) {
    return clearDoctorRequestUnreadByOfferId(ev.offerId);
  }
  return readDoctorRequestsListFromCache();
}
