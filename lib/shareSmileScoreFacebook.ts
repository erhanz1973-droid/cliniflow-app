import { Platform, Share } from "react-native";
import * as Sharing from "expo-sharing";
import { buildPositiveSmileShareText, SHARE_URL } from "./smileShareCard";
import { translateKey } from "./i18n";
import type { SmileScoreData } from "./smileScore";
import { isExpoGoRuntime, isMetaNativeSdkAvailable } from "./isExpoGo";

export type FacebookShareResult =
  | { ok: true; channel: "facebook" | "system" }
  | { ok: false; cancelled?: boolean; error?: string };

function normalizeShareImageUri(uri: string | null | undefined): string | null {
  const raw = String(uri || "").trim();
  if (!raw) return null;
  if (Platform.OS === "android" && !raw.startsWith("file://")) {
    return `file://${raw}`;
  }
  return raw;
}

/** System share with score text (fallback when no image). */
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

/** Share rendered score card image via system sheet (Expo Go / fallback). */
async function shareImageViaSystemSheet(
  imageUri: string,
  data: SmileScoreData,
): Promise<FacebookShareResult> {
  const normalized = normalizeShareImageUri(imageUri);
  if (!normalized) return shareViaSystemSheet(data);

  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(normalized, {
        mimeType: "image/png",
        dialogTitle: translateKey("smileShare.card.primary"),
        UTI: "public.png",
      });
      return { ok: true, channel: "system" };
    }
  } catch (e) {
    if (__DEV__) console.warn("[shareSmileScoreFacebook] image system share:", (e as Error)?.message || e);
  }
  return shareViaSystemSheet(data);
}

async function sharePhotoOnFacebook(imageUri: string): Promise<FacebookShareResult | null> {
  const normalized = normalizeShareImageUri(imageUri);
  if (!normalized) return null;

  const sdk = await import("react-native-fbsdk-next");
  if (!sdk?.ShareDialog?.canShow) return null;

  const photoContent = {
    contentType: "photo" as const,
    contentUrl: SHARE_URL,
    photos: [{ imageUrl: normalized, userGenerated: true }],
    commonParameters: {
      hashtag: "#Clinifly",
    },
  };

  const canShow = await sdk.ShareDialog.canShow(photoContent);
  if (!canShow) return null;

  const result = await sdk.ShareDialog.show(photoContent);
  if (result.isCancelled) {
    return { ok: false, cancelled: true };
  }
  return { ok: true, channel: "facebook" };
}

async function shareLinkOnFacebook(data: SmileScoreData): Promise<FacebookShareResult | null> {
  const sdk = await import("react-native-fbsdk-next");
  if (!sdk?.ShareDialog?.canShow) return null;

  const quote = buildPositiveSmileShareText(data);
  const linkContent = {
    contentType: "link" as const,
    contentUrl: SHARE_URL,
    quote,
    contentDescription: quote,
    contentTitle: translateKey("smileShare.card.primary"),
  };

  const canShow = await sdk.ShareDialog.canShow(linkContent);
  if (!canShow) return null;

  const result = await sdk.ShareDialog.show(linkContent);
  if (result.isCancelled) {
    return { ok: false, cancelled: true };
  }
  return { ok: true, channel: "facebook" };
}

export type ShareSmileScoreFacebookOptions = {
  /** PNG of SmileShareCardPreview — score visible in the post image. */
  imageUri?: string | null;
};

/**
 * Share smile score on Facebook.
 * Prefers photo share (score on card image); link-only share omits score on mobile Facebook.
 */
export async function shareSmileScoreOnFacebook(
  data: SmileScoreData,
  opts: ShareSmileScoreFacebookOptions = {},
): Promise<FacebookShareResult> {
  if (Platform.OS === "web") {
    return { ok: false, error: "facebook_not_available" };
  }

  const imageUri = normalizeShareImageUri(opts.imageUri);

  if (isExpoGoRuntime()) {
    if (imageUri) return shareImageViaSystemSheet(imageUri, data);
    return shareViaSystemSheet(data);
  }

  if (!isMetaNativeSdkAvailable()) {
    if (imageUri) return shareImageViaSystemSheet(imageUri, data);
    return { ok: false, error: "facebook_not_available" };
  }

  try {
    if (imageUri) {
      const photoResult = await sharePhotoOnFacebook(imageUri);
      if (photoResult) return photoResult;
      return shareImageViaSystemSheet(imageUri, data);
    }

    const linkResult = await shareLinkOnFacebook(data);
    if (linkResult) return linkResult;
    return shareViaSystemSheet(data);
  } catch (e) {
    if (__DEV__) console.warn("[shareSmileScoreFacebook]", (e as Error)?.message || e);
    if (imageUri) return shareImageViaSystemSheet(imageUri, data);
    return shareViaSystemSheet(data);
  }
}
