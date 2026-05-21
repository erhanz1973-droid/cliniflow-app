import type { Router } from "expo-router";
import { API_BASE } from "./api";
import { goToChat } from "./chatFlow";
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

  const route =
    String(data.route || "").trim().toLowerCase() === "patient_chat"
      ? "patient_chat"
      : "offer_chat";
  const enrolled = data.enrolled === true || route === "patient_chat";
  const clinicId = String(data.clinic_id || "").trim();
  const clinicCode = data.clinic_code != null ? String(data.clinic_code).trim() : null;
  const patientId = String(data.patient_id || "").trim();
  const offerId = String(data.offer_id || data.coordination_offer_id || "").trim();

  if (enrolled) {
    if (!clinicId) return { ok: false, error: "missing_clinic_id" };
    return {
      ok: true,
      route: "patient_chat",
      enrolled: true,
      clinicId,
      clinicCode: clinicCode || undefined,
      patientId: patientId || undefined,
      offerId: offerId || undefined,
      hasFormalOffer: data.has_formal_offer === true,
      offerCreated: data.offer_created === true,
    };
  }

  if (!offerId) return { ok: false, error: "missing_offer_id" };
  return {
    ok: true,
    route: "offer_chat",
    enrolled: false,
    offerId,
    clinicId: clinicId || undefined,
    clinicCode: clinicCode || undefined,
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
  /** Server: patient joined clinic — open clinic messages, not offer-chat. */
  enrolled?: boolean;
  chatRoute?: "offer_chat" | "patient_chat" | string | null;
};

/**
 * Open messaging for a quote request — offer thread before enrollment, clinic messages after.
 */
export async function openRequestCoordinationChat(
  router: Pick<Router, "push" | "replace">,
  params: OpenRequestCoordinationChatParams,
): Promise<void> {
  const preEnrolled =
    params.enrolled === true ||
    String(params.chatRoute || "").trim().toLowerCase() === "patient_chat";
  const preClinicId = String(params.clinicId || "").trim();

  if (preEnrolled && preClinicId) {
    goToChat(router, {
      clinicId: preClinicId,
      clinicCode: params.clinicCode || undefined,
    });
    return;
  }

  let offerId = String(params.coordinationOfferId || "").trim();
  let route: "offer_chat" | "patient_chat" = preEnrolled ? "patient_chat" : "offer_chat";
  let clinicId = preClinicId;
  let clinicCode = String(params.clinicCode || "").trim();

  if (!preEnrolled || !clinicId) {
    const ensured = await ensureCoordinationChat(params.token, params.requestId);
    if (!ensured.ok) {
      if (ensured.error === "clinic_doctor_not_assigned") {
        throw new Error("clinic_doctor_not_assigned");
      }
      throw new Error(ensured.error || "coordination_unavailable");
    }
    route = ensured.route === "patient_chat" ? "patient_chat" : "offer_chat";
    clinicId = String(ensured.clinicId || clinicId || "").trim();
    clinicCode = String(ensured.clinicCode || clinicCode || "").trim();
    if (ensured.offerId) offerId = ensured.offerId;
    if (ensured.enrolled || route === "patient_chat") {
      if (!clinicId) throw new Error("missing_clinic_id");
      goToChat(router, {
        clinicId,
        clinicCode: clinicCode || undefined,
      });
      return;
    }
  }

  if (!offerId) {
    throw new Error("missing_offer_id");
  }

  const label =
    String(params.clinicName || "").trim() ||
    "Clinic";

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
