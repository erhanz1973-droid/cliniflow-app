import type { Router } from "expo-router";
import { Alert } from "react-native";

export type GoToOfferChatParams = {
  offerId: string;
  /** Other party shown in header (patient: doctor name; doctor: patient name). */
  otherNameRaw: string;
  treatmentType?: string;
  /**
   * Doctor / Requests: `patient_chat_threads.is_lead` for this patient+clinic.
   * When normalized to `false`, **navigation is blocked** (enrolled / shared-care — no offer socket, no offer-chat).
   * Omit or leave unknown for patient flows (home → offer chat).
   */
  leadThreadIsLead?: unknown;
  /**
   * Doctor Incoming Requests: only navigate when `normalizeLeadThreadIsLead(leadThreadIsLead) === true`.
   * `false` → enrolled alert; unknown → refresh / Patients hint (never opens deprecated offer chat).
   */
  requireExplicitLeadThread?: boolean;
};

/** Coerce API / JSON quirks (`"false"`, `0`) before lifecycle checks. */
export function normalizeLeadThreadIsLead(raw: unknown): boolean | null {
  if (raw === true || raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === false || raw === "false" || raw === 0 || raw === "0") return false;
  return null;
}

export function offerChatLastStorageKey(patientId: string): string {
  return `offer_chat_last_${String(patientId || "").trim()}`;
}

/**
 * Single navigation entry for offer-thread chat — logs [CHAT OFFER] for wrong-thread debugging.
 * Hard guard: enrolled (`threadIsLead === false` after normalize) never pushes offer-chat.
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

  const leadNorm = normalizeLeadThreadIsLead(p.leadThreadIsLead);
  const enrolledTitle = "Patient joined clinic";
  const enrolledBody =
    "This patient is now part of your clinic. Continue messaging from the Patients page.";

  if (p.requireExplicitLeadThread) {
    if (leadNorm !== true) {
      if (leadNorm === false) {
        Alert.alert(enrolledTitle, enrolledBody, [{ text: "OK" }]);
      } else {
        Alert.alert(
          "Unable to open request chat",
          "Pull to refresh the list. If this patient already joined your clinic, open them from the Patients page.",
          [{ text: "OK" }],
        );
      }
      return;
    }
  } else if (leadNorm === false) {
    Alert.alert(enrolledTitle, enrolledBody, [{ text: "OK" }]);
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
