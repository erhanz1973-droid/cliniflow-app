import { Platform } from "react-native";
import { buildPositiveSmileShareText, SHARE_URL } from "./smileShareCard";
import { translateKey } from "./i18n";
import type { SmileScoreData } from "./smileScore";

export type FacebookShareResult =
  | { ok: true; channel: "facebook" }
  | { ok: false; cancelled?: boolean; error?: string };

/** Share via Facebook Share Dialog (required for share reward v1). */
export async function shareSmileScoreOnFacebook(data: SmileScoreData): Promise<FacebookShareResult> {
  if (Platform.OS === "web") {
    return { ok: false, error: "facebook_not_available" };
  }

  const quote = buildPositiveSmileShareText(data);
  const contentTitle = translateKey("smileShare.card.primary");

  try {
    const sdk = await import("react-native-fbsdk-next");
    const linkContent = {
      contentType: "link" as const,
      contentUrl: SHARE_URL,
      quote,
      contentDescription: quote,
      contentTitle,
    };
    const canShow = await sdk.ShareDialog.canShow(linkContent);
    if (!canShow) {
      return { ok: false, error: "facebook_not_available" };
    }
    const result = await sdk.ShareDialog.show(linkContent);
    if (result.isCancelled) {
      return { ok: false, cancelled: true };
    }
    return { ok: true, channel: "facebook" };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}
