import type { AiLeadData } from "../aiCoordinator/leadData";

export type JourneyStageKey =
  | "intake_started"
  | "awaiting_photos"
  | "awaiting_xray"
  | "doctor_review_pending"
  | "coordinator_followup"
  | "consultation_ready";

export type IntakeStepStatus = "complete" | "current" | "pending" | "skipped";

export type IntakeJourneyStep = {
  key: string;
  title: string;
  subtitle: string;
  status: IntakeStepStatus;
  statusLabel: string;
};

export type IntakeJourneyPayload = {
  disclaimer?: string;
  journeyStage: JourneyStageKey | string;
  journeyStageLabel?: string;
  readinessPercent?: number | null;
  readinessMissing?: string[];
  currentStepKey?: string;
  steps: IntakeJourneyStep[];
};

export type OperationalIntakeFlags = {
  missingXray?: boolean;
  missingSmilePhotos?: boolean;
  missingTravelTimeline?: boolean;
  missingTreatmentPreference?: boolean;
  missingMedicalHistory?: boolean;
  doctorReviewNeeded?: boolean;
  missingDocumentTypes?: string[];
  patientReportedTags?: string[];
  missingTeethCount?: number | null;
  readinessPercent?: number;
  readinessMissing?: string[];
  journeyStage?: JourneyStageKey | string;
  journeyStageLabel?: string;
};

export type PatientIntakeDocument = {
  id: string;
  documentType: string;
  documentTypeLabel?: string;
  fileUrl?: string;
  thumbnailUrl?: string;
  mimeType?: string;
  uploadedAt?: string;
  reviewStatus?: string;
};

export type ClinicDirectorySnapshot = {
  clinics: Array<{
    id: string;
    name: string;
    city: string | null;
    city_code: string | null;
    country: string | null;
    clinicCode: string | null;
  }>;
  cities: string[];
  total: number;
  cityCount: number;
};

export type TreatmentGuideWorkspace = {
  photoUrl: string | null;
  contentHash: string | null;
  photoSavedAt: string | null;
  analysisSnapshot: Record<string, unknown> | null;
  analysisSavedAt: string | null;
  patientNarrative: string;
  inquiryDraftText: string;
  updatedAt: string | null;
};

export type TreatmentGuideIntakeState = {
  leadData: AiLeadData;
  operationalIntakeFlags: OperationalIntakeFlags | null;
  intakeJourney: IntakeJourneyPayload | null;
  documents: PatientIntakeDocument[];
  clinicDirectory: ClinicDirectorySnapshot | null;
  treatmentGuideWorkspace: TreatmentGuideWorkspace | null;
};

export type ChecklistItemStatus = "done" | "pending" | "optional";

export type IntakeChecklistItem = {
  id: string;
  status: ChecklistItemStatus;
  labelKey: string;
  hintKey?: string;
};

export type UploadGuidanceSlotId = "smile_photos" | "panoramic_xray" | "doctor_review" | "other";

export type UploadGuidanceSlot = {
  id: UploadGuidanceSlotId;
  /** Primary document type sent to POST /api/patient/me/ai-documents */
  documentType: string;
  titleKey: string;
  hintKey: string;
  done: boolean;
  showUpload: boolean;
  allowImagePicker: boolean;
  allowDocumentPicker: boolean;
  informational?: boolean;
};
