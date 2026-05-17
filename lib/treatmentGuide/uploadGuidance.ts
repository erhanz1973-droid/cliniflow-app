import type { OperationalIntakeFlags } from "./types";

export type UploadGuidanceLine = { key: string; hint?: string };

/**
 * Upload copy derived only from backend `operationalIntakeFlags` (tags + missing flags).
 */
export function buildUploadGuidanceLines(flags: OperationalIntakeFlags | null): UploadGuidanceLine[] {
  const f = flags || {};
  const out: UploadGuidanceLine[] = [];
  const missingTypes = new Set((f.missingDocumentTypes || []).map(String));
  const tags = f.patientReportedTags || [];

  const wantsImplant = tags.some((tag) =>
    ["implant_interest", "full_mouth_restoration_interest", "missing_teeth_count"].includes(tag),
  );
  const wantsCosmetic = tags.some((tag) =>
    ["cosmetic_goal", "veneer_interest", "whitening_interest", "orthodontic_interest"].includes(tag),
  );

  if (f.missingXray || missingTypes.has("panoramic_xray")) {
    out.push({
      key: wantsImplant
        ? "treatmentGuide.uploadGuide.xrayImplant"
        : "treatmentGuide.uploadGuide.xrayGeneral",
      hint: "treatmentGuide.uploadGuide.xrayHint",
    });
  }

  if (f.missingSmilePhotos || missingTypes.has("intraoral_photo")) {
    out.push({
      key: wantsCosmetic
        ? "treatmentGuide.uploadGuide.photosCosmetic"
        : "treatmentGuide.uploadGuide.photosGeneral",
      hint: "treatmentGuide.uploadGuide.photosHint",
    });
  }

  if (f.doctorReviewNeeded) {
    out.push({
      key: "treatmentGuide.uploadGuide.doctorReview",
      hint: "treatmentGuide.uploadGuide.doctorHint",
    });
  }

  if (!out.length) {
    out.push({
      key: "treatmentGuide.uploadGuide.default",
      hint: "treatmentGuide.uploadGuide.defaultHint",
    });
  }

  return out;
}
