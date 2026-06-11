import { Share, Platform } from "react-native";
import { buildPositiveSmileShareText } from "./smileShareCard";
import { translateKey } from "./i18n";
import type { SmileScoreData } from "./smileScore";

/** @deprecated Prefer SmileShareSheet + shareSmileScoreOnFacebook for rewarded Facebook flow. */
export function buildSmileScoreShareText(data: SmileScoreData): string {
  return buildPositiveSmileShareText(data);
}

/** Generic system share (non-rewarded). */
export async function shareSmileScore(data: SmileScoreData): Promise<boolean> {
  const message = buildPositiveSmileShareText(data);
  const title = translateKey("smileShare.card.primary");
  try {
    const result = await Share.share(
      Platform.OS === "ios" ? { message, title, url: "https://clinifly.net" } : { message },
    );
    return result.action === Share.sharedAction;
  } catch {
    return false;
  }
}
