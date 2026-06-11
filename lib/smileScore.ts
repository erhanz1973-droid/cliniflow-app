/**
 * Smile Score — structured aesthetic evaluation from /api/chat/ai-analyze.
 */
export type SmileScoreData = {
  smileScore: number;
  potentialScore: number;
  strengths: string[];
  improvementAreas: string[];
  recommendations: string[];
};

export function formatSmileScore(n: number | null | undefined): string {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return (Math.round(x * 10) / 10).toFixed(1);
}

export function hasSmileScoreData(data: Partial<SmileScoreData> | null | undefined): boolean {
  if (!data) return false;
  return (
    Number.isFinite(Number(data.smileScore)) &&
    (Array.isArray(data.strengths) && data.strengths.length > 0 ||
      Array.isArray(data.improvementAreas) && data.improvementAreas.length > 0)
  );
}

function pickStringArray(v: unknown, max = 6): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x || "").trim()).filter(Boolean).slice(0, max);
}

/** Extract smile score block from API / cached analysis payload (optionally localized). */
export function extractSmileScoreFromPayload(
  payload: Record<string, unknown> | null | undefined,
  localized?: Partial<SmileScoreData> | null,
): SmileScoreData | null {
  if (!payload || typeof payload !== "object") return null;

  const smileScore = Number(payload.smileScore);
  const potentialScore = Number(payload.potentialScore);
  if (!Number.isFinite(smileScore)) return null;

  const strengths = pickStringArray(localized?.strengths ?? payload.strengths, 5);
  const improvementAreas = pickStringArray(
    localized?.improvementAreas ?? payload.improvementAreas,
    5,
  );
  const recommendations = pickStringArray(
    localized?.recommendations ?? payload.recommendations,
    6,
  );

  if (!strengths.length && !improvementAreas.length) return null;

  return {
    smileScore,
    potentialScore: Number.isFinite(potentialScore) ? potentialScore : smileScore + 1,
    strengths,
    improvementAreas,
    recommendations,
  };
}
