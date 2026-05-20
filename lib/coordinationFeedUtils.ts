import type { ConversationTurn, OperationalEvent } from "./coordinationWorkspaceTypes";

export function operationalEventsFromFeed(feed: ConversationTurn[]): OperationalEvent[] {
  return feed
    .filter((t) => t.kind === "system" || t.role === "system" || t.kind === "doctor_intent" || t.kind === "ai_draft")
    .map((t) => ({
      id: t.id,
      label: (t.label || t.text || "").trim().slice(0, 120) || t.eventType || "Olay",
      eventType: t.eventType || t.kind || null,
      createdAt: t.at,
    }));
}
