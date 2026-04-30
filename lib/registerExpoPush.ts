import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { API_BASE } from "./api";
import { getMessageSoundPreference } from "./messageSoundPreference";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

async function ensureAndroidChatChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("chat", {
      name: "Chat",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
    });
  } catch {
    /* non-fatal */
  }
}

/** Register Expo push token with Railway backend + current sound preference (Expo payloads use sound: default). */
export async function registerExpoPushForSession(opts: {
  role: "patient" | "doctor";
  authToken: string;
}): Promise<void> {
  if (!opts.authToken?.trim()) return;

  await ensureAndroidChatChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    finalStatus = req.status;
  }
  if (finalStatus !== "granted") return;


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

  const tokenStr = typeof expoToken === "string" ? expoToken.trim() : "";
  if (!tokenStr.startsWith("ExponentPushToken[")) return;

  const messageSound = await getMessageSoundPreference();

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
