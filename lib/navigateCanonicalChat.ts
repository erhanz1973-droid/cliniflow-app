import type { Router } from "expo-router";
import { Alert } from "react-native";
import {
  resolveCanonicalChatTarget,
  type CanonicalChatTarget,
  type ResolveCanonicalChatInput,
} from "./canonicalChatTarget";

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
  const target = resolveCanonicalChatTarget(input);
  if (__DEV__) {
    console.log("[canonical-chat:navigate]", {
      source: opts?.source,
      kind: target.kind,
      channel: target.channel,
      offerId: "offerId" in target ? target.offerId : undefined,
      patientId: "patientId" in target ? target.patientId : undefined,
    });
  }

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
