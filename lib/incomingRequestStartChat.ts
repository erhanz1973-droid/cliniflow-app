import type { Router } from "expo-router";
import { Alert } from "react-native";
import { API_BASE } from "./api";
import {
  buildOfferChatPath,
  buildPatientChatPath,
  isEnrolledSharedCare,
  normalizeLeadThreadIsLead,
  resolveCanonicalChatTarget,
  type ResolveCanonicalChatInput,
} from "./canonicalChatTarget";
import { logCanonicalChatDiag } from "./canonicalChatDiagnostics";
import { navigateCanonicalChat } from "./navigateCanonicalChat";
import { patchDoctorRequestEnrollmentInCache } from "./patchDoctorRequestEnrollment";

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

export type StartIncomingRequestChatResult = {
  ok: boolean;
  /** Patched rows for requests list when enrollment was resolved server-side. */
  cacheRows?: ReturnType<typeof patchDoctorRequestEnrollmentInCache>;
};

function logStartChat(event: string, fields: StartChatDiagFields): void {
  const payload = { event, ts: new Date().toISOString(), ...fields };
  console.log(event, payload);
}

function ctxToResolveInput(
  ctx: IncomingRequestChatContext,
  overrides?: Partial<ResolveCanonicalChatInput>,
): ResolveCanonicalChatInput {
  const merged: ResolveCanonicalChatInput = {
    viewerRole: "doctor",
    patientId: ctx.patientId,
    patientName: ctx.patientName,
    offerId: ctx.offerId || ctx.myOfferId,
    requestId: ctx.requestId,
    leadThreadIsLead: ctx.leadThreadIsLead,
    treatmentType: ctx.preferredTreatment,
    ...overrides,
  };
  if (!isEnrolledSharedCare(merged)) {
    merged.threadKind = "offer";
  }
  return merged;
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
 * Doctor → Incoming Requests → Messages.
 * Server-first: always calls ensure-offer-chat when requestId is set (never trust stale list cache).
 */
export async function startIncomingRequestChat(opts: {
  token: string;
  ctx: IncomingRequestChatContext;
  router: Pick<Router, "push" | "replace">;
  t: (key: string) => string;
  source: string;
}): Promise<StartIncomingRequestChatResult> {
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
    enrolled: isEnrolledSharedCare({ leadThreadIsLead: leadRaw }),
    canonicalKind: "server_bootstrap",
    routeTarget: "ensure-offer-chat",
  });

  if (!requestId) {
    const fallback = resolveCanonicalChatTarget(ctxToResolveInput(ctx));
    navigateCanonicalChat(router, ctxToResolveInput(ctx), { source });
    return { ok: fallback.kind !== "blocked" };
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
      return { ok: false };
    }

    const serverEnrolled = data.enrolled === true || data.route === "patient_chat";
    const resolvedOffer = String(data.offer_id || data.offerId || offerId || "").trim();
    const resolvedPatientId = String(data.patient_id || patientId || "").trim();
    const serverLead =
      data.lead_thread_is_lead != null
        ? normalizeLeadThreadIsLead(data.lead_thread_is_lead)
        : serverEnrolled
          ? false
          : normalizeLeadThreadIsLead(leadRaw);

    const bootstrapInput = ctxToResolveInput(ctx, {
      offerId: resolvedOffer || offerId,
      patientId: resolvedPatientId || patientId,
      leadThreadIsLead: serverLead,
      enrolled: serverEnrolled,
      bootstrapRoute: data.route,
    });

    let target = resolveCanonicalChatTarget(bootstrapInput);

    if (serverEnrolled && target.kind === "offer_chat") {
      console.warn("[canonical-chat:invariant] server enrolled but resolver returned offer_chat — forcing patient_chat");
      bootstrapInput.enrolled = true;
      bootstrapInput.leadThreadIsLead = false;
      delete bootstrapInput.threadKind;
      target = resolveCanonicalChatTarget(bootstrapInput);
    }

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
      return { ok: false };
    }

    const created = !offerId && !!resolvedOffer;
    offerId = resolvedOffer || offerId;

    logCanonicalChatDiag("incoming_request_start_chat_resolved", {
      source,
      canonical_chat_type: target.channel === "patient" ? "patient" : "offer",
      resolved_thread_kind: target.kind === "patient_chat" ? "patient_chat" : target.kind === "offer_chat" ? "offer_chat" : "unknown",
      resolved_patient_id: resolvedPatientId || patientId,
      resolved_offer_id: offerId || null,
      resolved_offer_archived: serverEnrolled,
      lead_thread_is_lead: serverLead,
      enrolled: serverEnrolled,
      bootstrap_route: data.route ?? null,
      extra: { requestId, threadId: data.thread_id },
    });

    logStartChat(
      created ? "incoming_request_start_chat_thread_created" : "incoming_request_start_chat_thread_found",
      {
        requestId,
        patientId: resolvedPatientId || patientId,
        offerId: offerId || null,
        threadId: data.thread_id ? String(data.thread_id) : null,
        routeTarget: target.path,
        leadThreadIsLead: serverLead,
        canonicalKind: target.kind,
        enrolled: serverEnrolled,
      },
    );

    const cacheRows =
      serverEnrolled && requestId
        ? patchDoctorRequestEnrollmentInCache(requestId, {
            lead_thread_is_lead: false,
            enrolled: true,
          })
        : null;

    navigateCanonicalChat(router, bootstrapInput, {
      source,
      alertOnEnrolledRedirect: serverEnrolled && target.kind === "patient_chat",
    });

    logStartChat("incoming_request_start_chat_navigation", {
      requestId,
      offerId: offerId || null,
      routeTarget: target.path,
      canonicalKind: target.kind,
    });

    return { ok: true, cacheRows: cacheRows ?? undefined };
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
    return { ok: false };
  }
}
