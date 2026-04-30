import { safeGetItem, safeSetItem } from "./asyncStorageSafe";

/** User preference: in-app + server push sound for new chat messages (default on). */
export const MESSAGE_SOUND_PREF_KEY = "@cliniflow:message_sound_for_chat";

export async function getMessageSoundPreference(): Promise<boolean> {
  try {
    const v = await safeGetItem(MESSAGE_SOUND_PREF_KEY);
    if (v === null) return true;
    return v === "1" || v === "true";
  } catch {
    return true;
  }
}

export async function setMessageSoundPreference(enabled: boolean): Promise<void> {
  await safeSetItem(MESSAGE_SOUND_PREF_KEY, enabled ? "1" : "0");
}
