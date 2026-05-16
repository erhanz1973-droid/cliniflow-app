import type { Router } from "expo-router";
import { Alert } from "react-native";
import {
  isEnrolledSharedCare,
  resolveCanonicalChatTarget,
  type CanonicalChatTarget,
  type ResolveCanonicalChatInput,
} from "./canonicalChatTarget";
import { logCanonicalChatDiag } from "./canonicalChatDiagnostics";
import { resolveDoctorPatientRouteId } from "./doctorPatientId";

const ENROLLED_TITLE = "Patient joined clinic";
const ENROLLED_BODY =
  "This patient is now part of your clinic. Continue messaging from the Patients page.";

export type NavigateCanonicalChatOptions = {
  source?: string;
  useReplace?: boolean;
  /** When true, show alert before redirect_patients (incoming requests UX). */
  alertOnEnrolledRedirect?: boolean;
};

/**
 * Navigate using resolveCanonicalChatTarget — one entry for inbox, requests, push, etc.
 */
export function navigateCanonicalChat(
  router: Pick<Router, "push" | "replace">,
  input: ResolveCanonicalChatInput,
  opts?: NavigateCanonicalChatOptions,
): CanonicalChatTarget {
  let target = resolveCanonicalChatTarget(input);
  const enrolled = isEnrolledSharedCare(input);

  if (input.viewerRole === "doctor" && enrolled && target.kind === "offer_chat") {
    console.warn("[canonical-chat:invariant] navigate blocked offer_chat for enrolled patient");
    target = resolveCanonicalChatTarget({
      ...input,
      enrolled: true,
      leadThreadIsLead: false,
      threadKind: undefined,
    });
  }

  logCanonicalChatDiag("navigate", {
    source: opts?.source ?? "unknown",
    canonical_chat_type: target.channel === "patient" ? "patient" : target.kind === "offer_chat" ? "offer" : "patient",
    resolved_thread_kind:
      target.kind === "patient_chat"
        ? "patient_chat"
        : target.kind === "offer_chat"
          ? "offer_chat"
          : "unknown",
    resolved_patient_id: "patientId" in target ? target.patientId : input.patientId,
    resolved_offer_id: "offerId" in target ? target.offerId : input.offerId,
    resolved_offer_archived: enrolled,
    lead_thread_is_lead: input.leadThreadIsLead ?? null,
    enrolled,
    bootstrap_route: input.bootstrapRoute ?? null,
  });

  const go = opts?.useReplace ? router.replace.bind(router) : router.push.bind(router);

  switch (target.kind) {
    case "offer_chat":
      if (__DEV__) console.log(`[CHAT OFFER] ${target.offerId}${opts?.source ? ` (${opts.source})` : ""}`);
      go({ pathname: "/offer-chat", params: target.routeParams } as never);
      break;
    case "patient_chat":
      go({ pathname: "/doctor/patient-chat", params: target.routeParams } as never);
      break;
    case "patient_chat_tab":
      go(target.path as never);
      break;
    case "redirect_patients":
      if (opts?.alertOnEnrolledRedirect) {
        Alert.alert(ENROLLED_TITLE, ENROLLED_BODY, [
          { text: "OK", onPress: () => go(target.path as never) },
        ]);
      } else {
        go(target.path as never);
      }
      break;
    case "redirect_requests":
    case "redirect_home":
      go(target.path as never);
      break;
    case "blocked":
      if (input.viewerRole === "doctor") {
        Alert.alert(ENROLLED_TITLE, ENROLLED_BODY, [{ text: "OK" }]);
      }
      break;
    default:
      break;
  }

  return target;
}

export type OpenDoctorPatientChatInput = {
  patientId: string | null | undefined;
  patientName: string;
  offerId?: string | null;
  requestId?: string | null;
  leadThreadIsLead?: unknown;
  /** When true (default for enrolled entry points), force patient_chat even if offer id is present. */
  enrolled?: boolean;
};

/**
 * Single entry for doctor → patient-chat (Patients list, Incoming Requests after enrollment, redirects).
 */
export function openDoctorPatientChat(
  router: Pick<Router, "push" | "replace">,
  input: OpenDoctorPatientChatInput,
  opts?: NavigateCanonicalChatOptions,
): CanonicalChatTarget {
  const patientId =
    resolveDoctorPatientRouteId({
      patientId: input.patientId,
      patient_id: input.patientId,
      id: input.patientId,
    }) || String(input.patientId || "").trim();
  const forceEnrolled =
    input.enrolled === true ||
    isEnrolledSharedCare({
      enrolled: input.enrolled,
      leadThreadIsLead: input.leadThreadIsLead,
    });

  return navigateCanonicalChat(
    router,
    {
      viewerRole: "doctor",
      patientId: patientId || input.patientId,
      patientName: input.patientName || "Patient",
      offerId: input.offerId,
      requestId: input.requestId,
      leadThreadIsLead: forceEnrolled ? false : input.leadThreadIsLead,
      enrolled: forceEnrolled ? true : input.enrolled,
    },
    opts,
  );
}
