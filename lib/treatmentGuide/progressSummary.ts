import type { IntakeJourneyPayload, OperationalIntakeFlags } from "./types";

export type ProgressLine = { id: string; textKey: string; done: boolean };

export function buildProgressSummaryLines(
  flags: OperationalIntakeFlags | null,
  journey: IntakeJourneyPayload | null,
): { completedCount: number; totalCount: number; lines: ProgressLine[] } {
  const steps = journey?.steps || [];
  const completedFromJourney = steps.filter((s) => s.status === "complete").length;
  const totalFromJourney = steps.filter((s) => s.status !== "skipped").length;

  const goalsDone =
    (flags?.patientReportedTags?.length || 0) > 0 || flags?.missingTreatmentPreference === false;
  const photosDone = flags?.missingSmilePhotos === false;
  const xrayDone = flags?.missingXray === false;
  const reviewPending = flags?.doctorReviewNeeded === true;

  const lines: ProgressLine[] = [
    {
      id: "goals",
      textKey: goalsDone
        ? "treatmentGuide.progress.goalsDone"
        : "treatmentGuide.progress.goalsPending",
      done: goalsDone,
    },
    {
      id: "photos",
      textKey: photosDone
        ? "treatmentGuide.progress.photosDone"
        : "treatmentGuide.progress.photosPending",
      done: photosDone,
    },
  ];

  if (flags?.missingXray !== undefined) {
    lines.push({
      id: "xray",
      textKey: xrayDone ? "treatmentGuide.progress.xrayDone" : "treatmentGuide.progress.xrayOptional",
      done: xrayDone,
    });
  }

  if (reviewPending) {
    lines.push({
      id: "review",
      textKey: "treatmentGuide.progress.reviewPending",
      done: false,
    });
  }

  const completedCount =
    totalFromJourney > 0
      ? completedFromJourney
      : lines.filter((l) => l.done).length;
  const totalCount = totalFromJourney > 0 ? totalFromJourney : Math.max(lines.length, 1);

  return { completedCount, totalCount, lines };
}
