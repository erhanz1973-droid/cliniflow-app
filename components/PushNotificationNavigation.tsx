import { usePushNotificationNavigation } from "../hooks/use-push-notification-navigation";

/** Wires notification tap + cold-start routing (offer chat, patient chat). */
export function PushNotificationNavigation() {
  usePushNotificationNavigation();
  return null;
}
