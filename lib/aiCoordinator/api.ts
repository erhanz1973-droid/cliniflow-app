import { API_BASE, classifyApiError, getAuthHeaders, type ApiErrorKind } from "../api";
import { AI_COORDINATOR_REQUEST_TIMEOUT_MS } from "./constants";
import { emptyLeadData, leadDataHasSignals, mergeLeadData, type AiLeadData } from "./leadData";
import { parseIntakeApiPayload, type TreatmentGuideIntakeState } from "../treatmentGuide/intakeApi";
import type {
  AiCoordinatorChatRequest,
  AiCoordinatorChatResponse,
  AiCoordinatorLeadPipelineMeta,
} from "./types";

export type { TreatmentGuideIntakeState };

export type AiCoordinatorApiError = {
  kind: ApiErrorKind;
  message: string;
  code?: string;
};

export type AiCoordinatorChatResult = {
  reply: string;
  leadData: AiLeadData;
  conversationSummary: string;
  leadPipeline?: AiCoordinatorLeadPipelineMeta;
  sessionId?: string;
  intake?: TreatmentGuideIntakeState;
};

function mapHttpStatusToKind(status: number): ApiErrorKind {
  if (status === 408 || status === 504) return "timeout";
  if (status === 502 || status === 503) return "warmingUp";
  if (status >= 500) return "server";
  return "generic";
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.map((t) => String(t || "").trim()).filter(Boolean))];
}

function normalizeResponseLeadData(raw: unknown): AiLeadData {
  if (!raw || typeof raw !== "object") return emptyLeadData();
  const o = raw as Record<string, unknown>;
  return mergeLeadData(emptyLeadData(), {
    treatmentInterest: o.treatmentInterest != null ? String(o.treatmentInterest) : null,
    country: o.country != null ? String(o.country) : null,
    language: o.language != null ? String(o.language) : null,
    travelTimeline:
      o.travelTimeline != null
        ? String(o.travelTimeline)
        : o.travel_timeline != null
          ? String(o.travel_timeline)
          : null,
    urgency: o.urgency as AiLeadData["urgency"],
    bookingIntent: o.bookingIntent as AiLeadData["bookingIntent"],
    budgetSignal: o.budgetSignal as AiLeadData["budgetSignal"],
    patientReportedTags: normalizeTags(o.patientReportedTags ?? o.patient_reported_tags),
    missingTeethCount:
      o.missingTeethCount != null && Number.isFinite(Number(o.missingTeethCount))
        ? Number(o.missingTeethCount)
        : null,
  });
}

/**
 * POST /ai/chat — returns assistant reply + merged lead intelligence.
 */
export async function postAiCoordinatorChat(
  body: AiCoordinatorChatRequest,
): Promise<AiCoordinatorChatResult> {
  const message = String(body.message || "").trim();
  if (!message) {
    throw { kind: "generic" as const, message: "Message is required", code: "message_required" };
  }

  const url = `${API_BASE.replace(/\/+$/, "")}/ai/chat`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_COORDINATOR_REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        message,
        ...(body.clinicId ? { clinicId: body.clinicId } : {}),
        ...(body.sessionId ? { sessionId: body.sessionId } : {}),
        ...(body.patientId ? { patientId: body.patientId } : {}),
        ...(body.history?.length ? { history: body.history } : {}),
        ...(body.conversationSummary?.trim()
          ? { conversationSummary: body.conversationSummary.trim() }
          : {}),
        ...(body.priorLeadData ? { priorLeadData: body.priorLeadData } : {}),
        ...(body.contextMode === "treatment_guide"
          ? { contextMode: "treatment_guide", includeTravelContext: false }
          : body.contextMode === "coordinator"
            ? { contextMode: "coordinator" }
            : {}),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await res.text();
    let json: AiCoordinatorChatResponse = { success: false };
    try {
      json = text ? (JSON.parse(text) as AiCoordinatorChatResponse) : { success: false };
    } catch {
      json = { success: false, message: "Invalid response from server" };
    }

    if (!res.ok || !json.success) {
      const msg =
        (json && "message" in json && json.message) ||
        (json && "error" in json && json.error) ||
        `Request failed (${res.status})`;
      throw {
        kind: mapHttpStatusToKind(res.status),
        message: String(msg),
        code: json && "error" in json ? String(json.error) : undefined,
      } satisfies AiCoordinatorApiError;
    }

    const reply = String(json.reply || "").trim();
    if (!reply) {
      throw {
        kind: "generic" as const,
        message: "Empty reply from assistant",
        code: "empty_reply",
      } satisfies AiCoordinatorApiError;
    }

    const turnLead = normalizeResponseLeadData(json.leadData);
    const leadData = mergeLeadData(body.priorLeadData, turnLead);
    const conversationSummary = String(json.conversationSummary ?? body.conversationSummary ?? "").trim();

    const intake =
      json.operationalIntakeFlags || json.intakeJourney
        ? parseIntakeApiPayload({
            leadData: json.leadData,
            operationalIntakeFlags: json.operationalIntakeFlags,
            intakeJourney: json.intakeJourney,
          })
        : undefined;

    return {
      reply,
      leadData: intake?.leadData || leadData,
      conversationSummary,
      leadPipeline: json.leadPipeline,
      sessionId: json.leadPipeline?.sessionId || body.sessionId,
      intake: intake
        ? {
            ...intake,
            leadData: intake.leadData || leadData,
          }
        : undefined,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);

    if (err && typeof err === "object" && "kind" in err) {
      throw err;
    }

    const name = (err as { name?: string })?.name;
    if (name === "AbortError") {
      throw {
        kind: "timeout" as const,
        message: "The assistant took too long to respond. Please try again.",
        code: "timeout",
      } satisfies AiCoordinatorApiError;
    }

    const msg = String((err as Error)?.message || "");
    throw {
      kind: classifyApiError(err),
      message:
        msg.includes("Network request failed") || msg.includes("Failed to fetch")
          ? "Could not reach the server. Check your connection and try again."
          : msg || "Something went wrong. Please try again.",
      code: "network",
    } satisfies AiCoordinatorApiError;
  }
}
