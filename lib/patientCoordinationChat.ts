import type { Router } from "expo-router";
import { API_BASE } from "./api";
import { goToOfferChat } from "./goToOfferChat";

export type EnsureCoordinationChatResult = {
  ok: boolean;
  offerId?: string;
  route?: "offer_chat" | "patient_chat";
  enrolled?: boolean;
  clinicId?: string;
  clinicCode?: string | null;
  patientId?: string;
  hasFormalOffer?: boolean;
  offerCreated?: boolean;
  error?: string;
};

export async function ensureCoordinationChat(
  token: string,
  requestId: string,
): Promise<EnsureCoordinationChatResult> {
  const rid = String(requestId || "").trim();
  if (!rid) return { ok: false, error: "invalid_request_id" };

  const res = await fetch(
    `${API_BASE}/api/patient/treatment-requests/${encodeURIComponent(rid)}/ensure-coordination-chat`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    const code = String(data?.error || "").trim();
    if (code === "clinic_doctor_not_assigned" || code === "no_clinic_doctor") {
      return { ok: false, error: "clinic_doctor_not_assigned" };
    }
    return {
      ok: false,
      error: code || `http_${res.status}`,
    };
  }

  const offerId = String(data.offer_id || data.coordination_offer_id || "").trim();
  if (!offerId) return { ok: false, error: "missing_offer_id" };

  return {
    ok: true,
    route: "offer_chat",
    enrolled: data.enrolled === true,
    offerId,
    clinicId: String(data.clinic_id || "").trim() || undefined,
    clinicCode: data.clinic_code != null ? String(data.clinic_code).trim() : null,
    patientId: String(data.patient_id || "").trim() || undefined,
    hasFormalOffer: data.has_formal_offer === true,
    offerCreated: data.offer_created === true,
  };
}

export type OpenRequestCoordinationChatParams = {
  token: string;
  requestId: string;
  clinicName?: string | null;
  clinicId?: string | null;
  clinicCode?: string | null;
  treatmentType?: string | null;
  /** When GET already returned a coordination offer id (quote just created). */
  coordinationOfferId?: string | null;
};

/**
 * Open coordination messaging — always the offer_messages workspace (before and after clinic enrollment).
 */
export async function openRequestCoordinationChat(
  router: Pick<Router, "push" | "replace">,
  params: OpenRequestCoordinationChatParams,
): Promise<void> {
  let offerId = String(params.coordinationOfferId || "").trim();

  if (!offerId) {
    const ensured = await ensureCoordinationChat(params.token, params.requestId);
    if (!ensured.ok) {
      if (ensured.error === "clinic_doctor_not_assigned") {
        throw new Error("clinic_doctor_not_assigned");
      }
      throw new Error(ensured.error || "coordination_unavailable");
    }
    offerId = String(ensured.offerId || "").trim();
  }

  if (!offerId) {
    throw new Error("missing_offer_id");
  }

  const label = String(params.clinicName || "").trim() || "Clinic";

  goToOfferChat(
    router,
    {
      offerId,
      otherNameRaw: label,
      treatmentType: params.treatmentType || undefined,
      viewerRole: "patient",
    },
    "coordination-chat",
  );
}

export async function ensureClinicCoordinationChat(
  token: string,
  clinicId: string,
): Promise<EnsureCoordinationChatResult> {
  const cid = String(clinicId || "").trim();
  if (!cid) return { ok: false, error: "invalid_clinic_id" };

  const res = await fetch(
    `${API_BASE}/api/patient/clinics/${encodeURIComponent(cid)}/ensure-coordination-chat`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.ok) {
    const code = String(data?.error || "").trim();
    if (__DEV__) {
      console.warn("[discovery-chat] ensure failed", {
        status: res.status,
        error: code,
        clinicId: cid,
      });
    }
    if (code === "clinic_doctor_not_assigned" || code === "no_clinic_doctor") {
      return { ok: false, error: "clinic_doctor_not_assigned" };
    }
    if (res.status === 404) {
      return { ok: false, error: "api_not_deployed" };
    }
    return {
      ok: false,
      error: code || `http_${res.status}`,
    };
  }

  const offerId = String(data.offer_id || data.coordination_offer_id || "").trim();
  if (!offerId) return { ok: false, error: "missing_offer_id" };

  return {
    ok: true,
    route: "offer_chat",
    enrolled: data.enrolled === true,
    offerId,
    clinicId: String(data.clinic_id || cid).trim() || undefined,
    clinicCode: data.clinic_code != null ? String(data.clinic_code).trim() : null,
    patientId: String(data.patient_id || "").trim() || undefined,
    hasFormalOffer: data.has_formal_offer === true,
    offerCreated: data.offer_created === true,
  };
}

export type OpenClinicCoordinationChatParams = {
  token: string;
  clinicId: string;
  clinicName?: string | null;
  clinicCode?: string | null;
};

/**
 * Find a clinic → Chat with clinic — same offer-chat screen as Open coordination chat.
 */
export async function openClinicCoordinationChat(
  router: Pick<Router, "push" | "replace">,
  params: OpenClinicCoordinationChatParams,
): Promise<void> {
  const ensured = await ensureClinicCoordinationChat(params.token, params.clinicId);
  if (!ensured.ok) {
    if (ensured.error === "clinic_doctor_not_assigned") {
      throw new Error("clinic_doctor_not_assigned");
    }
    throw new Error(ensured.error || "coordination_unavailable");
  }

  const offerId = String(ensured.offerId || "").trim();
  if (!offerId) {
    throw new Error("missing_offer_id");
  }

  const label = String(params.clinicName || "").trim() || "Clinic";

  goToOfferChat(
    router,
    {
      offerId,
      otherNameRaw: label,
      treatmentType: "inquiry",
      viewerRole: "patient",
    },
    "discovery-clinic-chat",
  );
}
