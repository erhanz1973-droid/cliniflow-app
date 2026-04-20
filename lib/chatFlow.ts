import type { Router } from "expo-router";
import * as ImagePicker from "expo-image-picker";

export type GoToChatParams = {
  clinicId: string;
  clinicCode?: string;
  /** Optional: seed composer when screen opens */
  prefillText?: string;
};

/**
 * Open patient ↔ clinic thread. clinicId is required (WhatsApp-style: one chat per clinic).
 */
export function goToChat(router: Pick<Router, "push">, params: GoToChatParams) {
  const clinicId = String(params.clinicId || "").trim();
  if (!clinicId) {
    console.warn("[goToChat] clinicId is required");
    return;
  }
  const code = params.clinicCode?.trim();
  router.push({
    pathname: "/(patient)/messages",
    params: {
      clinicId,
      ...(code ? { clinicCode: code } : {}),
      ...(params.prefillText?.trim()
        ? { prefillComposer: "1", prefillText: params.prefillText.trim() }
        : {}),
    },
  } as any);
}

export type PickedImage = { uri: string; mimeType: string; name: string };

/**
 * Attachment picker for images (gallery).
 */
export async function openFilePicker(opts: {
  type: "image";
}): Promise<PickedImage | null> {
  if (opts.type !== "image") return null;
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  return {
    uri: a.uri,
    mimeType: a.mimeType || "image/jpeg",
    name: a.fileName || `image_${Date.now()}.jpg`,
  };
}
