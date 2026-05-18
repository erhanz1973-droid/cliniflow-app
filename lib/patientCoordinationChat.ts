import type { Router } from "expo-router";
import { API_BASE } from "./api";
import { goToOfferChat } from "./goToOfferChat";

export type EnsureCoordinationChatResult = {
  ok: boolean;
  offerId?: string;
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
    return {
      ok: false,
      error: String(data?.error || data?.message || `http_${res.status}`),
    };
  }
  const offerId = String(data.offer_id || data.coordination_offer_id || "").trim();
  if (!offerId) return { ok: false, error: "missing_offer_id" };
  return {
    ok: true,
    offerId,
    hasFormalOffer: data.has_formal_offer === true,
    offerCreated: data.offer_created === true,
  };
}

export type OpenRequestCoordinationChatParams = {
  token: string;
  requestId: string;
  clinicName?: string | null;
  treatmentType?: string | null;
  /** When GET already returned a coordination offer id (quote just created). */
  coordinationOfferId?: string | null;
};

/**
 * Open offer-thread chat for a quote request — works before any formal clinic proposal.
 */
export async function openRequestCoordinationChat(
  router: Pick<Router, "push" | "replace">,
  params: OpenRequestCoordinationChatParams,
): Promise<void> {
  let offerId = String(params.coordinationOfferId || "").trim();
  if (!offerId) {
    const ensured = await ensureCoordinationChat(params.token, params.requestId);
    if (!ensured.ok || !ensured.offerId) {
      throw new Error(ensured.error || "coordination_unavailable");
    }
    offerId = ensured.offerId;
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
