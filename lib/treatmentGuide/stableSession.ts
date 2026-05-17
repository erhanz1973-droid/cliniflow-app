import AsyncStorage from "@react-native-async-storage/async-storage";
import { createAiCoordinatorSessionId } from "../aiCoordinator/leadData";

const PREFIX = "@cliniflow:tg-session:v1:";

export async function getStableTreatmentGuideSessionId(patientId: string): Promise<string> {
  const pid = String(patientId || "").trim();
  if (!pid) return createAiCoordinatorSessionId();
  const key = `${PREFIX}${pid}`;
  try {
    const existing = await AsyncStorage.getItem(key);
    if (existing?.trim()) return existing.trim();
    const created = createAiCoordinatorSessionId();
    await AsyncStorage.setItem(key, created);
    return created;
  } catch {
    return createAiCoordinatorSessionId();
  }
}
