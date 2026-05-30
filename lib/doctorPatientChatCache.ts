import AsyncStorage from "@react-native-async-storage/async-storage";
import { recordCacheMetric } from "./cacheMetrics";
import { peekCachedResource, setCachedResource } from "./resourceCache";

export type DoctorChatMessage = {
  id: string;
  text: string;
  from: "PATIENT" | "CLINIC" | "DOCTOR" | string;
  createdAt: number;
  senderName?: string;
  inboundKind?: string;
  pending?: boolean;
  thread_id?: string;
};

export type DoctorPatientChatSnapshot = {
  messages: DoctorChatMessage[];
  leadThreadId: string | null;
  enrolledSharedCare: boolean;
};

const CACHE_PREFIX = "doctor:patient-chat:";
const DISK_PREFIX = "doctor.patient-chat.v4.";

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

function displayTextFromApiMessage(m: Record<string, unknown>): string {
  const direct = String(m.text || m.content || m.message || m.message_text || "").trim();
  if (direct) return direct;
  const att = m.attachment ?? m.attachments;
  if (att && typeof att === "object") {
    const blob = att as Record<string, unknown>;
    const ai = (blob.aiResult ?? blob.ai_result) as Record<string, unknown> | undefined;
    if (ai && typeof ai === "object") {
      for (const key of ["summary", "reply", "text", "message", "analysis"]) {
        const v = ai[key];
        if (v != null && String(v).trim()) return String(v).trim();
      }
    }
    for (const key of ["text", "message", "body", "caption"]) {
      const v = blob[key];
      if (v != null && String(v).trim()) return String(v).trim();
    }
  }
  if (String(m.type || "").toLowerCase() === "ai_result") return "AI analiz sonucu";
  return "";
}

function parseMessageCreatedAtMs(raw: unknown): number {
  if (raw == null) return Date.now();
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw > 1e15) return Math.floor(raw / 1000);
    if (raw > 0 && raw < 1e11) return Math.floor(raw * 1000);
    return raw;
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return Date.now();
    const asNum = Number(s);
    if (Number.isFinite(asNum) && /^\d+(\.\d+)?$/.test(s)) {
      if (asNum > 1e15) return Math.floor(asNum / 1000);
      if (asNum > 0 && asNum < 1e11) return Math.floor(asNum * 1000);
      return asNum;
    }
    const t = Date.parse(s);
    return Number.isFinite(t) ? t : Date.now();
  }
  return Date.now();
}

function resolveApiMessageFrom(m: Record<string, unknown>): "PATIENT" | "CLINIC" {
  const direct = String(m.from || "").toUpperCase();
  if (direct === "PATIENT" || direct === "USER") return "PATIENT";
  const role = String(
    m.senderRole || m.sender_role || m.sender_type || m.senderType || "",
  ).toLowerCase();
  if (role === "patient" || role === "user" || role === "lead") return "PATIENT";
  if (m.from_patient === true) return "PATIENT";
  const inboundKind = String(m.inboundKind || m.inbound_kind || "").toLowerCase();
  if (inboundKind === "patient") return "PATIENT";
  return "CLINIC";
}

export function mapApiMessages(raw: unknown[]): DoctorChatMessage[] {
  const mapped = raw.map((row: unknown) => {
    const m = row as Record<string, unknown>;
    const threadIdRaw = m.thread_id ?? m.threadId;
    const thread_id =
      threadIdRaw != null && String(threadIdRaw).trim() !== ""
        ? String(threadIdRaw).trim()
        : undefined;
    const text = displayTextFromApiMessage(m);
    const from = resolveApiMessageFrom(m);
    const inboundKindRaw = String(m.inboundKind || m.inbound_kind || "").trim().toLowerCase();
    const senderName =
      m.senderName != null
        ? String(m.senderName)
        : m.sender_name != null
          ? String(m.sender_name)
          : undefined;
    return {
      id: String(m.id || m.message_id || Math.random()),
      text: text || (m.attachment || m.attachments ? "📎 Ek" : ""),
      from,
      createdAt: parseMessageCreatedAtMs(m.createdAt ?? m.created_at),
      ...(senderName ? { senderName } : {}),
      ...(inboundKindRaw ? { inboundKind: inboundKindRaw } : {}),
      ...(thread_id ? { thread_id } : {}),
    };
  });
  const sorted = [...mapped].sort((a, b) => a.createdAt - b.createdAt);
  const byId = new Map<string, DoctorChatMessage>();
  for (const m of sorted) {
    const id = String(m.id || "").trim();
    if (!id) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, m);
      continue;
    }
    if (m.from === "PATIENT" && existing.from !== "PATIENT") {
      byId.set(id, m);
      continue;
    }
    if (existing.from === "PATIENT") continue;
    if (m.inboundKind === "doctor" && existing.inboundKind !== "doctor") {
      byId.set(id, m);
      continue;
    }
    if (existing.inboundKind === "doctor") continue;
    if ((m.text?.length || 0) >= (existing.text?.length || 0)) byId.set(id, m);
  }
  return [...byId.values()].slice(-250);
}

export function parseLeadAssignment(json: Record<string, unknown>): {
  leadThreadId: string | null;
  enrolledSharedCare: boolean;
} {
  const laRaw = json.leadAssignment;
  const accessTid = String(json.accessThreadId || json.access_thread_id || "").trim();
  const fromLa =
    laRaw && typeof laRaw === "object" && (laRaw as { threadId?: string }).threadId != null
      ? String((laRaw as { threadId?: string }).threadId).trim()
      : "";
  const tid = fromLa || accessTid;
  const laThreadIsLead =
    laRaw && typeof laRaw === "object"
      ? (laRaw as { threadIsLead?: boolean }).threadIsLead
      : undefined;
  return {
    leadThreadId: tid || null,
    enrolledSharedCare: laThreadIsLead === false,
  };
}

/** Decode JWT payload for diagnostic logs only — not verified. */
export function decodeJwtPayloadForDebug(token: string): Record<string, unknown> | null {
  try {
    const part = String(token || "").split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof atob !== "undefined"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
