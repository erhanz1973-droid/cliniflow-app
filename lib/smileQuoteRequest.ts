import type { Router } from "expo-router";
import { translateKey } from "./i18n";
import {
  extractSmileScoreFromPayload,
  formatSmileScore,
  type SmileScoreData,
} from "./smileScore";
import { goToClinicSelect } from "./offerRequestFlow";

function appendCategoryScores(lines: string[], data: SmileScoreData) {
  const cats = data.categoryScores;
  if (!cats) return;
  const rows: string[] = [];
  if (cats.whiteness != null && Number.isFinite(Number(cats.whiteness))) {
    rows.push(
      translateKey("smileQuote.clinicMessageWhiteness", {
        score: formatSmileScore(cats.whiteness),
      }),
    );
  }
  if (cats.alignment != null && Number.isFinite(Number(cats.alignment))) {
    rows.push(
      translateKey("smileQuote.clinicMessageAlignment", {
        score: formatSmileScore(cats.alignment),
      }),
    );
  }
  if (cats.symmetry != null && Number.isFinite(Number(cats.symmetry))) {
    rows.push(
      translateKey("smileQuote.clinicMessageSymmetry", {
        score: formatSmileScore(cats.symmetry),
      }),
    );
  }
  if (rows.length) {
    lines.push("", translateKey("smileQuote.clinicMessageCategories"));
    for (const r of rows) lines.push(`• ${r}`);
  }
}

export function buildSmileQuoteClinicMessage(data: SmileScoreData): string {
  const score = formatSmileScore(data.smileScore);
  const potential = formatSmileScore(data.potentialScore);
  const lines = [
    translateKey("smileQuote.clinicMessageTitle"),
    "",
    translateKey("smileQuote.clinicMessageScore", { score }),
    translateKey("smileQuote.clinicMessagePotential", { score: potential }),
  ];

  if (data.dentalSmileScore != null && Number.isFinite(Number(data.dentalSmileScore))) {
    lines.push(
      translateKey("smileQuote.clinicMessageDental", {
        score: formatSmileScore(data.dentalSmileScore),
      }),
    );
  }
  if (data.facialHarmonyScore != null && Number.isFinite(Number(data.facialHarmonyScore))) {
    lines.push(
      translateKey("smileQuote.clinicMessageFacial", {
        score: formatSmileScore(data.facialHarmonyScore),
      }),
    );
  }

  appendCategoryScores(lines, data);

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
    dentalSmileScore: data.dentalSmileScore ?? null,
    facialHarmonyScore: data.facialHarmonyScore ?? null,
    potentialScore: data.potentialScore,
    strengths: data.strengths,
    improvementAreas: data.improvementAreas,
    recommendations: data.recommendations,
    ...(data.categoryScores ? { categoryScores: data.categoryScores } : {}),
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
  opts: { imageUrl: string; teethImageUrl?: string | null; smileData: SmileScoreData },
): Promise<void> {
  const smile = String(opts.imageUrl || "").trim();
  const teeth = String(opts.teethImageUrl || "").trim();
  const photos = [smile, teeth].filter((u) => /^https?:\/\//i.test(u));
  await goToClinicSelect(router, {
    image: smile,
    photos,
    analysis: buildSmileQuoteAnalysisPayload(opts.smileData),
    message: buildSmileQuoteClinicMessage(opts.smileData),
  });
}
