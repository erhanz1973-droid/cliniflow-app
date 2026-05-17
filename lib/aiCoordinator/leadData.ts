/**
 * Lead intelligence signals (Phase 3) — mirrors POST /ai/chat `leadData`.
 */

export type LeadUrgency = "low" | "medium" | "high";
export type LeadBookingIntent = "low" | "medium" | "high";
export type LeadBudgetSignal = "low" | "medium" | "high" | "not_discussed";

export interface AiLeadData {
  treatmentInterest: string | null;
  country: string | null;
  /** Preferred language (ISO 639-1). */
  language: string | null;
  travelTimeline: string | null;
  urgency: LeadUrgency | null;
  bookingIntent: LeadBookingIntent | null;
  budgetSignal: LeadBudgetSignal | null;
  /** Patient-reported operational tags (not diagnoses). */
  patientReportedTags: string[];
  missingTeethCount: number | null;
}

export function emptyLeadData(): AiLeadData {
  return {
    treatmentInterest: null,
    country: null,
    language: null,
    travelTimeline: null,
    urgency: null,
    bookingIntent: null,
    budgetSignal: null,
    patientReportedTags: [],
    missingTeethCount: null,
  };
}

function mergeTagLists(a: string[] = [], b: string[] = []): string[] {
  return [...new Set([...a, ...b].map((t) => String(t).trim()).filter(Boolean))];
}

/** Merge session lead profile (newer non-null fields win). */
export function mergeLeadData(
  prev: AiLeadData | null | undefined,
  next: AiLeadData | null | undefined,
): AiLeadData {
  const p = prev ?? emptyLeadData();
  const n = next ?? emptyLeadData();
  return {
    treatmentInterest: n.treatmentInterest || p.treatmentInterest,
    country: n.country || p.country,
    language: n.language || p.language,
    travelTimeline: n.travelTimeline || p.travelTimeline,
    urgency: n.urgency || p.urgency,
    bookingIntent: n.bookingIntent || p.bookingIntent,
    budgetSignal: n.budgetSignal || p.budgetSignal,
    patientReportedTags: mergeTagLists(p.patientReportedTags, n.patientReportedTags),
    missingTeethCount: n.missingTeethCount ?? p.missingTeethCount ?? null,
  };
}

export function leadDataHasSignals(lead: AiLeadData | null | undefined): boolean {
  if (!lead) return false;
  return !!(
    lead.treatmentInterest ||
    lead.country ||
    lead.language ||
    lead.travelTimeline ||
    lead.urgency ||
    lead.bookingIntent ||
    lead.budgetSignal ||
    lead.patientReportedTags.length
  );
}

/** Hot lead heuristic for future routing (not persisted yet). */
export function isHotLead(lead: AiLeadData | null | undefined): boolean {
  if (!lead) return false;
  const bookingHot = lead.bookingIntent === "high";
  const urgencyHot = lead.urgency === "high";
  const hasTreatment = !!lead.treatmentInterest || lead.patientReportedTags.length > 0;
  return (bookingHot && hasTreatment) || (urgencyHot && bookingHot);
}

export function createAiCoordinatorSessionId(): string {
  return `aic_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}
