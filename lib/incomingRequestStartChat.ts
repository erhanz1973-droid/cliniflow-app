import type { Router } from "expo-router";
import { Alert } from "react-native";
import { API_BASE } from "./api";
import {
  buildOfferChatPath,
  buildPatientChatPath,
  normalizeLeadThreadIsLead,
  resolveCanonicalChatTarget,
  type ResolveCanonicalChatInput,
} from "./canonicalChatTarget";
import { navigateCanonicalChat } from "./navigateCanonicalChat";
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
  canonicalKind?: string;
};

function logStartChat(event: string, fields: StartChatDiagFields): void {
  const payload = { event, ts: new Date().toISOString(), ...fields };
  console.log(event, payload);
}

function ctxToResolveInput(
  ctx: IncomingRequestChatContext,
  overrides?: Partial<ResolveCanonicalChatInput>,
): ResolveCanonicalChatInput {
  return {
    viewerRole: "doctor",
    patientId: ctx.patientId,
    patientName: ctx.patientName,
    offerId: ctx.offerId || ctx.myOfferId,
    requestId: ctx.requestId,
    leadThreadIsLead: ctx.leadThreadIsLead,
    treatmentType: ctx.preferredTreatment,
    threadKind: "offer",
    ...overrides,
  };
}

/** Shared offer-chat params for doctor incoming requests + push deep links. */
export function buildOfferChatRouteParams(
  offerId: string,
  ctx: Pick<IncomingRequestChatContext, "patientName" | "preferredTreatment" | "leadThreadIsLead" | "patientId">,
) {
  const target = resolveCanonicalChatTarget(
    ctxToResolveInput(
      {
        requestId: "",
        patientName: ctx.patientName,
        patientId: ctx.patientId,
        offerId,
        leadThreadIsLead: ctx.leadThreadIsLead,
        preferredTreatment: ctx.preferredTreatment,
      },
      { offerId },
    ),
  );
  if (target.kind !== "offer_chat") return null;
  return target;
}

export { buildOfferChatPath, buildPatientChatPath };

/**
 * Doctor → Incoming Requests → Messages / Open Conversation.
 */
export async function startIncomingRequestChat(opts: {
  token: string;
  ctx: IncomingRequestChatContext;
  router: Pick<Router, "push" | "replace">;
  t: (key: string) => string;
  source: string;
}): Promise<boolean> {
  const { token, ctx, router, t, source } = opts;
  const requestId = String(ctx.requestId || "").trim();
  const patientId = ctx.patientId ? String(ctx.patientId).trim() : null;
  let offerId = String(ctx.offerId || ctx.myOfferId || "").trim();
  const leadRaw = ctx.leadThreadIsLead;

  const preTarget = resolveCanonicalChatTarget(ctxToResolveInput(ctx));
  logStartChat("incoming_request_start_chat_press", {
    requestId,
    patientId,
    offerId: offerId || null,
    leadThreadIsLead: normalizeLeadThreadIsLead(leadRaw),
    enrolled: preTarget.channel === "patient" && preTarget.kind === "patient_chat",
    canonicalKind: preTarget.kind,
    routeTarget: preTarget.path,
  });

  if (preTarget.kind === "patient_chat") {
    navigateCanonicalChat(router, ctxToResolveInput(ctx), {
      source,
      alertOnEnrolledRedirect: true,
    });
    return true;
  }

  if (preTarget.kind === "redirect_patients") {
    navigateCanonicalChat(router, ctxToResolveInput(ctx), {
      source,
      alertOnEnrolledRedirect: true,
    });
    return false;
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
    const data = (await res.json().catch(() => ({}))) as {
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

    const resolvedOffer = String(data.offer_id || data.offerId || offerId || "").trim();
    const bootstrapInput = ctxToResolveInput(ctx, {
      offerId: resolvedOffer || offerId,
      patientId: data.patient_id || patientId,
      leadThreadIsLead: data.lead_thread_is_lead ?? leadRaw,
      enrolled: data.enrolled === true,
      bootstrapRoute: data.route,
    });
    const target = resolveCanonicalChatTarget(bootstrapInput);

    if (!resolvedOffer && target.kind === "offer_chat") {
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

    const created = !offerId && !!resolvedOffer;
    offerId = resolvedOffer || offerId;

    logStartChat(
      created ? "incoming_request_start_chat_thread_created" : "incoming_request_start_chat_thread_found",
      {
        requestId,
        patientId: String(data.patient_id || patientId || "") || null,
        offerId: offerId || null,
        threadId: data.thread_id ? String(data.thread_id) : null,
        routeTarget: target.path,
        leadThreadIsLead: normalizeLeadThreadIsLead(bootstrapInput.leadThreadIsLead),
        canonicalKind: target.kind,
        enrolled: target.channel === "patient",
      },
    );

    navigateCanonicalChat(router, bootstrapInput, { source });
    logStartChat("incoming_request_start_chat_navigation", {
      requestId,
      offerId: offerId || null,
      routeTarget: target.path,
      canonicalKind: target.kind,
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
