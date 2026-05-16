import AsyncStorage from "@react-native-async-storage/async-storage";
import { recordCacheMetric } from "./cacheMetrics";
import { peekCachedResource, setCachedResource } from "./resourceCache";

export type DoctorChatMessage = {
  id: string;
  text: string;
  from: "PATIENT" | "CLINIC" | "DOCTOR" | string;
  createdAt: number;
  senderName?: string;
  pending?: boolean;
  thread_id?: string;
};

export type DoctorPatientChatSnapshot = {
  messages: DoctorChatMessage[];
  leadThreadId: string | null;
  enrolledSharedCare: boolean;
};

const CACHE_PREFIX = "doctor:patient-chat:";
const DISK_PREFIX = "doctor.patient-chat.v1.";

export function doctorPatientChatCacheKey(patientId: string): string {
  return `${CACHE_PREFIX}${String(patientId || "").trim()}`;
}

function diskKey(patientId: string): string {
  return `${DISK_PREFIX}${String(patientId || "").trim()}`;
}

export function peekPatientChatCache(patientId: string): DoctorPatientChatSnapshot | null {
  return peekCachedResource<DoctorPatientChatSnapshot>(doctorPatientChatCacheKey(patientId));
}

export function persistPatientChatCache(
  patientId: string,
  snapshot: DoctorPatientChatSnapshot
): void {
  const key = doctorPatientChatCacheKey(patientId);
  setCachedResource(key, snapshot);
  const dk = diskKey(patientId);
  void AsyncStorage.setItem(dk, JSON.stringify(snapshot)).catch(() => {});
}

const diskHydratedPatients = new Set<string>();

/** Restore from disk into memory on cold start (async). */
export async function hydratePatientChatFromDisk(
  patientId: string
): Promise<DoctorPatientChatSnapshot | null> {
  const pid = String(patientId || "").trim();
  if (!pid) return null;
  if (peekCachedResource<DoctorPatientChatSnapshot>(doctorPatientChatCacheKey(pid))) {
    return peekPatientChatCache(pid);
  }
  if (diskHydratedPatients.has(pid)) return null;
  try {
    const raw = await AsyncStorage.getItem(diskKey(pid));
    diskHydratedPatients.add(pid);
    if (!raw) {
      recordCacheMetric("patient_chat_cache_miss", { patientId: pid.slice(0, 8), source: "disk" });
      return null;
    }
    const parsed = JSON.parse(raw) as DoctorPatientChatSnapshot;
    if (!parsed || !Array.isArray(parsed.messages)) return null;
    setCachedResource(doctorPatientChatCacheKey(pid), parsed);
    recordCacheMetric("patient_chat_cache_hit", { patientId: pid.slice(0, 8), source: "disk" });
    return parsed;
  } catch {
    return null;
  }
}

export function mapApiMessages(raw: unknown[]): DoctorChatMessage[] {
  const mapped = raw.map((row: unknown) => {
    const m = row as Record<string, unknown>;
    const threadIdRaw = m.thread_id ?? m.threadId;
    const thread_id =
      threadIdRaw != null && String(threadIdRaw).trim() !== ""
        ? String(threadIdRaw).trim()
        : undefined;
    return {
      id: String(m.id || m.createdAt || Math.random()),
      text: String(m.text || m.content || m.message || ""),
      from: String(m.from || m.senderRole || "CLINIC"),
      createdAt:
        m.createdAt || m.created_at
          ? new Date(String(m.createdAt || m.created_at)).getTime()
          : Date.now(),
      senderName:
        m.senderName != null
          ? String(m.senderName)
          : m.sender_name != null
            ? String(m.sender_name)
            : undefined,
      ...(thread_id ? { thread_id } : {}),
    };
  });
  return [...mapped].sort((a, b) => a.createdAt - b.createdAt).slice(-250);
}

export function parseLeadAssignment(json: Record<string, unknown>): {
  leadThreadId: string | null;
  enrolledSharedCare: boolean;
} {
  const laRaw = json.leadAssignment;
  const tid =
    laRaw && typeof laRaw === "object" && (laRaw as { threadId?: string }).threadId != null
      ? String((laRaw as { threadId?: string }).threadId).trim()
      : "";
  const laThreadIsLead =
    laRaw && typeof laRaw === "object"
      ? (laRaw as { threadIsLead?: boolean }).threadIsLead
      : undefined;
  return {
    leadThreadId: tid || null,
    enrolledSharedCare: laThreadIsLead === false,
  };
}
