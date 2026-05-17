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

export type TreatmentGuideIntakeState = {
  leadData: AiLeadData;
  operationalIntakeFlags: OperationalIntakeFlags | null;
  intakeJourney: IntakeJourneyPayload | null;
};

export type ChecklistItemStatus = "done" | "pending" | "optional";

export type IntakeChecklistItem = {
  id: string;
  status: ChecklistItemStatus;
  labelKey: string;
  hintKey?: string;
};
