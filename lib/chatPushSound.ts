/**
 * Remote (OS) push sound + Android channel — must stay aligned with:
 * - app.json → expo-notifications plugin `sounds`
 * - registerExpoPush.ts → setNotificationChannelAsync
 * - Railway EXPO_PUSH_SOUND / EXPO_ANDROID_PUSH_CHANNEL_ID (defaults below)
 */
export const CHAT_PUSH_CHANNEL_ID = "chat_alerts";

/** Basename of a file listed in expo-notifications `sounds` (include extension). */
export const CHAT_PUSH_SOUND_FILE = "notification.wav";

/** Served from Railway `public/push-notification-logo.png` (see backend resolveChatPushNotificationImageUrl). */
export const CHAT_PUSH_LOGO_PATH = "/push-notification-logo.png";
