import { Platform, type View } from "react-native";
import type { RefObject } from "react";
import { captureRef } from "react-native-view-shot";

/** Capture the on-screen share card (includes score text) as a PNG for Facebook photo share. */
export async function captureSmileShareCardImage(
  ref: RefObject<View | null>,
): Promise<string | null> {
  if (!ref.current) return null;
  try {
    const uri = await captureRef(ref, {
      format: "png",
      quality: 1,
      result: "tmpfile",
    });
    const raw = String(uri || "").trim();
    if (!raw) return null;
    if (Platform.OS === "android" && !raw.startsWith("file://")) {
      return `file://${raw}`;
    }
    return raw;
  } catch (e) {
    if (__DEV__) console.warn("[captureSmileShareCard]", (e as Error)?.message || e);
    return null;
  }
}
