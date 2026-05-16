import type { Router } from "expo-router";
import { Alert } from "react-native";
import { API_BASE } from "./api";
import {
  goToOfferChat,
  normalizeLeadThreadIsLead,
  type GoToOfferChatParams,
} from "./goToOfferChat";
import { doctorPatientPrimaryKey } from "./doctorPatientId";

export type IncomingRequestChatContext = {
  requestId: string;
  patientId?: string | null;
  patientName: string;
  offerId?: string | null;
  myOfferId?: string | null;
  leadThreadIsLead?: unknown;
  preferredTreatment?: string | null;
};

export type StartChatDiagFields = {
  requestId?: string;
  patientId?: string | null;
  offerId?: string | null;
  threadId?: string | null;
  routeTarget?: string;
  error?: string;
  enrolled?: boolean;
  leadThreadIsLead?: boolean | null;
};

function logStartChat(event: string, fields: StartChatDiagFields): void {
  const payload = { event, ts: new Date().toISOString(), ...fields };
  console.log(event, payload);
}

function isEnrolledLead(leadRaw: unknown): boolean {
  return normalizeLeadThreadIsLead(leadRaw) === false;
}

/** Shared offer-chat params for doctor incoming requests + push deep links. */
export function buildOfferChatRouteParams(
  offerId: string,
  ctx: Pick<IncomingRequestChatContext, "patientName" | "preferredTreatment" | "leadThreadIsLead">,
): GoToOfferChatParams {
  return {
    offerId,
    otherNameRaw: ctx.patientName || "Patient",
    treatmentType: ctx.preferredTreatment || "",
    leadThreadIsLead: ctx.leadThreadIsLead,
    /** Never block foreign leads with unknown thread row — only hard-block enrolled. */
    requireExplicitLeadThread: false,
  };
}

export function buildOfferChatPath(offerId: string, patientName: string): string {
  const q = new URLSearchParams({
    offerId,
    otherName: encodeURIComponent(patientName || "Patient"),
  });
  return `/offer-chat?${q.toString()}`;
}

export function buildPatientChatPath(patientId: string, patientName: string): string {
  const q = new URLSearchParams({
    patientId,
    patientName: encodeURIComponent(patientName || "Patient"),
  });
  return `/doctor/patient-chat?${q.toString()}`;
}

type EnsureOfferChatResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  offer_id?: string | null;
  offerId?: string | null;
  patient_id?: string | null;
  thread_id?: string | null;
  enrolled?: boolean;
  lead_thread_is_lead?: boolean | null;
  route?: "offer_chat" | "patient_chat";
};

/**
 * Doctor → Incoming Requests → Messages / Open Conversation.
 * Resolves offer id (bootstrap if needed), ensures lead thread server-side, navigates with alerts on failure.
 */
export async function startIncomingRequestChat(opts: {
  token: string;
  ctx: IncomingRequestChatContext;
  router: Pick<Router, "push">;
  t: (key: string) => string;
  source: string;
}): Promise<boolean> {
  const { token, ctx, router, t, source } = opts;
  const requestId = String(ctx.requestId || "").trim();
  const patientId = ctx.patientId ? String(ctx.patientId).trim() : null;
  let offerId = String(ctx.offerId || ctx.myOfferId || "").trim();
  const leadRaw = ctx.leadThreadIsLead;

  logStartChat("incoming_request_start_chat_press", {
    requestId,
    patientId,
    offerId: offerId || null,
    leadThreadIsLead: normalizeLeadThreadIsLead(leadRaw),
    enrolled: isEnrolledLead(leadRaw),
  });

  if (isEnrolledLead(leadRaw)) {
    const pk = doctorPatientPrimaryKey({ id: patientId ?? undefined });
    if (!pk) {
      logStartChat("incoming_request_start_chat_failed", {
        requestId,
        patientId,
        error: "enrolled_missing_patient_id",
        routeTarget: "/doctor/patients",
      });
      Alert.alert(
        t("common.error") !== "common.error" ? t("common.error") : "Error",
        t("requests.enrolled.messagesBlockedBody") !== "requests.enrolled.messagesBlockedBody"
          ? t("requests.enrolled.messagesBlockedBody")
          : "Open this patient from the Patients page to continue messaging.",
        [
          { text: "OK", onPress: () => router.push("/doctor/patients" as never) },
        ],
      );
      return false;
    }
    const routeTarget = buildPatientChatPath(pk, ctx.patientName);
    logStartChat("incoming_request_start_chat_thread_found", {
      requestId,
      patientId: pk,
      routeTarget,
      enrolled: true,
    });
    router.push(routeTarget as never);
    return true;
  }

  try {
    const res = await fetch(
      `${API_BASE}/api/doctor/treatment-requests/${encodeURIComponent(requestId)}/ensure-offer-chat`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          offer_id: offerId || null,
          patient_id: patientId,
        }),
      },
    );
    const data = (await res.json().catch(() => ({}))) as EnsureOfferChatResponse;

    if (!res.ok || data?.ok === false) {
      const err = String(data?.error || data?.message || `http_${res.status}`);
      logStartChat("incoming_request_start_chat_failed", {
        requestId,
        patientId,
        offerId: offerId || null,
        error: err,
      });
      Alert.alert(
        t("common.error") !== "common.error" ? t("common.error") : "Error",
        t("requests.chat.openFailed") !== "requests.chat.openFailed"
          ? t("requests.chat.openFailed").replace("{error}", err)
          : `Could not open chat (${err}). Pull to refresh and try again.`,
        [{ text: t("common.retry") !== "common.retry" ? t("common.retry") : "Retry" }],
      );
      return false;
    }

    if (data.route === "patient_chat" || data.enrolled === true) {
      const pid = String(data.patient_id || patientId || "").trim();
      const pk = doctorPatientPrimaryKey({ id: pid });
      if (!pk) {
        logStartChat("incoming_request_start_chat_failed", {
          requestId,
          error: "bootstrap_patient_chat_no_id",
        });
        Alert.alert(t("common.error") !== "common.error" ? t("common.error") : "Error", "Patient id missing.");
        return false;
      }
      const routeTarget = buildPatientChatPath(pk, ctx.patientName);
      logStartChat("incoming_request_start_chat_thread_found", {
        requestId,
        patientId: pk,
        threadId: data.thread_id ? String(data.thread_id) : null,
        routeTarget,
        enrolled: true,
      });
      router.push(routeTarget as never);
      return true;
    }

    const resolvedOffer = String(data.offer_id || data.offerId || offerId || "").trim();
    if (!resolvedOffer) {
      logStartChat("incoming_request_start_chat_failed", {
        requestId,
        patientId,
        error: "no_offer_after_bootstrap",
      });
      Alert.alert(
        t("common.error") !== "common.error" ? t("common.error") : "Error",
        t("requests.chat.missingOffer") !== "requests.chat.missingOffer"
          ? t("requests.chat.missingOffer")
          : "No offer thread yet. Send an offer first, then open Messages.",
      );
      return false;
    }

    const created = !offerId;
    offerId = resolvedOffer;
    const routeParams = buildOfferChatRouteParams(offerId, {
      patientName: ctx.patientName,
      preferredTreatment: ctx.preferredTreatment,
      leadThreadIsLead: data.lead_thread_is_lead ?? leadRaw ?? true,
    });
    logStartChat(
      created ? "incoming_request_start_chat_thread_created" : "incoming_request_start_chat_thread_found",
      {
        requestId,
        patientId: String(data.patient_id || patientId || "") || null,
        offerId,
        threadId: data.thread_id ? String(data.thread_id) : null,
        routeTarget: buildOfferChatPath(offerId, ctx.patientName),
        leadThreadIsLead: normalizeLeadThreadIsLead(routeParams.leadThreadIsLead),
      },
    );
    logStartChat("incoming_request_start_chat_payload", {
      requestId,
      patientId: String(data.patient_id || patientId || "") || null,
      offerId,
      threadId: data.thread_id ? String(data.thread_id) : null,
      routeTarget: buildOfferChatPath(offerId, ctx.patientName),
      leadThreadIsLead: normalizeLeadThreadIsLead(routeParams.leadThreadIsLead),
    });

    goToOfferChat(router, routeParams, source);
    logStartChat("incoming_request_start_chat_navigation", {
      requestId,
      offerId,
      routeTarget: buildOfferChatPath(offerId, ctx.patientName),
    });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logStartChat("incoming_request_start_chat_failed", {
      requestId,
      patientId,
      offerId: offerId || null,
      error: msg,
    });
    Alert.alert(
      t("common.error") !== "common.error" ? t("common.error") : "Error",
      t("requests.chat.networkFailed") !== "requests.chat.networkFailed"
        ? t("requests.chat.networkFailed")
        : "Network error. Check connection and try again.",
      [{ text: t("common.retry") !== "common.retry" ? t("common.retry") : "Retry" }],
    );
    return false;
  }
}
