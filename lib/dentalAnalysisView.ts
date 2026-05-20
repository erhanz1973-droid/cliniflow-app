export type DentalAnalysisTranslationsMap = Record<
  string,
  { insights?: unknown[]; summary?: string; recommendation?: string }
> | null;

import { normalizeAnalyzeApiPayload } from "./dentalAnalysisNormalize";

export function getLocalizedDentalAnalysis(
  analysis: Record<string, unknown> | null,
  lang: string,
): { insights: string[]; summary: string; recommendation: string } {
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
    | { insights?: unknown[]; summary?: string; recommendation?: string }
    | undefined;

  if (block) {
    return {
      insights: Array.isArray(block.insights) ? block.insights.map((x) => String(x)) : [],
      summary: String(block.summary ?? ""),
      recommendation: String(block.recommendation ?? ""),
    };
  }

  return {
    insights: Array.isArray(analysis.insights)
      ? (analysis.insights as unknown[]).map((x) => String(x))
      : [],
    summary: String(analysis.summary ?? ""),
    recommendation: String(analysis.recommendation ?? ""),
  };
}
