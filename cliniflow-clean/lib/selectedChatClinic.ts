import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "@cliniflow:selectedChatClinic";

export type SelectedClinic = {
  id: string;
  clinic_code?: string;
  name?: string;
};

export async function loadSelectedChatClinic(): Promise<SelectedClinic | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as Record<string, unknown>;
    const id = j?.id != null ? String(j.id).trim() : "";
    if (!id) return null;
    return {
      id,
      clinic_code: j.clinic_code != null ? String(j.clinic_code).trim() : undefined,
      name: j.name != null ? String(j.name) : undefined,
    };
  } catch {
    return null;
  }
}

export async function saveSelectedChatClinic(c: SelectedClinic | null): Promise<void> {
  try {
    if (!c?.id?.trim()) {
      await AsyncStorage.removeItem(KEY);
      return;
    }
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        id: String(c.id).trim(),
        clinic_code: c.clinic_code?.trim() || undefined,
        name: c.name || undefined,
      })
    );
  } catch {
    // ignore
  }
}
