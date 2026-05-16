/**
 * Offer-chat message text normalization — shared by UI, API mapping, Supabase hook, optimistic rows.
 * RN Web: whitespace-only / non-strings must not become stray View text children.
 */

export function safeOfferMessageText(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw).trim();
  return '';
}

/** Store shape: null when empty after trim (matches DB nullable text). */
export function normalizeOfferMessageTextNullable(raw: unknown): string | null {
  const s = safeOfferMessageText(raw);
  return s.length > 0 ? s : null;
}

export type OfferBubbleRenderPlan = {
  showBubbleText: boolean;
  useDoctorPatientInlineLabel: boolean;
  showAttachmentOnlyLabel: boolean;
};

/**
 * Pure render plan for OfferChatMessageItem body (unit-testable without React).
 */
export function planOfferChatBubbleRender(opts: {
  myRole: 'doctor' | 'patient';
  senderRole: 'patient' | 'doctor' | 'system';
  text: unknown;
  hasImage: boolean;
  hasDoc: boolean;
  patientSenderLabel: string;
  formatDescription: (raw: string) => string;
}): OfferBubbleRenderPlan {
  const rawText = safeOfferMessageText(opts.text);
  const bubbleText = rawText ? opts.formatDescription(rawText) : '';
  const showBubbleText = bubbleText.length > 0;
  const isMe = opts.senderRole === opts.myRole;
  const isDoctorViewingPatient = opts.myRole === 'doctor' && !isMe && opts.senderRole === 'patient';
  const hasAttachment = opts.hasImage || opts.hasDoc;

  return {
    showBubbleText,
    useDoctorPatientInlineLabel:
      showBubbleText && isDoctorViewingPatient && opts.patientSenderLabel.length > 0,
    showAttachmentOnlyLabel:
      isDoctorViewingPatient && hasAttachment && !showBubbleText && opts.patientSenderLabel.length > 0,
  };
}
