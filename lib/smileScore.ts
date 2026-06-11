/**
 * Smile Score — structured aesthetic evaluation from /api/chat/ai-analyze.
 */
import type { SmileCategoryScores } from "./smileScoreTypes";

export type SmileScoreData = {
  smileScore: number;
  dentalSmileScore?: number | null;
  facialHarmonyScore?: number | null;
  potentialScore: number;
  strengths: string[];
  improvementAreas: string[];
  recommendations: string[];
  categoryScores?: SmileCategoryScores;
};

function parseOptionalScore(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseCategoryScores(raw: unknown): SmileCategoryScores | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const cs = raw as Record<string, unknown>;
  const whiteness = parseOptionalScore(cs.whiteness ?? cs.brightness);
  const alignment = parseOptionalScore(cs.alignment);
  const symmetry = parseOptionalScore(cs.symmetry);
  const aesthetics = parseOptionalScore(cs.aesthetics ?? cs.smileAesthetics);
  if (
    whiteness == null &&
    alignment == null &&
    symmetry == null &&
    aesthetics == null
  ) {
    return undefined;
  }
  return { whiteness, alignment, symmetry, aesthetics };
}

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

  const categoryScores = parseCategoryScores(
    payload.categoryScores ?? payload.category_scores,
  );
  const dentalSmileScore = parseOptionalScore(
    payload.dentalSmileScore ?? payload.dental_smile_score,
  );
  const facialHarmonyScore = parseOptionalScore(
    payload.facialHarmonyScore ?? payload.facial_harmony_score,
  );

  return {
    smileScore,
    ...(dentalSmileScore != null ? { dentalSmileScore } : {}),
    ...(facialHarmonyScore != null ? { facialHarmonyScore } : {}),
    potentialScore: Number.isFinite(potentialScore) ? potentialScore : smileScore + 1,
    strengths,
    improvementAreas,
    recommendations,
    ...(categoryScores ? { categoryScores } : {}),
  };
}
