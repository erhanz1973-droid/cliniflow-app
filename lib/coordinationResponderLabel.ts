export type CoordinationResponder = {
  conversationOwner?: "ai" | "doctor" | string | null;
  responderMode?: string | null;
  aiPaused?: boolean;
  aiEscalationRequired?: boolean;
};

export type ResponderChipTone = "ai" | "doctor" | "escalated";

export function coordinationResponderChipTone(
  responder: CoordinationResponder | null | undefined,
): ResponderChipTone | null {
  if (!responder) return null;
  if (responder.aiEscalationRequired) return "escalated";
  if (responder.conversationOwner === "doctor") return "doctor";
  if (responder.conversationOwner === "ai") return "ai";
  return null;
}

export function coordinationResponderChipLabel(
  responder: CoordinationResponder | null | undefined,
  t: (key: string) => string,
): string | null {
  const tone = coordinationResponderChipTone(responder);
  if (!tone) return null;
  if (tone === "escalated") {
    const key = "doctor.responder.escalated";
    const v = t(key);
    return v !== key ? v : "Doctor review needed";
  }
  if (tone === "doctor") {
    const key = "doctor.responder.doctorOwns";
    const v = t(key);
    return v !== key ? v : "Doctor took over";
  }
  const key = "doctor.responder.aiActive";
  const v = t(key);
  return v !== key ? v : "AI responding";
}
