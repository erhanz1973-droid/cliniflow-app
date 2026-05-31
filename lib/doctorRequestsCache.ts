import { normalizeLeadThreadIsLead } from "./canonicalChatTarget";
import type { CoordinationResponder } from "./coordinationResponderLabel";

export const DOCTOR_REQUESTS_LIST_CACHE_KEY = "doctor:requests:list";

export type MyOfferSummary = {
  id: string;
  treatment_type: string | null;
  price_range: string | null;
  price_text: string | null;
  duration: string | null;
  note: string | null;
  created_at: string | null;
};

export type RequestPhoto = { url: string; type: string };

export type DoctorRequestRow = {
  id: string;
  patient_name: string;
  patient_id?: string | null;
  lead_thread_is_lead?: boolean | null;
  threadIsLead?: boolean | null;
  description: string;
  budget: string | null;
  preferred_treatment: string | null;
  status: "pending" | "answered" | "closed";
  created_at: string;
  /** Latest offer_messages activity (patient or clinic) — inbox sort key */
  last_message_at?: string | null;
  last_message_preview?: string | null;
  last_message_role?: string | null;
  offer_count: number;
  my_offer_id: string | null;
  my_offer: MyOfferSummary | null;
  unread_count: number;
  is_assigned_to_me: boolean;
  photos: RequestPhoto[] | null;
  coordination_responder?: CoordinationResponder | null;
  coordinationResponder?: CoordinationResponder | null;
};

/** API may return photos as string[] or {url,type}[] — normalize for Image uri. */
export function normalizeRequestPhotos(raw: unknown): RequestPhoto[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: RequestPhoto[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const u = item.trim();
      if (u) out.push({ url: u, type: "image" });
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as { url?: unknown; type?: unknown };
      const u = typeof o.url === "string" ? o.url.trim() : "";
      if (u) out.push({ url: u, type: typeof o.type === "string" ? o.type : "image" });
    }
  }
  return out.length ? out : null;
}

export function normalizeDoctorRequests(rows: unknown[]): DoctorRequestRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r: Record<string, unknown>) => {
    const leadRaw = r.lead_thread_is_lead ?? r.threadIsLead ?? r.thread_is_lead;
    const lead_thread_is_lead = normalizeLeadThreadIsLead(leadRaw);
    return {
      ...r,
      id: String(r.id ?? ""),
      patient_name: String(r.patient_name ?? "Patient"),
      lead_thread_is_lead,
      coordination_responder:
        (r.coordination_responder as CoordinationResponder | null | undefined) ??
        (r.coordinationResponder as CoordinationResponder | null | undefined) ??
        null,
      coordinationResponder:
        (r.coordinationResponder as CoordinationResponder | null | undefined) ??
        (r.coordination_responder as CoordinationResponder | null | undefined) ??
        null,
      my_offer: (r.my_offer as MyOfferSummary | null | undefined) ?? null,
      unread_count: Math.max(0, Number(r.unread_count) || 0),
      photos: normalizeRequestPhotos(r.photos),
    };
  }) as DoctorRequestRow[];
}

/** Strip heavy photo payloads for first paint — photos hydrate on background refresh. */
export function stripRequestPhotosForPaint(rows: DoctorRequestRow[]): DoctorRequestRow[] {
  return rows.map((r) => (r.photos?.length ? { ...r, photos: null } : r));
}
