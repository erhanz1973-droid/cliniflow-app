import { safeGetItem, safeRemoveItem, safeSetItem } from "./asyncStorageSafe";

const KEY = "@cliniflow:selectedChatClinic";

export type SelectedClinic = {
  id: string;
  clinic_code?: string;
  name?: string;
};

export async function loadSelectedChatClinic(): Promise<SelectedClinic | null> {
  try {
    const raw = await safeGetItem(KEY);
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
  if (!c?.id?.trim()) {
    await safeRemoveItem(KEY);
    return;
  }
  await safeSetItem(
    KEY,
    JSON.stringify({
      id: String(c.id).trim(),
      clinic_code: c.clinic_code?.trim() || undefined,
      name: c.name || undefined,
    }),
  );
}
