import { apiFetchJson } from "@/lib/api";

export type IntentTag =
  | "reassure_patient"
  | "explain_process"
  | "request_xray"
  | "request_cbct"
  | "explain_timeline"
  | "discuss_pricing"
  | "reduce_anxiety"
  | "encourage_consultation"
  | "collect_patient_info"
  | "schedule_visit";

export type RewriteAction =
  | "shorter"
  | "simpler"
  | "more_empathetic"
  | "more_professional"
  | "reassure_patient"
  | "more_concise";

export type ClinicalDraft = {
  id: string;
  guidanceId: string;
  draftText: string;
  status: string;
  confidence?: number | null;
  safetyReport?: { warnings?: string[] };
  messageProvenance?: Record<string, unknown>;
};

export type ExpandResponse = {
  ok?: boolean;
  guidance?: { id: string };
  patientDraft?: string;
  confidence?: number;
  detectedRisks?: string[];
  safetyReport?: { warnings?: string[] };
  draft?: ClinicalDraft | null;
  requiresApproval?: boolean;
  error?: string;
  message?: string;
};

export async function fetchIntentTags(): Promise<IntentTag[]> {
  const res = await apiFetchJson<{ ok?: boolean; intentTags?: IntentTag[] }>(
    "/api/ai/intent-tags",
    { timeoutMs: 15_000 },
  );
  return res.intentTags || [];
}

export async function expandClinicalGuidance(body: {
  patientId: string;
  intentText: string;
  intentTags?: IntentTag[];
  constraints?: string[];
  communicationGoals?: string[];
  guidanceId?: string;
  /** Required during doctor takeover — opts in to AI expansion. */
  explicitAiAssist?: boolean;
}): Promise<ExpandResponse> {
  return apiFetchJson<ExpandResponse>("/api/ai/expand-clinical-guidance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 60_000,
  });
}

export async function rewriteClinicalDraft(body: {
  draftId: string;
  draftText: string;
  action: RewriteAction;
  patientId?: string;
  explicitAiAssist?: boolean;
}): Promise<{
  ok?: boolean;
  patientDraft?: string;
  draft?: ClinicalDraft;
  safetyReport?: { warnings?: string[] };
  error?: string;
  message?: string;
}> {
  return apiFetchJson("/api/ai/rewrite-clinical-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 45_000,
  });
}

export type SendClinicalGuidanceResponse = {
  ok?: boolean;
  alreadySent?: boolean;
  error?: string;
  message?: string;
};

export function isDraftAlreadySentError(err: unknown): boolean {
  const e = err as Error & { status?: number; code?: string };
  return (
    e?.status === 409 ||
    e?.code === "draft_already_sent" ||
    String(e?.message || "").includes("draft_already_sent")
  );
}

export type DirectPatientMessageResponse = {
  ok?: boolean;
  sendMode?: "direct";
  finalText?: string;
  messageRef?: string | null;
  error?: string;
  message?: string;
};

/** Verbatim send — no AI expand/rewrite (doctor takeover). */
export async function sendDirectPatientMessage(body: {
  patientId: string;
  message: string;
}): Promise<DirectPatientMessageResponse> {
  const pid = encodeURIComponent(String(body.patientId || "").trim());
  return apiFetchJson<DirectPatientMessageResponse>(
    `/api/doctor/patients/${pid}/direct-message`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: body.message,
        text: body.message,
        sendMode: "direct",
      }),
      timeoutMs: 30_000,
    },
  );
}

export async function sendClinicalGuidance(body: {
  guidanceId: string;
  draftId: string;
  finalText: string;
  sendMode?: "ai_assisted" | "direct";
}): Promise<SendClinicalGuidanceResponse> {
  try {
    return await apiFetchJson<SendClinicalGuidanceResponse>(
      `/api/ai/clinical-guidance/${body.guidanceId}/send`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: body.draftId,
          finalText: body.finalText,
          sendMode: body.sendMode || "ai_assisted",
        }),
        timeoutMs: 30_000,
      },
    );
  } catch (err) {
    if (isDraftAlreadySentError(err)) {
      return { ok: true, alreadySent: true };
    }
    throw err;
  }
}
