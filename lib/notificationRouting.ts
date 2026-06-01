import {
  pathFromCanonicalTarget,
  pushDataToResolveInput,
  resolveCanonicalChatTarget,
} from "./canonicalChatTarget";

function firstStringField(data: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const v = data[key];
    if (v === undefined || v === null) continue;
    const t = typeof v === "string" ? v.trim() : String(v).trim();
    if (t) return t;
  }
  return "";
}

function isTruthyFlag(raw: unknown): boolean {
  return raw === true || raw === "true" || raw === 1 || raw === "1";
}

/** Canonical patient clinic chat — not legacy `(patient)/messages` or `offer-chat`. */
export function buildPatientMainChatPath(data?: Record<string, unknown> | null): string {
  const clinicId = data ? firstStringField(data, ["clinicId", "clinic_id"]) : "";
  const clinicCode = data ? firstStringField(data, ["clinicCode", "clinic_code"]) : "";
  const q = new URLSearchParams();
  if (clinicId) {
    q.set("clinicId", clinicId);
    q.set("clinic_id", clinicId);
  }
  if (clinicCode) q.set("clinicCode", clinicCode);
  const qs = q.toString();
  return qs ? `/(tabs)/chat?${qs}` : "/(tabs)/chat";
}

function isPatientClinicThreadPush(data: Record<string, unknown>): boolean {
  if (isTruthyFlag(data.enrolled)) return true;
  const routeHint = firstStringField(data, ["route", "bootstrapRoute"]).toLowerCase();
  if (routeHint === "patient_chat") return true;
  if (firstStringField(data, ["clinicId", "clinic_id"])) return true;
  const type = firstStringField(data, ["type"]).toLowerCase();
  return type === "new_message" || type === "chat_message";
}

function normalizeLegacyPatientMessageUrl(url: string, data: Record<string, unknown>): string | null {
  const raw = url.trim();
  if (!raw) return null;
  let path = raw.startsWith("/") ? raw : `/${raw}`;
  if (path.length > 2048) return null;
  const lower = path.toLowerCase();
  if (
    lower.includes("/(patient)/messages") ||
    lower === "/messages" ||
    lower.startsWith("/messages?")
  ) {
    const qs = path.includes("?") ? path.slice(path.indexOf("?")) : "";
    return buildPatientMainChatPath(data) + (qs && !data.clinicId ? qs : "");
  }
  if (lower.includes("/(tabs)/chat") || lower === "/chat" || lower.startsWith("/chat?")) {
    if (lower === "/chat" || lower.startsWith("/chat?")) {
      path = `/(tabs)/chat${path.slice("/chat".length)}`;
    }
    return path;
  }
  if (lower.includes("offer-chat")) {
    return isPatientClinicThreadPush(data) ? buildPatientMainChatPath(data) : null;
  }
  return path;
}

function resolvePatientPushPath(data: Record<string, unknown>): string | null {
  const type = firstStringField(data, ["type"]).toLowerCase();

  if (type === "new_offer" && !isPatientClinicThreadPush(data)) {
    const input = pushDataToResolveInput(data, "patient");
    if (!input.otherPartyName) {
      input.otherPartyName = firstStringField(data, ["title"]) || "Clinic";
    }
    const target = resolveCanonicalChatTarget(input);
    return pathFromCanonicalTarget(target);
  }

  if (
    type === "new_message" ||
    type === "chat_message" ||
    type === "offer_message" ||
    type === "patient_inbound"
  ) {
    if (type === "offer_message" && !isPatientClinicThreadPush(data)) {
      const offerId = firstStringField(data, ["offerId", "offer_id"]);
      if (offerId) {
        const input = pushDataToResolveInput(data, "patient");
        const target = resolveCanonicalChatTarget(input);
        return pathFromCanonicalTarget(target);
      }
    }
    return buildPatientMainChatPath(data);
  }

  const url = firstStringField(data, ["url"]);
  if (url) {
    const legacy = normalizeLegacyPatientMessageUrl(url, data);
    if (legacy) return legacy;
  }

  return null;
}

/**
 * Maps Expo push `data` → expo-router path via resolveCanonicalChatTarget.
 */
export function getPathFromNotificationData(
  data: Record<string, unknown> | null | undefined,
  viewer?: { type?: string } | null,
): string | null {
  if (!data || typeof data !== "object") return null;

  const type = firstStringField(data, ["type"]).toLowerCase();
  const vt = String(viewer?.type || "").toLowerCase();
  const viewerRole = vt === "doctor" ? "doctor" : vt === "patient" ? "patient" : "patient";

  if (vt === "patient") {
    const patientPath = resolvePatientPushPath(data);
    if (patientPath) return patientPath;
  }

  if (type === "offer_message" || type === "new_offer") {
    const input = pushDataToResolveInput(data, viewerRole);
    if (type === "new_offer" && !input.otherPartyName) {
      input.otherPartyName = firstStringField(data, ["title"]) || "Clinic";
    }
    const target = resolveCanonicalChatTarget(input);
    return pathFromCanonicalTarget(target);
  }

  if (type === "chat_message" || type === "new_message") {
    if (vt === "doctor") {
      const offerId = firstStringField(data, ["offerId", "offer_id"]);
      if (offerId) {
        const input = pushDataToResolveInput(data, "doctor");
        const target = resolveCanonicalChatTarget(input);
        return pathFromCanonicalTarget(target);
      }
      const patientId = firstStringField(data, ["patientId", "patient_id"]);
      const patientName = firstStringField(data, ["patientName", "patient_name"]) || "Patient";
      if (!patientId) return null;
      const target = resolveCanonicalChatTarget({
        viewerRole: "doctor",
        patientId,
        patientName,
        requestId: firstStringField(data, ["requestId", "request_id"]) || undefined,
        leadThreadIsLead: data.lead_thread_is_lead ?? data.leadThreadIsLead,
        enrolled: isTruthyFlag(data.enrolled),
        bootstrapRoute: firstStringField(data, ["route"]),
      });
      return pathFromCanonicalTarget(target);
    }
    return buildPatientMainChatPath(data);
  }

  const url = firstStringField(data, ["url"]);
  if (url) {
    if (vt === "patient") {
      const legacy = normalizeLegacyPatientMessageUrl(url, data);
      if (legacy) return legacy;
    }
    const path = url.startsWith("/") ? url : `/${url}`;
    return path.length > 2048 ? null : path;
  }

  return null;
}

/** True when notification tap should replace stack (patient main chat). */
export function shouldReplaceStackForNotificationPath(path: string | null, viewerType?: string | null): boolean {
  if (String(viewerType || "").toLowerCase() !== "patient") return false;
  if (!path) return false;
  return path.includes("/chat");
}
