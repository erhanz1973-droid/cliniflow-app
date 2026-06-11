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
import { isSmileAnalysisFailureText, resolveSmileSummaryText } from "./smileAiSummary";
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
  const dentalSmileScore =
    analysis.dentalSmileScore != null && Number.isFinite(Number(analysis.dentalSmileScore))
      ? Number(analysis.dentalSmileScore)
      : undefined;
  const facialHarmonyScore =
    analysis.facialHarmonyScore != null && Number.isFinite(Number(analysis.facialHarmonyScore))
      ? Number(analysis.facialHarmonyScore)
      : undefined;
  const potentialScore =
    analysis.potentialScore != null && Number.isFinite(Number(analysis.potentialScore))
      ? Number(analysis.potentialScore)
      : undefined;

  const enBlock = (at as Record<string, unknown> | null | undefined)?.en as
    | { summary?: string; recommendation?: string }
    | undefined;

  const strengths = mapStringArray(
    block?.strengths ?? analysis.strengths,
    5,
  );
  const improvementAreas = mapStringArray(
    block?.improvementAreas ?? analysis.improvementAreas,
    5,
  );
  const recommendations = mapStringArray(
    block?.recommendations ?? analysis.recommendations,
    6,
  );

  const rawSummary = block
    ? String(block.summary ?? analysis.summary ?? "")
    : String(analysis.summary ?? "");
  const rawRecommendation = block
    ? String(block.recommendation ?? analysis.recommendation ?? "")
    : String(analysis.recommendation ?? "");

  const summary = resolveSmileSummaryText(rawSummary, strengths, enBlock?.summary);
  let recommendation = rawRecommendation;
  if (isSmileAnalysisFailureText(recommendation)) {
    recommendation =
      String(enBlock?.recommendation || "").trim() ||
      recommendations[0] ||
      improvementAreas[0] ||
      "";
  }

  const insights = block
    ? Array.isArray(block.insights)
      ? block.insights.map((x) => String(x))
      : []
    : Array.isArray(analysis.insights)
      ? (analysis.insights as unknown[]).map((x) => String(x))
      : [];

  return {
    insights: insights.filter((x) => !isSmileAnalysisFailureText(x)),
    summary,
    recommendation,
    smileScore,
    dentalSmileScore,
    facialHarmonyScore,
    potentialScore,
    strengths,
    improvementAreas: improvementAreas.filter((x) => !isSmileAnalysisFailureText(x)),
    recommendations,
  };
}
