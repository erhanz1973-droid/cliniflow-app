import { markPatientClinicMessagesRead } from "./markChatRead";

/** Clears icon badge locally; uses dynamic import so route screens do not eagerly load expo-notifications. */
export async function resetAppIconBadgeCount(): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.setBadgeCountAsync(0);
  } catch {
    /* ignore */
  }
}

/** Resets server-side chat unread tally + read_at; call when user opens clinic messages. */
export async function postPatientChatAckOpen(token: string | undefined): Promise<void> {
  await markPatientClinicMessagesRead(token);
}

/** @deprecated Prefer markDoctorPatientMessagesRead per patient thread. */
export async function postDoctorChatAckOpen(_token: string | undefined): Promise<void> {
  /* no-op: global ack-open zeros all threads; use /api/doctor/patient/:id/messages/read instead */
}
