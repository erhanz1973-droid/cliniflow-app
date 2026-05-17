/**
 * Distinguish human conversation messages from AI/system inbox rows.
 * Used to suppress in-app sounds and treat only real chat as "new message".
 */

const AI_PREVIEW_PLACEHOLDERS = new Set([
  "ai önizleme",
  "ai preview",
  "ai გადახედვა",
  "превью ии",
]);

const SUPPRESSED_TYPES = new Set([
  "ai_result",
  "ai_preview",
  "ai_analysis",
  "ai_loading",
  "system",
  "workflow",
  "intake_sync",
  "intake_update",
]);

export type ChatMessageLike = {
  from?: string;
  type?: string;
  text?: string;
  attachment?: { aiResult?: unknown; ai_result?: unknown } | null;
};

function normalizeFrom(from: string | undefined): string {
  return String(from || "").toUpperCase();
}

export function isSystemOrAiChatMessage(msg: ChatMessageLike | null | undefined): boolean {
  if (!msg) return false;
  const type = String(msg.type || "").trim().toLowerCase();
  if (type && SUPPRESSED_TYPES.has(type)) return true;
  const att = msg.attachment;
  if (att && typeof att === "object" && (att.aiResult || att.ai_result)) return true;
  const t = String(msg.text || "").trim().toLowerCase();
  if (!t) return false;
  if (AI_PREVIEW_PLACEHOLDERS.has(t)) return true;
  if (/^ai\s*(önizleme|preview|гид)?$/i.test(t)) return true;
  return false;
}

/** Inbound clinic/doctor/admin message that should ding or count as unread chat. */
export function isHumanInboundChatMessage(msg: ChatMessageLike | null | undefined): boolean {
  if (!msg || isSystemOrAiChatMessage(msg)) return false;
  const fr = normalizeFrom(msg.from);
  return fr === "CLINIC" || fr === "ADMIN";
}
