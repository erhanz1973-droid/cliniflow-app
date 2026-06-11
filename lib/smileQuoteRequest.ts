import type { Router } from "expo-router";
import { translateKey } from "./i18n";
import { extractSmileScoreFromPayload, formatSmileScore, type SmileScoreData } from "./smileScore";
import { goToClinicSelect } from "./offerRequestFlow";

export function buildSmileQuoteClinicMessage(data: SmileScoreData): string {
  const score = formatSmileScore(data.smileScore);
  const potential = formatSmileScore(data.potentialScore);
  const lines = [
    translateKey("smileQuote.clinicMessageTitle"),
    "",
    translateKey("smileQuote.clinicMessageScore", { score }),
    translateKey("smileQuote.clinicMessagePotential", { score: potential }),
  ];

  if (data.strengths.length) {
    lines.push("", translateKey("smileQuote.clinicMessageStrengths"));
    for (const s of data.strengths) lines.push(`• ${s}`);
  }
  if (data.improvementAreas.length) {
    lines.push("", translateKey("smileQuote.clinicMessageImprovements"));
    for (const s of data.improvementAreas) lines.push(`• ${s}`);
  }
  if (data.recommendations.length) {
    lines.push("", translateKey("smileQuote.clinicMessageTreatments"));
    for (const r of data.recommendations) lines.push(`• ${r}`);
  }

  lines.push("", translateKey("smileQuote.clinicMessageClosing"));
  return lines.join("\n");
}

export function buildSmileQuoteAnalysisPayload(data: SmileScoreData): Record<string, unknown> {
  return {
    type: "smile_score_quote",
    smileScore: data.smileScore,
    potentialScore: data.potentialScore,
    strengths: data.strengths,
    improvementAreas: data.improvementAreas,
    recommendations: data.recommendations,
  };
}

export function buildSmileQuoteClinicMessageFromAnalysis(
  analysis: Record<string, unknown> | null | undefined,
): string | null {
  const data = extractSmileScoreFromPayload(analysis);
  if (!data) return null;
  return buildSmileQuoteClinicMessage(data);
}

export function isSmileScoreQuoteAnalysis(
  analysis: Record<string, unknown> | null | undefined,
): boolean {
  if (!analysis || typeof analysis !== "object") return false;
  if (analysis.type === "smile_score_quote") return true;
  return Number.isFinite(Number(analysis.smileScore));
}

/** Navigate to clinic picker with smile score context pre-filled for clinics. */
export async function startSmileQuoteRequest(
  router: Pick<Router, "push">,
  opts: { imageUrl: string; smileData: SmileScoreData },
): Promise<void> {
  const image = String(opts.imageUrl || "").trim();
  await goToClinicSelect(router, {
    image,
    analysis: buildSmileQuoteAnalysisPayload(opts.smileData),
    message: buildSmileQuoteClinicMessage(opts.smileData),
  });
}
