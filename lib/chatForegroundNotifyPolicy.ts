/**
 * Suppress loud OS / in-app chat alerts when the user is already on a messaging screen.
 */
import {
  getActiveOfferChatOfferId,
  getGlobalChatOpen,
  getGlobalOfferChatOpen,
} from "../hooks/chatSessionGlobal";
import {
  canonicalDoctorPatientChatKey,
  getGlobalDoctorChatPatientIdOpen,
} from "./doctorChatForeground";

export function isAnyActiveMessagingScreenOpen(): boolean {
  return (
    getGlobalChatOpen() ||
    getGlobalOfferChatOpen() ||
    Boolean(getGlobalDoctorChatPatientIdOpen())
  );
}

function normalizeOfferThreadId(raw: string): string {
  const s = String(raw || "").trim();
  const m = /^offer:(.+)$/i.exec(s);
  return (m ? m[1] : s).trim();
}

function normalizePatientThreadId(raw: string): string {
  const s = String(raw || "").trim();
  const stripped = s.replace(/^(chat|fg_poll|patient_clinic_fg|patient_unread):/i, "");
  const first = stripped.split(":")[0] || stripped;
  return canonicalDoctorPatientChatKey(first);
}

/**
 * True when chat sound / banner / vibration should be skipped (user is viewing messaging UI).
 */
export function shouldSuppressChatAlertForThread(threadKey?: string | null): boolean {
  if (getGlobalChatOpen()) return true;

  const doctorOpen = getGlobalDoctorChatPatientIdOpen();
  if (doctorOpen) {
    if (!threadKey) return true;
    const incoming = normalizePatientThreadId(threadKey);
    return !incoming || incoming === doctorOpen || threadKey.includes(doctorOpen);
  }

  if (getGlobalOfferChatOpen()) {
    const openOid = getActiveOfferChatOfferId();
    if (!threadKey) return true;
    if (!openOid) return true;
    const incoming = normalizeOfferThreadId(threadKey);
    return incoming === openOid || threadKey.includes(openOid);
  }

  return false;
}

/** OS presentation (banner + long channel sound) while a messaging screen has focus. */
export function shouldSuppressForegroundPushPresentation(): boolean {
  return isAnyActiveMessagingScreenOpen();
}
