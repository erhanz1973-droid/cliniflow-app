export type DentalAnalysisTranslationsMap = Record<
  string,
  {
    insights?: unknown[];
    summary?: string;
    recommendation?: string;
    strengths?: unknown[];
    improvementAreas?: unknown[];
    recommendations?: unknown[];
  }
> | null;

import { normalizeAnalyzeApiPayload } from "./dentalAnalysisNormalize";
import type { SmileScoreData } from "./smileScore";

export type LocalizedDentalAnalysis = {
  insights: string[];
  summary: string;
  recommendation: string;
} & Partial<SmileScoreData>;

function mapStringArray(v: unknown, max = 6): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x)).filter(Boolean).slice(0, max);
}

export function getLocalizedDentalAnalysis(
  analysis: Record<string, unknown> | null,
  lang: string,
): LocalizedDentalAnalysis {
  const normalized = normalizeAnalyzeApiPayload(analysis);
  if (!normalized) {
    return { insights: [], summary: "", recommendation: "" };
  }
  analysis = normalized;

  const key = String(lang || "en")
    .toLowerCase()
    .replace(/_/g, "-")
    .split("-")[0];

  const at =
    analysis.allTranslations ??
    (analysis as { _allTranslations?: DentalAnalysisTranslationsMap })._allTranslations;

  const block = (at as Record<string, unknown> | null | undefined)?.[key] as
    | {
        insights?: unknown[];
        summary?: string;
        recommendation?: string;
        strengths?: unknown[];
        improvementAreas?: unknown[];
        recommendations?: unknown[];
      }
    | undefined;

  const smileScore =
    analysis.smileScore != null && Number.isFinite(Number(analysis.smileScore))
      ? Number(analysis.smileScore)
      : undefined;
  const potentialScore =
    analysis.potentialScore != null && Number.isFinite(Number(analysis.potentialScore))
      ? Number(analysis.potentialScore)
      : undefined;

  if (block) {
    return {
      insights: Array.isArray(block.insights) ? block.insights.map((x) => String(x)) : [],
      summary: String(block.summary ?? ""),
      recommendation: String(block.recommendation ?? ""),
      smileScore,
      potentialScore,
      strengths: mapStringArray(block.strengths ?? analysis.strengths, 5),
      improvementAreas: mapStringArray(block.improvementAreas ?? analysis.improvementAreas, 5),
      recommendations: mapStringArray(block.recommendations ?? analysis.recommendations, 6),
    };
  }

  return {
    insights: Array.isArray(analysis.insights)
      ? (analysis.insights as unknown[]).map((x) => String(x))
      : [],
    summary: String(analysis.summary ?? ""),
    recommendation: String(analysis.recommendation ?? ""),
    smileScore,
    potentialScore,
    strengths: mapStringArray(analysis.strengths, 5),
    improvementAreas: mapStringArray(analysis.improvementAreas, 5),
    recommendations: mapStringArray(analysis.recommendations, 6),
  };
}
