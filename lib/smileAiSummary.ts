import type { SmileScoreData } from "./smileScore";

/** Known backend fallback / error phrases — never show in AI Summary. */
const FAILURE_TEXT_PATTERNS = [
  /net bir değerlendirme yapılamadı/i,
  /görüntü analiz edilemedi/i,
  /a clear assessment could not be made/i,
  /the image could not be fully analyzed/i,
  /could not be fully analyzed/i,
  /невозможно дать чёткую оценку/i,
  /შეფასება ცხადი ვერ იყო/i,
  /\[tr unavailable\]/i,
  /\[ka unavailable\]/i,
  /\[ru unavailable\]/i,
  /farklı açılardan fotoğraf ekleyebilir/i,
  /add photos from different angles/i,
  /consult your dentist/i,
  /diş hekiminize danışabilirsiniz/i,
];

export function isSmileAnalysisFailureText(text: string | null | undefined): boolean {
  const t = String(text || "").trim();
  if (!t) return true;
  return FAILURE_TEXT_PATTERNS.some((re) => re.test(t));
}

export type SmileAiSummaryLine = { emoji: string; text: string };

/** Build AI summary lines from real smile data; skip fallback/error copy. */
export function buildSmileAiSummaryLines(
  data: SmileScoreData,
  opts: {
    summary?: string;
    recommendation?: string;
    insights?: string[];
  } = {},
): SmileAiSummaryLine[] {
  const lines: SmileAiSummaryLine[] = [];

  let summaryText = String(opts.summary || "").trim();
  if (isSmileAnalysisFailureText(summaryText)) summaryText = "";

  if (!summaryText && data.strengths.length > 0) {
    summaryText = data.strengths.slice(0, 2).join(". ");
    if (!summaryText.endsWith(".")) summaryText += ".";
  }

  if (summaryText) lines.push({ emoji: "😊", text: summaryText });

  const dentalLine =
    data.improvementAreas.find((x) => !isSmileAnalysisFailureText(x)) ||
    opts.insights?.map((x) => String(x || "").trim()).find((x) => x && !isSmileAnalysisFailureText(x)) ||
    "";
  if (dentalLine) lines.push({ emoji: "🦷", text: dentalLine });

  let potentialLine = String(opts.recommendation || "").trim();
  if (isSmileAnalysisFailureText(potentialLine)) potentialLine = "";

  if (!potentialLine) {
    potentialLine =
      data.recommendations.find((x) => !isSmileAnalysisFailureText(x)) || "";
  }

  if (!potentialLine && data.recommendations.length > 1) {
    potentialLine = data.recommendations.slice(0, 2).join(" and ");
  }

  if (potentialLine) lines.push({ emoji: "✨", text: potentialLine });

  return lines;
}

/** Prefer strengths-based summary when API returned a failure/fallback string. */
export function resolveSmileSummaryText(
  summary: string | null | undefined,
  strengths: string[],
  fallbackSummary?: string | null,
): string {
  let text = String(summary || "").trim();
  if (!isSmileAnalysisFailureText(text)) return text;

  const alt = String(fallbackSummary || "").trim();
  if (alt && !isSmileAnalysisFailureText(alt)) return alt;

  if (strengths.length > 0) {
    const built = strengths.slice(0, 2).join(". ");
    return built.endsWith(".") ? built : `${built}.`;
  }

  return "";
}
