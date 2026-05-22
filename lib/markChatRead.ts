import { API_BASE } from "./api";
import { invalidateDoctorMessagingCache } from "./doctorMessaging";
import {
  invalidatePatientInboxUnreadCache,
  schedulePatientInboxSummaryRefresh,
} from "./patientInboxUnread";

/** Patient clinic thread — stamps read_at + zeros push tally. */
export async function markPatientClinicMessagesRead(token: string | undefined): Promise<void> {
  if (!token?.trim()) return;
  try {
    const res = await fetch(`${API_BASE}/api/patient/me/messages/read`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    if (!res.ok) await res.text().catch(() => "");
    invalidatePatientInboxUnreadCache();
    schedulePatientInboxSummaryRefresh(token);
  } catch {
    /* ignore */
  }
}

/** Doctor opened a patient chat — stamps that patient's inbound rows read; refreshes badge totals. */
export async function markDoctorPatientMessagesRead(
  token: string | undefined,
  patientId: string | undefined,
): Promise<void> {
  const t = String(token || "").trim();
  const pid = String(patientId || "").trim();
  if (!t || !pid) return;
  try {
    const res = await fetch(
      `${API_BASE}/api/doctor/patient/${encodeURIComponent(pid)}/messages/read`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${t}`, Accept: "application/json" },
      },
    );
    if (!res.ok) await res.text().catch(() => "");
    invalidateDoctorMessagingCache();
  } catch {
    /* ignore */
  }
}
