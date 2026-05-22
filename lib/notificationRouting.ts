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
        enrolled: data.enrolled === true || data.enrolled === "true",
        bootstrapRoute: firstStringField(data, ["route"]),
      });
      return pathFromCanonicalTarget(target);
    }
    if (vt === "patient") {
      const offerId = firstStringField(data, ["offerId", "offer_id"]);
      if (offerId) {
        const input = pushDataToResolveInput(data, "patient");
        const target = resolveCanonicalChatTarget(input);
        return pathFromCanonicalTarget(target);
      }
      return "/(tabs)/chat";
    }
  }

  const url = firstStringField(data, ["url"]);
  if (url) {
    const path = url.startsWith("/") ? url : `/${url}`;
    return path.length > 2048 ? null : path;
  }

  return null;
}
