/**
 * Temporary diagnostics for canonical vs offer-thread sends (remove when stable).
 */
export type CanonicalSendDiag = {
  source: string;
  canonical_chat_type: "patient" | "offer";
  resolved_thread_kind: "patient_chat" | "offer_chat" | "unknown";
  resolved_patient_id?: string | null;
  resolved_offer_id?: string | null;
  resolved_offer_archived: boolean;
  lead_thread_is_lead?: boolean | null;
  enrolled?: boolean;
  bootstrap_route?: string | null;
  extra?: Record<string, unknown>;
};

export function logCanonicalChatDiag(event: string, fields: CanonicalSendDiag): void {
  const payload = {
    event,
    ts: new Date().toISOString(),
    ...fields,
  };
  console.log(`[canonical-chat] ${event}`, payload);
}

export function logCanonicalSendAttempt(fields: CanonicalSendDiag): void {
  logCanonicalChatDiag("send_attempt", fields);
}
