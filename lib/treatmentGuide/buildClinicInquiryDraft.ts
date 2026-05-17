import type { AiLeadData } from "../aiCoordinator/leadData";
import { TREATMENT_GOAL_CHIPS, tagsToChipIds } from "./chips";
import {
  collectInquiryAttachments,
  type InquiryAttachment,
} from "./collectInquiryAttachments";
import type { OperationalIntakeFlags, PatientIntakeDocument } from "./types";

export type ClinicInquiryAttachment = InquiryAttachment;

export type ClinicInquiryDraft = {
  text: string;
  attachments: ClinicInquiryAttachment[];
  suggestedQuestionKeys: readonly string[];
};

export type BuildClinicInquiryDraftInput = {
  flags: OperationalIntakeFlags | null;
  leadData: AiLeadData;
  documents: PatientIntakeDocument[];
  patientNarrative: string;
  photoGuidanceSummary?: string;
  hasDentalPhoto?: boolean;
  dentalPhotoUrl?: string;
  t: (key: string, params?: Record<string, string | number>) => string;
};

const SUGGESTED_QUESTION_KEYS = [
  "treatmentGuide.inquiry.suggest.visits",
  "treatmentGuide.inquiry.suggest.panoramic",
  "treatmentGuide.inquiry.suggest.timeline",
  "treatmentGuide.inquiry.suggest.morePhotos",
] as const;

function formatTimeline(raw: string | null | undefined, t: BuildClinicInquiryDraftInput["t"]): string | null {
  const s = String(raw || "").trim();
  if (!s) return null;
  const key = `treatmentGuide.inquiry.timeline.${s.replace(/[^a-z0-9_]/gi, "_")}`;
  const translated = t(key);
  if (translated !== key) return translated;
  return s.replace(/_/g, " ");
}

/**
 * Build a calm, clinic-ready inquiry from existing intake orchestration data.
 */
export function buildClinicInquiryDraft(input: BuildClinicInquiryDraftInput): ClinicInquiryDraft {
  const { flags, leadData, documents, patientNarrative, t } = input;
  const tags = flags?.patientReportedTags?.length
    ? flags.patientReportedTags
    : leadData.patientReportedTags || [];

  const concernLines: string[] = [];
  const chipIds = tagsToChipIds(tags);
  for (const id of chipIds) {
    const chip = TREATMENT_GOAL_CHIPS.find((c) => c.id === id);
    if (chip) concernLines.push(t(chip.labelKey));
  }
  const narrative = patientNarrative.trim();
  if (narrative && !concernLines.includes(narrative)) concernLines.push(narrative);

  const attachments = collectInquiryAttachments({
    documents,
    dentalPhotoUrl: input.dentalPhotoUrl,
    sessionPhotoUrl: input.hasDentalPhoto ? input.dentalPhotoUrl : undefined,
    t,
  });

  const attachmentBlock =
    attachments.length > 0
      ? attachments.map((a) => `• ${a.label}`).join("\n")
      : `• ${t("treatmentGuide.inquiry.attachments.none")}`;

  const timeline = formatTimeline(leadData.travelTimeline, t);
  const guidance = String(input.photoGuidanceSummary || "").trim();

  const parts: string[] = [
    t("treatmentGuide.inquiry.intro"),
    "",
    t("treatmentGuide.inquiry.section.concerns"),
    concernLines.length > 0
      ? concernLines.map((l) => `• ${l}`).join("\n")
      : `• ${t("treatmentGuide.inquiry.concerns.default")}`,
    "",
    t("treatmentGuide.inquiry.section.attachments"),
    attachmentBlock,
  ];

  if (timeline) {
    parts.push("", t("treatmentGuide.inquiry.section.timeline"), `• ${timeline}`);
  } else if (flags?.missingTravelTimeline) {
    parts.push(
      "",
      t("treatmentGuide.inquiry.section.timeline"),
      `• ${t("treatmentGuide.inquiry.timeline.unspecified")}`,
    );
  }

  parts.push("", t("treatmentGuide.inquiry.section.questions"));
  if (guidance) {
    const clipped = guidance.length > 300 ? `${guidance.slice(0, 297)}…` : guidance;
    parts.push(`• ${t("treatmentGuide.inquiry.questions.guidancePrefix")} ${clipped}`);
  } else {
    parts.push(`• ${t("treatmentGuide.inquiry.questions.default")}`);
  }

  parts.push("", t("treatmentGuide.inquiry.closing"), "");

  return {
    text: parts.join("\n"),
    attachments,
    suggestedQuestionKeys: SUGGESTED_QUESTION_KEYS,
  };
}

export { SUGGESTED_QUESTION_KEYS };
