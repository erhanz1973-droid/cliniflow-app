import type { Router } from "expo-router";

export type GoToOfferChatParams = {
  offerId: string;
  /** Other party shown in header (patient: doctor name; doctor: patient name). */
  otherNameRaw: string;
  treatmentType?: string;
};

export function offerChatLastStorageKey(patientId: string): string {
  return `offer_chat_last_${String(patientId || "").trim()}`;
}

/**
 * Single navigation entry for offer-thread chat — logs [CHAT OFFER] for wrong-thread debugging.
 */
export function goToOfferChat(
  router: Pick<Router, "push">,
  p: GoToOfferChatParams,
  source?: string
): void {
  const offerId = String(p.offerId ?? "").trim();
  if (!offerId) {
    console.warn("[CHAT OFFER] missing offer id", source ? `(${source})` : "");
    return;
  }
  const tag = source ? ` (${source})` : "";
  if (__DEV__) console.log(`[CHAT OFFER] ${offerId}${tag}`);
  router.push({
    pathname: "/offer-chat",
    params: {
      offerId,
      otherName: encodeURIComponent(p.otherNameRaw || "Doktor"),
      treatmentType: p.treatmentType ?? "",
    },
  } as any);
}
