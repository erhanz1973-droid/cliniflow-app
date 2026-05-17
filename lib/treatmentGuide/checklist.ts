import type { IntakeChecklistItem, OperationalIntakeFlags } from "./types";

/** Backend `readinessMissing` labels → patient i18n keys (operational only; no travel/country). */
const READINESS_MISSING_I18N: Record<string, string> = {
  "Treatment goals or patient-reported concerns": "treatmentGuide.checklist.goalsPending",
  "Panoramic X-ray / imaging (when relevant)": "treatmentGuide.checklist.xrayRequested",
  "Smile / intraoral photos": "treatmentGuide.checklist.photosRequested",
  "Licensed dentist review of uploads": "treatmentGuide.checklist.doctorPending",
  "At least one intake document uploaded": "treatmentGuide.checklist.documentsRequested",
};

const PATIENT_HIDDEN_READINESS = new Set([
  "Country / origin",
  "Travel timeline (optional)",
  "Conversation / coordinator engagement",
]);

/**
 * Operational checklist — derived only from backend `operationalIntakeFlags`
 * and `readinessMissing` (no frontend workflow inference).
 */
export function buildIntakeChecklist(flags: OperationalIntakeFlags | null): IntakeChecklistItem[] {
  const f = flags || {};
  if (!Object.keys(f).length) return [];

  const items: IntakeChecklistItem[] = [];
  const seen = new Set<string>();

  const add = (item: IntakeChecklistItem) => {
    if (seen.has(item.id)) return;
    seen.add(item.id);
    items.push(item);
  };

  const goalsDone = f.missingTreatmentPreference !== true;
  add({
    id: "goals",
    status: goalsDone ? "done" : "pending",
    labelKey: goalsDone
      ? "treatmentGuide.checklist.goalsDone"
      : "treatmentGuide.checklist.goalsPending",
  });

  const missingTypes = new Set((f.missingDocumentTypes || []).map(String));

  if (f.missingSmilePhotos === true || missingTypes.has("intraoral_photo")) {
    add({
      id: "photos",
      status: f.missingSmilePhotos ? "pending" : "done",
      labelKey: f.missingSmilePhotos
        ? "treatmentGuide.checklist.photosRequested"
        : "treatmentGuide.checklist.photosDone",
      hintKey: "treatmentGuide.checklist.photosHint",
    });
  }

  if (f.missingXray === true || missingTypes.has("panoramic_xray")) {
    add({
      id: "xray",
      status: f.missingXray ? "pending" : "done",
      labelKey: f.missingXray
        ? "treatmentGuide.checklist.xrayRequested"
        : "treatmentGuide.checklist.xrayDone",
      hintKey: "treatmentGuide.checklist.xrayHint",
    });
  }

  if (f.doctorReviewNeeded) {
    add({
      id: "doctor_review",
      status: "pending",
      labelKey: "treatmentGuide.checklist.doctorPending",
      hintKey: "treatmentGuide.checklist.doctorHint",
    });
  }

  if (f.journeyStage === "coordinator_followup") {
    add({
      id: "coordinator",
      status: "pending",
      labelKey: "treatmentGuide.checklist.coordinatorPending",
      hintKey: "treatmentGuide.checklist.coordinatorHint",
    });
  }

  if (f.journeyStage === "consultation_ready") {
    add({
      id: "consultation",
      status: "done",
      labelKey: "treatmentGuide.checklist.consultationReady",
    });
  }

  for (const label of f.readinessMissing || []) {
    if (PATIENT_HIDDEN_READINESS.has(label)) continue;
    const labelKey = READINESS_MISSING_I18N[label];
    if (!labelKey) continue;
    const id = `readiness_${labelKey}`;
    if (seen.has(id)) continue;
    const alreadyCovered =
      (labelKey.includes("goals") && seen.has("goals")) ||
      (labelKey.includes("xray") && seen.has("xray")) ||
      (labelKey.includes("photos") && seen.has("photos")) ||
      (labelKey.includes("doctor") && seen.has("doctor_review"));
    if (alreadyCovered) continue;
    add({ id, status: "pending", labelKey });
  }

  return items;
}
