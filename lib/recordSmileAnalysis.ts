import { recordSmileAnalysisFromPayload } from "./smileScoreHistory";
import { onSmileAnalysisRecorded } from "./smileAnalysisReminders";

/** Single hook after any successful smile analysis (Treatment Guide, Messages, etc.). */
export async function recordSmileAnalysis(
  patientId: string,
  aiData: Record<string, unknown>,
  opts?: { fileUrl?: string; contentHash?: string | null; analyzedAt?: number },
): Promise<void> {
  const pid = String(patientId || "").trim();
  if (!pid || !aiData || typeof aiData !== "object") return;

  const analyzedAt = opts?.analyzedAt ?? Date.now();
  const row = await recordSmileAnalysisFromPayload(pid, aiData, {
    ...opts,
    analyzedAt,
  });
  if (row) {
    await onSmileAnalysisRecorded(pid, analyzedAt);
  }
}
