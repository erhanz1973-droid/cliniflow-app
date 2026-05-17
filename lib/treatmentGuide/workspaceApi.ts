import { API_BASE, getAuthHeaders } from "../api";
import type { TreatmentGuideWorkspace } from "./types";

export async function saveTreatmentGuideWorkspace(params: {
  sessionId: string;
  patientNarrative?: string;
  inquiryDraftText?: string;
  photoUrl?: string | null;
  contentHash?: string | null;
  photoSavedAt?: string | null;
  analysisSavedAt?: string | null;
  analysisSnapshot?: Record<string, unknown> | null;
}): Promise<TreatmentGuideWorkspace | null> {
  const sessionId = String(params.sessionId || "").trim();
  if (!sessionId) return null;

  const res = await fetch(
    `${API_BASE.replace(/\/+$/, "")}/api/patient/me/treatment-guide-workspace`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        sessionId,
        ...(params.patientNarrative != null ? { patientNarrative: params.patientNarrative } : {}),
        ...(params.inquiryDraftText != null ? { inquiryDraftText: params.inquiryDraftText } : {}),
        ...(params.photoUrl != null ? { photoUrl: params.photoUrl } : {}),
        ...(params.contentHash != null ? { contentHash: params.contentHash } : {}),
        ...(params.photoSavedAt != null ? { photoSavedAt: params.photoSavedAt } : {}),
        ...(params.analysisSavedAt != null ? { analysisSavedAt: params.analysisSavedAt } : {}),
        ...(params.analysisSnapshot != null ? { analysisSnapshot: params.analysisSnapshot } : {}),
      }),
    },
  );

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !json.ok) return null;
  return normalizeWorkspace(json.treatmentGuideWorkspace);
}

export function normalizeWorkspace(raw: unknown): TreatmentGuideWorkspace | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const analysisSnapshot =
    o.analysisSnapshot && typeof o.analysisSnapshot === "object"
      ? (o.analysisSnapshot as Record<string, unknown>)
      : null;
  return {
    photoUrl: o.photoUrl != null ? String(o.photoUrl) : o.photo_url != null ? String(o.photo_url) : null,
    contentHash:
      o.contentHash != null
        ? String(o.contentHash)
        : o.content_hash != null
          ? String(o.content_hash)
          : null,
    photoSavedAt:
      o.photoSavedAt != null
        ? String(o.photoSavedAt)
        : o.photo_saved_at != null
          ? String(o.photo_saved_at)
          : null,
    analysisSnapshot,
    analysisSavedAt:
      o.analysisSavedAt != null
        ? String(o.analysisSavedAt)
        : o.analysis_saved_at != null
          ? String(o.analysis_saved_at)
          : null,
    patientNarrative: String(o.patientNarrative || o.patient_narrative || ""),
    inquiryDraftText: String(o.inquiryDraftText || o.inquiry_draft_text || ""),
    updatedAt: o.updatedAt != null ? String(o.updatedAt) : null,
  };
}
