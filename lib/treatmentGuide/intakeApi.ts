import { API_BASE, getAuthHeaders } from "../api";
import { emptyLeadData, mergeLeadData, type AiLeadData } from "../aiCoordinator/leadData";
import type { IntakeJourneyPayload, OperationalIntakeFlags, TreatmentGuideIntakeState } from "./types";

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<string>();
  for (const item of raw) {
    const s = String(item || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");
    if (s) out.add(s);
  }
  return [...out];
}

function normalizeLeadData(raw: unknown): AiLeadData {
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

function normalizeFlags(raw: unknown): OperationalIntakeFlags | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  return {
    missingXray: !!o.missingXray,
    missingSmilePhotos: !!o.missingSmilePhotos,
    missingTravelTimeline: !!o.missingTravelTimeline,
    missingTreatmentPreference: !!o.missingTreatmentPreference,
    missingMedicalHistory: !!o.missingMedicalHistory,
    doctorReviewNeeded: !!o.doctorReviewNeeded,
    missingDocumentTypes: Array.isArray(o.missingDocumentTypes)
      ? o.missingDocumentTypes.map(String)
      : [],
    patientReportedTags: normalizeTags(o.patientReportedTags),
    missingTeethCount:
      o.missingTeethCount != null && Number.isFinite(Number(o.missingTeethCount))
        ? Number(o.missingTeethCount)
        : null,
    readinessPercent:
      o.readinessPercent != null && Number.isFinite(Number(o.readinessPercent))
        ? Number(o.readinessPercent)
        : undefined,
    readinessMissing: Array.isArray(o.readinessMissing) ? o.readinessMissing.map(String) : [],
    journeyStage: o.journeyStage != null ? String(o.journeyStage) : undefined,
    journeyStageLabel: o.journeyStageLabel != null ? String(o.journeyStageLabel) : undefined,
  };
}

function normalizeJourney(raw: unknown): IntakeJourneyPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const steps = Array.isArray(o.steps)
    ? o.steps.map((s) => {
        const row = s as Record<string, unknown>;
        return {
          key: String(row.key || ""),
          title: String(row.title || ""),
          subtitle: String(row.subtitle || ""),
          status: (row.status as IntakeJourneyPayload["steps"][0]["status"]) || "pending",
          statusLabel: String(row.statusLabel || ""),
        };
      })
    : [];
  return {
    disclaimer: o.disclaimer != null ? String(o.disclaimer) : undefined,
    journeyStage: String(o.journeyStage || "intake_started"),
    journeyStageLabel: o.journeyStageLabel != null ? String(o.journeyStageLabel) : undefined,
    readinessPercent:
      o.readinessPercent != null && Number.isFinite(Number(o.readinessPercent))
        ? Number(o.readinessPercent)
        : null,
    readinessMissing: Array.isArray(o.readinessMissing) ? o.readinessMissing.map(String) : [],
    currentStepKey: o.currentStepKey != null ? String(o.currentStepKey) : undefined,
    steps,
  };
}

export function parseIntakeApiPayload(json: Record<string, unknown>): TreatmentGuideIntakeState {
  const leadData = normalizeLeadData(json.leadData);
  const flags = normalizeFlags(json.operationalIntakeFlags);
  const mergedFlags: OperationalIntakeFlags | null = flags
    ? {
        ...flags,
        patientReportedTags: flags.patientReportedTags?.length
          ? flags.patientReportedTags
          : leadData.patientReportedTags,
      }
    : leadData.patientReportedTags.length
      ? { patientReportedTags: leadData.patientReportedTags }
      : null;

  return {
    leadData: mergeLeadData(leadData, {
      patientReportedTags: mergedFlags?.patientReportedTags || leadData.patientReportedTags,
    }),
    operationalIntakeFlags: mergedFlags,
    intakeJourney: normalizeJourney(json.intakeJourney),
  };
}

export async function fetchTreatmentGuideIntake(params: {
  sessionId: string;
  clinicId?: string | null;
}): Promise<TreatmentGuideIntakeState> {
  const q = new URLSearchParams();
  q.set("sessionId", params.sessionId);
  if (params.clinicId) q.set("clinicId", params.clinicId);

  const res = await fetch(
    `${API_BASE.replace(/\/+$/, "")}/api/patient/me/intake-journey?${q.toString()}`,
    {
      headers: { Accept: "application/json", ...getAuthHeaders() },
    },
  );

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !json.ok) {
    throw new Error(String(json.error || json.message || `Request failed (${res.status})`));
  }

  return parseIntakeApiPayload(json);
}

export async function savePatientReportedTags(params: {
  sessionId: string;
  clinicId?: string | null;
  patientId?: string | null;
  patientReportedTags: string[];
  priorLeadData?: AiLeadData | null;
}): Promise<TreatmentGuideIntakeState> {
  const res = await fetch(`${API_BASE.replace(/\/+$/, "")}/ai/intake-tags`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      sessionId: params.sessionId,
      patientReportedTags: params.patientReportedTags,
      ...(params.clinicId ? { clinicId: params.clinicId } : {}),
      ...(params.patientId ? { patientId: params.patientId } : {}),
      ...(params.priorLeadData ? { priorLeadData: params.priorLeadData } : {}),
    }),
  });

  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || !json.success) {
    throw new Error(String(json.message || json.error || `Request failed (${res.status})`));
  }

  return parseIntakeApiPayload(json);
}
