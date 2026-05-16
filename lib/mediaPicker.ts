import { Alert, Linking, Platform } from "react-native";
import * as ImagePicker from "expo-image-picker";

/** Android 13+: system photo picker (no READ_MEDIA_* / legacy storage). */
export const PLAY_STORE_IMAGE_LIBRARY_OPTIONS: ImagePicker.ImagePickerOptions = {
  legacy: false,
  mediaTypes: ["images"],
};

type AccessMessages = {
  deniedTitle?: string;
  deniedMessage?: string;
  settingsLabel?: string;
};

/**
 * iOS still needs NSPhotoLibraryUsageDescription. Android uses the system picker only.
 */
export async function ensureMediaLibraryAccessForPicker(
  messages: AccessMessages = {},
): Promise<boolean> {
  if (Platform.OS === "android") {
    return true;
  }

  const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status === "granted") {
    return true;
  }

  Alert.alert(
    messages.deniedTitle ?? "Permission required",
    messages.deniedMessage ??
      "Photo library access is required. You can enable it in Settings.",
    [
      { text: "Cancel", style: "cancel" },
      ...(canAskAgain !== false
        ? [{ text: "Try again", onPress: () => ensureMediaLibraryAccessForPicker(messages) }]
        : []),
      {
        text: messages.settingsLabel ?? "Settings",
        onPress: () => Linking.openSettings(),
      },
    ],
  );
  return false;
}

export async function launchImageLibraryPlayStoreSafe(
  options?: ImagePicker.ImagePickerOptions,
): Promise<ImagePicker.ImagePickerResult> {
  return ImagePicker.launchImageLibraryAsync({
    ...PLAY_STORE_IMAGE_LIBRARY_OPTIONS,
    ...options,
    legacy: false,
  });
}

export async function ensureCameraAccess(messages: AccessMessages = {}): Promise<boolean> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status === "granted") {
    return true;
  }
  Alert.alert(
    messages.deniedTitle ?? "Permission required",
    messages.deniedMessage ?? "Camera access is required.",
    [
      { text: "Cancel", style: "cancel" },
      { text: messages.settingsLabel ?? "Settings", onPress: () => Linking.openSettings() },
    ],
  );
  return false;
}
