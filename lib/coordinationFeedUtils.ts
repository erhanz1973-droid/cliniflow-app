import type { ConversationTurn, OperationalEvent } from "./coordinationWorkspaceTypes";

const CHAT_ROLES = new Set(["patient", "ai", "human", "doctor"]);

/** Hasta / AI / ekip mesaj balonları — sistem olayları hariç. */
export function conversationTurnsFromFeed(feed: ConversationTurn[]): ConversationTurn[] {
  return feed.filter((t) => {
    if (t.kind === "system" || t.role === "system" || t.kind === "doctor_intent" || t.kind === "ai_draft") {
      return false;
    }
    if (!CHAT_ROLES.has(t.role)) return false;
    return Boolean(String(t.text || "").trim());
  });
}

const NOISY_OPERATIONAL_TYPES = new Set([
  "doctor_joined",
  "human_takeover",
  "ai_paused",
  "ai_resumed",
  "coordination_change",
]);

export function operationalEventsFromFeed(feed: ConversationTurn[]): OperationalEvent[] {
  const raw = feed
    .filter(
      (t) =>
        t.kind === "system" ||
        t.role === "system" ||
        t.kind === "doctor_intent" ||
        t.kind === "ai_draft",
    )
    .map((t) => ({
      id: t.id,
      label: (t.label || t.text || "").trim().slice(0, 120) || t.eventType || "Olay",
      eventType: t.eventType || t.kind || null,
      createdAt: t.at,
    }));

  const seen = new Set<string>();
  const out: OperationalEvent[] = [];
  for (const ev of raw.reverse()) {
    const type = String(ev.eventType || "").toLowerCase();
    if (NOISY_OPERATIONAL_TYPES.has(type)) {
      const key = `${type}|${ev.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(ev);
    if (out.length >= 8) break;
  }
  return out.reverse();
}
