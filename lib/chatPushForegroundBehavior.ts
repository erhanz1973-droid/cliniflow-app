/**
 * Foreground chat push: no notification sound (see setNotificationHandler in registerExpoPush),
 * vibrate + badge update instead. Background/killed: sound + badge from Expo payload.
 * expo-notifications is loaded only when installForegroundChatNotificationEffects runs (_layout).
 */
import { Vibration } from "react-native";
import { recordForegroundRemoteChatPushPlayback } from "./playInAppMessageSound";

export type ChatNotifViewer = {
  type?: string;
  patientId?: string;
  doctorId?: string;
} | null;

const FG_VIBRATE_MS = 200;
const FG_VIBRATE_DEBOUNCE_MS = 3000;

let lastForegroundChatVibrateAt = 0;

function isComposerSelfEcho(data: Record<string, unknown> | undefined, viewer: ChatNotifViewer): boolean {
  if (!data || data.type !== "chat_message") return false;
  const role = String((data.messageComposerRole as string) || "").toLowerCase();
  const composerId = String((data.messageComposerId as string) || "").trim();
  if (!composerId || !role) return false;
  const vt = String(viewer?.type || "").toLowerCase();
  if (vt === "patient") {
    return role === "patient" && composerId === String(viewer?.patientId || "").trim();
  }
  if (vt === "doctor") {
    return role === "doctor" && composerId === String(viewer?.doctorId || "").trim();
  }
  return false;
}

type ExpoNotifications = typeof import("expo-notifications");

async function applyBadgeFromPayload(
  Notifications: ExpoNotifications,
  content: { badge?: unknown },
  data: Record<string, unknown> | undefined,
): Promise<void> {
  const badgeRaw =
    content.badge != null
      ? content.badge
      : data?.unreadBadge != null
        ? data.unreadBadge
        : undefined;
  if (badgeRaw === undefined || badgeRaw === null) return;
  const n = typeof badgeRaw === "number" ? badgeRaw : Number(badgeRaw);
  if (!Number.isFinite(n)) return;
  try {
    await Notifications.setBadgeCountAsync(Math.min(999999, Math.max(0, Math.floor(n))));
  } catch {
    /* ignore */
  }
}

/** Listener while app is foreground: debounced vibration + badge; skips self-sent composer echoes. */
export function installForegroundChatNotificationEffects(getViewer: () => ChatNotifViewer): () => void {
  let cancelled = false;
  let unsub: (() => void) | undefined;
  void import("expo-notifications").then((Notifications) => {
    if (cancelled) return;
    const sub = Notifications.addNotificationReceivedListener((event) => {
      void (async () => {
        const data = event.request.content.data as Record<string, unknown> | undefined;
        if (data?.type !== "chat_message") return;

        const viewer = getViewer();
        const vt = String(viewer?.type || "").toLowerCase();
        if (vt !== "patient" && vt !== "doctor") {
          /* Logged out or unknown viewer — avoid TurboModule calls (badge/vibrate). */
          return;
        }

        recordForegroundRemoteChatPushPlayback();

        await applyBadgeFromPayload(Notifications, event.request.content, data);

        if (isComposerSelfEcho(data, viewer)) return;

        const now = Date.now();
        if (now - lastForegroundChatVibrateAt < FG_VIBRATE_DEBOUNCE_MS) return;
        lastForegroundChatVibrateAt = now;
        try {
          Vibration.vibrate(FG_VIBRATE_MS);
        } catch {
          /* native vibrate unavailable */
        }
      })();
    });
    unsub = () => sub.remove();
  });
  return () => {
    cancelled = true;
    unsub?.();
  };
}
