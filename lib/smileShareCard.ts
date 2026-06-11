import { translateKey } from "./i18n";
import { formatSmileScore, type SmileScoreData } from "./smileScore";
import type { SmileShareHighlight } from "./smileShareTypes";

const SHARE_URL = "https://clinifly.net";

/** Pick the most positive score to highlight (never frame low scores negatively). */
export function pickPositiveShareHighlight(data: SmileScoreData): SmileShareHighlight {
  const smile = Number(data.smileScore);
  const potential = Number(data.potentialScore);
  const safePotential = Number.isFinite(potential) ? potential : smile + 1;
  if (safePotential >= smile + 0.4 || smile < 7) {
    return { kind: "potential", score: safePotential };
  }
  return { kind: "smile", score: smile };
}

export function buildPositiveSmileShareText(data: SmileScoreData): string {
  const highlight = pickPositiveShareHighlight(data);
  const scoreLabel = formatSmileScore(highlight.score);
  const lines = [
    translateKey("smileShare.card.primary"),
    "",
    translateKey("smileShare.card.evaluated"),
  ];

  if (highlight.kind === "potential") {
    lines.push("", translateKey("smileShare.card.potentialScore", { score: scoreLabel }));
  } else {
    lines.push("", translateKey("smileShare.card.smileScore", { score: scoreLabel }));
  }

  lines.push(
    "",
    translateKey("smileShare.card.footerCta"),
    "Clinifly",
    SHARE_URL,
  );
  return lines.join("\n");
}

export function getShareCardDisplayLines(data: SmileScoreData): {
  primary: string;
  evaluated: string;
  scoreLine: string | null;
  footerCta: string;
  brand: string;
} {
  const highlight = pickPositiveShareHighlight(data);
  const scoreLabel = formatSmileScore(highlight.score);
  return {
    primary: translateKey("smileShare.card.primary"),
    evaluated: translateKey("smileShare.card.evaluated"),
    scoreLine:
      highlight.kind === "potential"
        ? translateKey("smileShare.card.potentialScore", { score: scoreLabel })
        : translateKey("smileShare.card.smileScore", { score: scoreLabel }),
    footerCta: translateKey("smileShare.card.footerCta"),
    brand: "Clinifly",
  };
}

export { SHARE_URL };
