/**
 * Patient-facing sender labels — clinic AI must never show as "Doctor".
 */

const CARE_TEAM_NAMES = new Set([
  "care team",
  "bakım ekibi",
  "bakim ekibi",
  "careteam",
  "ai",
  "klinik",
  "clinic",
]);

export function isClinicAiActor(params: {
  actorKind?: string | null;
  messageSource?: string | null;
  senderRole?: string | null;
  senderName?: string | null;
}): boolean {
  const actorKind = String(params.actorKind || "").toLowerCase();
  const messageSource = String(params.messageSource || "").toLowerCase();
  const senderRole = String(params.senderRole || "").toLowerCase();
  const senderName = String(params.senderName || "")
    .trim()
    .toLowerCase();

  if (actorKind === "clinic_ai" || messageSource === "clinic_ai") return true;
  if (actorKind.includes("ai_auto") || messageSource.includes("ai_auto")) return true;
  if (actorKind.includes("ai_offer") || messageSource.includes("ai_offer")) return true;
  if (senderRole === "assistant" || senderRole === "ai") return true;
  if (CARE_TEAM_NAMES.has(senderName)) return true;
  return false;
}

export function careTeamLabel(t: (key: string) => string): string {
  const key = "messages.senderCareTeam";
  const v = t(key);
  return v !== key ? v : "Care team";
}

export function doctorLabel(t: (key: string) => string): string {
  const key = "messages.senderDoctor";
  const v = t(key);
  return v !== key ? v : "Doctor";
}
