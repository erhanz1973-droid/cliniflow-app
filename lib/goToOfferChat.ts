import type { Router } from "expo-router";
import { normalizeLeadThreadIsLead } from "./canonicalChatTarget";
import { navigateCanonicalChat } from "./navigateCanonicalChat";

export type { ChatViewerRole } from "./canonicalChatTarget";
export { normalizeLeadThreadIsLead, buildOfferChatPath, buildPatientChatPath } from "./canonicalChatTarget";

export type GoToOfferChatParams = {
  offerId: string;
  /** Other party shown in header (patient: doctor name; doctor: patient name). */
  otherNameRaw: string;
  treatmentType?: string;
  patientId?: string | null;
  leadThreadIsLead?: unknown;
  /** Doctor Incoming Requests: only block when lead is explicitly `false` (enrolled). */
  requireExplicitLeadThread?: boolean;
  viewerRole?: "doctor" | "patient";
};

export function offerChatLastStorageKey(patientId: string): string {
  return `offer_chat_last_${String(patientId || "").trim()}`;
}

/**
 * Navigation entry for offer-thread chat — delegates to resolveCanonicalChatTarget.
 */
export function goToOfferChat(
  router: Pick<Router, "push" | "replace">,
  p: GoToOfferChatParams,
  source?: string,
): void {
  const offerId = String(p.offerId ?? "").trim();
  if (!offerId) {
    console.warn("[CHAT OFFER] missing offer id", source ? `(${source})` : "");
    return;
  }

  const viewerRole: "doctor" | "patient" =
    p.viewerRole ?? (p.requireExplicitLeadThread ? "doctor" : "patient");

  const leadNorm = normalizeLeadThreadIsLead(p.leadThreadIsLead);
  if (p.requireExplicitLeadThread && leadNorm === false && !p.patientId) {
    navigateCanonicalChat(
      router,
      { viewerRole: "doctor", leadThreadIsLead: false, enrolled: true },
      { source, alertOnEnrolledRedirect: true },
    );
    return;
  }

  navigateCanonicalChat(
    router,
    {
      viewerRole,
      offerId,
      patientId: p.patientId,
      patientName: viewerRole === "doctor" ? p.otherNameRaw : undefined,
      otherPartyName: p.otherNameRaw,
      treatmentType: p.treatmentType,
      leadThreadIsLead: p.leadThreadIsLead,
      enrolled: leadNorm === false,
      threadKind: "offer",
    },
    { source },
  );
}

type OfferChatExitRouter = Pick<Router, "back" | "canGoBack" | "replace">;

/** Avoid dev warning: GO_BACK when offer-chat is root (web refresh, push cold start). */
export function exitOfferChat(
  router: OfferChatExitRouter,
  viewerRole?: "doctor" | "patient" | string | null,
): void {
  if (router.canGoBack?.()) {
    router.back();
    return;
  }
  const role = String(viewerRole || "").toLowerCase();
  if (role === "doctor") {
    router.replace("/doctor/requests" as never);
    return;
  }
  router.replace("/(tabs)/home" as never);
}
