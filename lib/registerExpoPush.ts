import type { MutableRefObject } from "react";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { API_BASE } from "./api";
import { getMessageSoundPreference } from "./messageSoundPreference";
import { CHAT_PUSH_CHANNEL_ID, CHAT_PUSH_SOUND_FILE } from "./chatPushSound";

// Safe lazy import — expo-notifications crashes on Android Expo Go (SDK 53+).
// In Expo Go: Notifications stays null, all push functions are no-ops.
// In dev build / production: loaded normally.
const isExpoGo = Constants.appOwnership === "expo";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Notifications: any = null;

if (!isExpoGo) {
  try {
    Notifications = require("expo-notifications");
  } catch {
    /* dev build without native module — rare */
  }
}

let presentationHandlerInstalled = false;

/** Lazy — avoids blocking root layout import at cold start. */
export function ensureExpoPushPresentationSetup(): void {
  if (!Notifications || presentationHandlerInstalled) return;
  presentationHandlerInstalled = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
    if (__DEV__) {
      console.log("[push][PUSH_PRESENTATION] setNotificationHandler installed", {
        expoGo: isExpoGo,
        shouldPlaySound: true,
        shouldSetBadge: true,
      });
    }
  } catch {
    presentationHandlerInstalled = false;
  }
}

async function ensureAndroidChatChannel(): Promise<void> {
  if (!Notifications || Platform.OS !== "android") return;
  try {
    const channel = {
      name: "Messages",
      importance: Notifications.AndroidImportance.MAX,
      sound: CHAT_PUSH_SOUND_FILE,
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
      showBadge: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    };
    await Notifications.setNotificationChannelAsync(CHAT_PUSH_CHANNEL_ID, channel);
    await Notifications.setNotificationChannelAsync("default", {
      ...channel,
      name: "default",
    });
    if (__DEV__) {
      console.log("[push][PUSH_PRESENTATION] android_channels", {
        chat: CHAT_PUSH_CHANNEL_ID,
        sound: CHAT_PUSH_SOUND_FILE,
      });
    }
  } catch {
    /* non-fatal */
  }
}

/** Register Expo push token with Railway backend + current sound preference. */
export async function registerExpoPushForSession(opts: {
  role: "patient" | "doctor";
  authToken: string;
  signal?: AbortSignal;
  authSessionEpochAtStart?: number;
  authSessionEpochRef?: MutableRefObject<number>;
}): Promise<void> {
  ensureExpoPushPresentationSetup();
  if (!opts.authToken?.trim()) return;
  const sig = opts.signal;
  const stale = (): boolean =>
    opts.authSessionEpochRef != null &&
    opts.authSessionEpochAtStart != null &&
    opts.authSessionEpochRef.current !== opts.authSessionEpochAtStart;

  if (sig?.aborted) return;
  if (stale()) return;
  if (!Notifications) {
    if (__DEV__) console.log("[push] ⛔ Push disabled (Expo Go)");
    return;
  }

  await ensureAndroidChatChannel();
  if (sig?.aborted || stale()) return;

  const permBefore = await Notifications.getPermissionsAsync();
  if (__DEV__) {
    console.log("[push][PUSH_PRESENTATION] getPermissionsAsync (before request)", permBefore);
  }
  if (sig?.aborted || stale()) return;
  let finalStatus = permBefore.status;
  if (finalStatus !== "granted") {
    const req = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    finalStatus = req.status;
    if (__DEV__) {
      console.log("[push][PUSH_PRESENTATION] requestPermissionsAsync result", req);
    }
  }
  if (sig?.aborted || stale()) return;
  if (finalStatus !== "granted") {
    if (__DEV__) {
      console.warn("[push][PUSH_PRESENTATION] notifications not granted; skip token", { finalStatus });
    }
    return;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
  let expoToken: string | null = null;
  try {
    const tk = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    expoToken = tk.data ?? null;
  } catch {
    return;
  }

  if (sig?.aborted || stale()) return;

  const tokenStr = typeof expoToken === "string" ? expoToken.trim() : "";
  if (!tokenStr.startsWith("ExponentPushToken[")) return;

  const messageSound = await getMessageSoundPreference();
  if (sig?.aborted || stale()) return;

  const expoExperienceId = String(Constants.expoConfig?.originalFullName ?? "").trim();

  try {
    const path =
      opts.role === "patient"
        ? "/api/patient/me/expo-push-token"
        : "/api/doctor/me/expo-push-token";
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.authToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expoPushToken: tokenStr,
        token: tokenStr,
        messageSound,
        platform: Platform.OS,
        ...(expoExperienceId ? { expoExperienceId } : {}),
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      console.warn("[push] expo register failed", res.status, (j as { error?: string })?.error);
    }
  } catch (e) {
    console.warn("[push] expo register:", (e as Error)?.message || e);
  }
}

export async function syncNotificationSoundToServer(opts: {
  role: "patient" | "doctor";
  authToken: string;
  messageSound: boolean;
}): Promise<void> {
  if (!opts.authToken?.trim()) return;
  const path =
    opts.role === "patient"
      ? "/api/patient/me/notification-preferences"
      : "/api/doctor/me/notification-preferences";
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${opts.authToken}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messageSound: opts.messageSound }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      console.warn("[push] sound pref failed", res.status, (j as { error?: string })?.error);
    }
  } catch (e) {
    console.warn("[push] sound pref:", (e as Error)?.message || e);
  }
}
