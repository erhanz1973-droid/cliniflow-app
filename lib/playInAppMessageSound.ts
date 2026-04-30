import { Audio } from "expo-av";

const NOTIFICATION_MP3 = require("../assets/audio/notification.mp3");

/** Short local tone when the app is open and a new chat message arrives (use with debouncing). */
export async function playInAppNewMessageSound(): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });
    const { sound } = await Audio.Sound.createAsync(NOTIFICATION_MP3, {
      shouldPlay: true,
      volume: 0.78,
      isLooping: false,
    });
    sound.setOnPlaybackStatusUpdate((st: { didJustFinish?: boolean }) => {
      if (st?.didJustFinish) sound.unloadAsync().catch(() => {});
    });
  } catch {
    /* optional: haptics can be added by caller */
  }
}

const lastToneAtByThread = new Map<string, number>();

/** When a remote push for chat arrived recently, skip in-app sound to avoid duplicate ding (foreground handler + poll). */
let lastForegroundRemotePushAtMs = 0;
const REMOTE_PUSH_SUPPRESS_IN_APP_MS = 4500;

export function recordForegroundRemoteChatPushPlayback(): void {
  lastForegroundRemotePushAtMs = Date.now();
}

/** Per-thread debounce (e.g. patientId:clinicId for patient, doc:patientId for doctor chat). */
export function playInAppNewMessageSoundDebouncedForThread(
  threadKey: string | undefined | null,
  debounceMs = 3000,
): void {
  const key = String(threadKey ?? "__default__").trim() || "__default__";
  const now = Date.now();
  if (now - lastForegroundRemotePushAtMs < REMOTE_PUSH_SUPPRESS_IN_APP_MS) return;
  const prev = lastToneAtByThread.get(key) ?? 0;
  if (now - prev < debounceMs) return;
  lastToneAtByThread.set(key, now);
  void playInAppNewMessageSound();
}

/**
 * @deprecated Prefer playInAppNewMessageSoundDebouncedForThread with a stable thread key so
 * multiple chats do not steal each other's cooldown.
 */
export function playInAppNewMessageSoundDebounced(debounceMs = 3000): void {
  playInAppNewMessageSoundDebouncedForThread("__global__", debounceMs);
}
