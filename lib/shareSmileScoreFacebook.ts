import { Platform, Share } from "react-native";
import { buildPositiveSmileShareText, SHARE_URL } from "./smileShareCard";
import { translateKey } from "./i18n";
import type { SmileScoreData } from "./smileScore";
import { isExpoGoRuntime, isMetaNativeSdkAvailable } from "./isExpoGo";

export type FacebookShareResult =
  | { ok: true; channel: "facebook" | "system" }
  | { ok: false; cancelled?: boolean; error?: string };

/** System share fallback for Expo Go (no Facebook reward). */
async function shareViaSystemSheet(data: SmileScoreData): Promise<FacebookShareResult> {
  const message = buildPositiveSmileShareText(data);
  const title = translateKey("smileShare.card.primary");
  try {
    const result = await Share.share(
      Platform.OS === "ios" ? { message, title, url: SHARE_URL } : { message },
    );
    if (result.action === Share.dismissedAction) {
      return { ok: false, cancelled: true };
    }
    return { ok: true, channel: "system" };
  } catch (e) {
    return { ok: false, error: String((e as Error)?.message || e) };
  }
}

/** Share via Facebook Share Dialog (production/dev build). Expo Go uses system share. */
export async function shareSmileScoreOnFacebook(data: SmileScoreData): Promise<FacebookShareResult> {
  if (Platform.OS === "web") {
    return { ok: false, error: "facebook_not_available" };
  }

  if (isExpoGoRuntime()) {
    return shareViaSystemSheet(data);
  }

  if (!isMetaNativeSdkAvailable()) {
    return { ok: false, error: "facebook_not_available" };
  }

  const quote = buildPositiveSmileShareText(data);
  const contentTitle = translateKey("smileShare.card.primary");

  try {
    const sdk = await import("react-native-fbsdk-next");
    if (!sdk?.ShareDialog?.canShow) {
      return shareViaSystemSheet(data);
    }
    const linkContent = {
      contentType: "link" as const,
      contentUrl: SHARE_URL,
      quote,
      contentDescription: quote,
      contentTitle,
    };
    const canShow = await sdk.ShareDialog.canShow(linkContent);
    if (!canShow) {
      return shareViaSystemSheet(data);
    }
    const result = await sdk.ShareDialog.show(linkContent);
    if (result.isCancelled) {
      return { ok: false, cancelled: true };
    }
    return { ok: true, channel: "facebook" };
  } catch (e) {
    if (__DEV__) console.warn("[shareSmileScoreFacebook]", (e as Error)?.message || e);
    return shareViaSystemSheet(data);
  }
}
