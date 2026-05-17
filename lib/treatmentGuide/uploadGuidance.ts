import type { OperationalIntakeFlags, PatientIntakeDocument, UploadGuidanceSlot } from "./types";

const PHOTO_TYPES = new Set(["intraoral_photo", "selfie"]);
const IMAGING_TYPES = new Set(["panoramic_xray", "ct_scan"]);

function hasDocumentType(documents: PatientIntakeDocument[], types: Set<string>) {
  return documents.some((d) => types.has(String(d.documentType || "")));
}

/**
 * Actionable upload rows derived from backend flags + uploaded documents (no frontend workflow engine).
 */
export function buildUploadGuidanceSlots(
  flags: OperationalIntakeFlags | null,
  documents: PatientIntakeDocument[],
): UploadGuidanceSlot[] {
  const f = flags || {};
  const slots: UploadGuidanceSlot[] = [];
  const missingTypes = new Set((f.missingDocumentTypes || []).map(String));
  const hasPhotos = hasDocumentType(documents, PHOTO_TYPES);
  const hasImaging = hasDocumentType(documents, IMAGING_TYPES);

  const photosRelevant =
    f.missingSmilePhotos === true || missingTypes.has("intraoral_photo") || hasPhotos;
  if (photosRelevant) {
    const done = f.missingSmilePhotos !== true;
    slots.push({
      id: "smile_photos",
      documentType: "intraoral_photo",
      titleKey: "treatmentGuide.upload.slot.photosTitle",
      hintKey: "treatmentGuide.upload.slot.photosHint",
      done,
      showUpload: !done,
      allowImagePicker: true,
      allowDocumentPicker: false,
    });
  }

  const xrayRelevant = f.missingXray === true || missingTypes.has("panoramic_xray") || hasImaging;
  if (xrayRelevant) {
    const done = f.missingXray !== true;
    slots.push({
      id: "panoramic_xray",
      documentType: "panoramic_xray",
      titleKey: "treatmentGuide.upload.slot.xrayTitle",
      hintKey: "treatmentGuide.upload.slot.xrayHint",
      done,
      showUpload: !done,
      allowImagePicker: true,
      allowDocumentPicker: true,
    });
  }

  if (f.doctorReviewNeeded) {
    slots.push({
      id: "doctor_review",
      documentType: "other",
      titleKey: "treatmentGuide.upload.slot.doctorReviewTitle",
      hintKey: "treatmentGuide.upload.slot.doctorReviewHint",
      done: false,
      showUpload: false,
      allowImagePicker: false,
      allowDocumentPicker: false,
      informational: true,
    });
  }

  if (!slots.length || slots.every((s) => s.done && !s.informational)) {
    slots.push({
      id: "other",
      documentType: "other",
      titleKey: "treatmentGuide.upload.slot.otherTitle",
      hintKey: "treatmentGuide.upload.slot.otherHint",
      done: false,
      showUpload: true,
      allowImagePicker: true,
      allowDocumentPicker: true,
    });
  }

  return slots;
}
