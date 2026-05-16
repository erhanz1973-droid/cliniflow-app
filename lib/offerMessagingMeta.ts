import { API_BASE } from "./api";

export type OfferMessagingMeta = {
  ok: boolean;
  enrolled: boolean;
  route: "patient_chat" | "offer_chat";
  patient_id: string | null;
  lead_thread_is_lead: boolean | null;
  offer_id?: string;
};

export type RequestMessagingMeta = {
  ok: boolean;
  enrolled: boolean;
  route: "patient_chat" | "offer_chat";
  patient_id: string | null;
  offer_id: string | null;
  lead_thread_is_lead: boolean | null;
  request_id?: string;
};

export async function fetchOfferMessagingMeta(
  token: string,
  offerId: string,
): Promise<OfferMessagingMeta | null> {
  const oid = String(offerId || "").trim();
  if (!oid || !token) return null;
  try {
    const res = await fetch(`${API_BASE}/api/doctor/offers/${encodeURIComponent(oid)}/messaging-meta`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const data = (await res.json().catch(() => ({}))) as OfferMessagingMeta & { error?: string };
    if (!res.ok || data?.ok === false) return null;
    return {
      ok: true,
      enrolled: data.enrolled === true,
      route: data.route === "patient_chat" ? "patient_chat" : "offer_chat",
      patient_id: data.patient_id ? String(data.patient_id) : null,
      lead_thread_is_lead:
        data.lead_thread_is_lead === false
          ? false
          : data.lead_thread_is_lead === true
            ? true
            : null,
      offer_id: oid,
    };
  } catch {
    return null;
  }
}

export async function fetchRequestMessagingMeta(
  token: string,
  requestId: string,
): Promise<RequestMessagingMeta | null> {
  const rid = String(requestId || "").trim();
  if (!rid || !token) return null;
  try {
    const res = await fetch(
      `${API_BASE}/api/doctor/treatment-requests/${encodeURIComponent(rid)}/messaging-meta`,
      { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } },
    );
    const data = (await res.json().catch(() => ({}))) as RequestMessagingMeta & { error?: string };
    if (!res.ok || data?.ok === false) return null;
    return {
      ok: true,
      enrolled: data.enrolled === true,
      route: data.route === "patient_chat" ? "patient_chat" : "offer_chat",
      patient_id: data.patient_id ? String(data.patient_id) : null,
      offer_id: data.offer_id ? String(data.offer_id) : null,
      lead_thread_is_lead:
        data.lead_thread_is_lead === false
          ? false
          : data.lead_thread_is_lead === true
            ? true
            : null,
      request_id: rid,
    };
  } catch {
    return null;
  }
}
