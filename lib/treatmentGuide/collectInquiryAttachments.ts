import type { PatientIntakeDocument } from "./types";

export type InquiryAttachmentKind = "photo" | "xray" | "ct" | "pdf" | "document";

export type InquiryAttachment = {
  id: string;
  label: string;
  kind: InquiryAttachmentKind;
  documentType?: string;
  url?: string;
  thumbnailUrl?: string;
  mimeType?: string;
};

export type CollectInquiryAttachmentsInput = {
  documents: PatientIntakeDocument[];
  dentalPhotoUrl?: string;
  /** Workspace / session photo not yet in ai_patient_documents */
  sessionPhotoUrl?: string;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function normUrl(u: string | undefined): string {
  return String(u || "").trim().split("?")[0];
}

function attachmentKind(documentType: string, mimeType?: string): InquiryAttachmentKind {
  const d = documentType.toLowerCase();
  const m = String(mimeType || "").toLowerCase();
  if (d === "ct_scan" || /\bct\b/.test(d)) return "ct";
  if (/panoramic|xray|x-ray|opg|radiograph/.test(d)) return "xray";
  if (
    d === "treatment_report" ||
    d === "bloodwork_pdf" ||
    /pdf|report|bloodwork/.test(d) ||
    m.includes("pdf")
  ) {
    return "pdf";
  }
  if (/smile|intraoral|selfie|dental|photo|ai_upload/.test(d) || m.startsWith("image/")) return "photo";
  return "document";
}

function attachmentLabel(
  documentType: string,
  documentTypeLabel: string | undefined,
  t: CollectInquiryAttachmentsInput["t"],
): string {
  if (documentTypeLabel?.trim()) return documentTypeLabel.trim();
  const key = `treatmentGuide.inquiry.doc.${documentType.replace(/[^a-z0-9_]/gi, "_")}`;
  const translated = t(key);
  if (translated !== key) return translated;
  const d = documentType.toLowerCase();
  if (d === "ct_scan") return t("treatmentGuide.inquiry.doc.ct_scan");
  if (/panoramic|xray|opg/.test(d)) return t("treatmentGuide.inquiry.doc.panoramic_xray");
  if (d === "treatment_report") return t("treatmentGuide.inquiry.doc.treatment_report");
  if (d === "intraoral_photo") return t("treatmentGuide.inquiry.doc.intraoral_photos");
  if (/smile|selfie|photo/.test(d)) return t("treatmentGuide.inquiry.doc.smile_photos");
  return t("treatmentGuide.inquiry.doc.other");
}

/**
 * Assemble all patient-uploaded files for clinic inquiry preview & send (single source: ai_patient_documents + session photo).
 */
export function filterIncludedInquiryAttachments(
  attachments: InquiryAttachment[],
  excludedIds?: ReadonlySet<string>,
): InquiryAttachment[] {
  if (!excludedIds?.size) return attachments;
  return attachments.filter((a) => !excludedIds.has(a.id));
}

export function collectInquiryAttachments(input: CollectInquiryAttachmentsInput): InquiryAttachment[] {
  const { documents, dentalPhotoUrl, sessionPhotoUrl, t } = input;
  const out: InquiryAttachment[] = [];
  const seenUrls = new Set<string>();

  const push = (item: InquiryAttachment) => {
    const urlKey = normUrl(item.url);
    if (urlKey && seenUrls.has(urlKey)) return;
    if (urlKey) seenUrls.add(urlKey);
    out.push(item);
  };

  const sessionPhoto = normUrl(dentalPhotoUrl || sessionPhotoUrl);
  if (sessionPhoto && /^https?:\/\//i.test(sessionPhoto)) {
    push({
      id: "session_dental_photo",
      kind: "photo",
      label: t("treatmentGuide.inquiry.attachment.dentalPhoto"),
      url: dentalPhotoUrl || sessionPhotoUrl,
      thumbnailUrl: dentalPhotoUrl || sessionPhotoUrl,
      documentType: "dental_photo",
    });
  }

  for (const doc of documents) {
    if (!doc.id) continue;
    const url = String(doc.fileUrl || "").trim();
    if (!url) continue;
    push({
      id: doc.id,
      kind: attachmentKind(doc.documentType, doc.mimeType),
      label: attachmentLabel(doc.documentType, doc.documentTypeLabel, t),
      url,
      thumbnailUrl: doc.thumbnailUrl || (/^https?:\/\//i.test(url) ? url : undefined),
      mimeType: doc.mimeType,
      documentType: doc.documentType,
    });
  }

  return out;
}

export const INQUIRY_ATTACHMENT_SECTION_ORDER: InquiryAttachmentKind[] = [
  "photo",
  "xray",
  "ct",
  "pdf",
  "document",
];

export function inquiryAttachmentSectionTitle(
  kind: InquiryAttachmentKind,
  t: CollectInquiryAttachmentsInput["t"],
): string {
  const key = `treatmentGuide.inquiry.section.${kind}`;
  const translated = t(key);
  return translated !== key ? translated : kind;
}
