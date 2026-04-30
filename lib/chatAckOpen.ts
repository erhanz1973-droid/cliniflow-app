import { API_BASE } from "./api";

/** Clears icon badge locally; uses dynamic import so route screens do not eagerly load expo-notifications. */
export async function resetAppIconBadgeCount(): Promise<void> {
  try {
    const Notifications = await import("expo-notifications");
    await Notifications.setBadgeCountAsync(0);
  } catch {
    /* ignore */
  }
}

/** Resets server-side chat unread tally for push badge; call when user opens chat. */
export async function postPatientChatAckOpen(token: string | undefined): Promise<void> {
  if (!token?.trim()) return;
  try {
    const res = await fetch(`${API_BASE}/api/patient/me/chat/ack-open`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      await res.text().catch(() => "");
    }
  } catch {
    /* ignore */
  }
}

export async function postDoctorChatAckOpen(token: string | undefined): Promise<void> {
  if (!token?.trim()) return;
  try {
    const res = await fetch(`${API_BASE}/api/doctor/me/chat/ack-open`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) {
      await res.text().catch(() => "");
    }
  } catch {
    /* ignore */
  }
}
