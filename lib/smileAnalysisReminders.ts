import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { translateKey } from "./i18n";

const LAST_ANALYSIS_KEY = "@cliniflow:smile-last-analysis:v1:";
const REMINDER_IDS_KEY = "@cliniflow:smile-reminder-ids:v1:";

const REMINDER_SCHEDULE_DAYS = [7, 14, 30] as const;

function lastKey(patientId: string): string {
  return `${LAST_ANALYSIS_KEY}${patientId}`;
}

function idsKey(patientId: string): string {
  return `${REMINDER_IDS_KEY}${patientId}`;
}

export async function getLastSmileAnalysisAt(patientId: string): Promise<number | null> {
  const pid = String(patientId || "").trim();
  if (!pid) return null;
  try {
    const raw = await AsyncStorage.getItem(lastKey(pid));
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

async function cancelScheduledReminders(patientId: string): Promise<void> {
  const pid = String(patientId || "").trim();
  if (!pid) return;
  try {
    const raw = await AsyncStorage.getItem(idsKey(pid));
    const ids: string[] = raw ? JSON.parse(raw) : [];
    await Promise.all(
      ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => null)),
    );
    await AsyncStorage.removeItem(idsKey(pid));
  } catch {
    /* non-fatal */
  }
}

type ReminderCopy = { title: string; body: string };

const REMINDER_COPY: Record<(typeof REMINDER_SCHEDULE_DAYS)[number], ReminderCopy> = {
  7: {
    title: "Smile check-in",
    body: "Ready for a new smile analysis?",
  },
  14: {
    title: "Compare your smile",
    body: "Upload a new photo and compare your score.",
  },
  30: {
    title: "Smile progress",
    body: "See how your smile has changed.",
  },
};

/**
 * Best-effort local notifications after each analysis (requires notification permission).
 */
export async function scheduleSmileAnalysisReminders(
  patientId: string,
  analyzedAt = Date.now(),
): Promise<void> {
  const pid = String(patientId || "").trim();
  if (!pid) return;

  await AsyncStorage.setItem(lastKey(pid), String(analyzedAt));
  await cancelScheduledReminders(pid);

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    const newIds: string[] = [];
    for (const days of REMINDER_SCHEDULE_DAYS) {
      const copy = reminderCopy(days);
      const triggerDate = new Date(analyzedAt + days * 24 * 60 * 60 * 1000);
      if (triggerDate.getTime() <= Date.now()) continue;
      const seconds = Math.max(60, Math.floor((triggerDate.getTime() - Date.now()) / 1000));
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: copy.title,
          body: copy.body,
          data: { type: "smile_analysis_reminder", patientId: pid },
        },
        trigger: { seconds },
      });
      newIds.push(id);
    }
    if (newIds.length) {
      await AsyncStorage.setItem(idsKey(pid), JSON.stringify(newIds));
    }
  } catch {
    /* non-fatal — permission or simulator */
  }
}

export async function onSmileAnalysisRecorded(
  patientId: string,
  analyzedAt = Date.now(),
): Promise<void> {
  await scheduleSmileAnalysisReminders(patientId, analyzedAt);
}
