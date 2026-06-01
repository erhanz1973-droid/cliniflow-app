import type { IntentTag, RewriteAction } from "@/lib/clinicalGuidanceApi";

/** Translation with English fallback when key is missing. */
export function cx(t: (key: string) => string, key: string, fallback: string): string {
  const v = t(key);
  return v && v !== key ? v : fallback;
}

export const COORD_DATE_LOCALE: Record<string, string> = {
  tr: "tr-TR",
  en: "en-US",
  ka: "ka-GE",
  ru: "ru-RU",
};

export function formatCoordDateTime(iso: string | undefined, lang: string): string {
  if (!iso) return "";
  try {
    const locale = COORD_DATE_LOCALE[lang] || "en-US";
    return new Date(iso).toLocaleString(locale, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function conversationOwnerLabel(
  t: (key: string) => string,
  doctorOwns: boolean,
  serverLabel?: string | null,
): string {
  const trimmed = String(serverLabel || "").trim();
  if (trimmed) return trimmed;
  return doctorOwns
    ? cx(t, "doctor.coordination.ownerDoctor", "Doctor owns the conversation")
    : cx(t, "doctor.coordination.ownerAi", "AI owns the conversation");
}

export function contextClassLabel(t: (key: string) => string, code: string | undefined | null): string {
  const c = String(code || "").trim();
  if (!c) return "—";
  const key = `doctor.coordination.context.${c}`;
  const fallbacks: Record<string, string> = {
    local_patient: "Local patient",
    domestic_traveler: "Domestic travel",
    international_patient: "International",
    unknown_context: "Unknown context",
  };
  return cx(t, key, fallbacks[c] || c);
}

export type FeedRoleMeta = {
  emoji: string;
  label: string;
  bubbleKey: string;
  labelColor: string;
  caption?: string;
};

export function feedRoleMeta(t: (key: string) => string, role: string): FeedRoleMeta {
  const map: Record<string, FeedRoleMeta> = {
    patient: {
      emoji: "👤",
      label: cx(t, "doctor.coordination.role.patient", "Patient"),
      bubbleKey: "bubblePatient",
      labelColor: "#1e40af",
    },
    ai: {
      emoji: "🤖",
      label: cx(t, "doctor.coordination.role.ai", "AI coordinator"),
      bubbleKey: "bubbleAi",
      labelColor: "#0369a1",
    },
    human: {
      emoji: "💬",
      label: cx(t, "doctor.coordination.role.human", "Clinic team"),
      bubbleKey: "bubbleHuman",
      labelColor: "#047857",
    },
    doctor: {
      emoji: "👨‍⚕️",
      label: cx(t, "doctor.coordination.role.doctor", "Doctor"),
      bubbleKey: "bubbleDoctor",
      labelColor: "#7c2d12",
    },
    doctor_intent: {
      emoji: "👨‍⚕️",
      label: cx(t, "doctor.coordination.role.doctorIntent", "Doctor guidance"),
      bubbleKey: "bubbleIntent",
      labelColor: "#6b21a8",
      caption: cx(t, "doctor.coordination.role.doctorIntentCaption", "Internal note — not sent to patient"),
    },
    ai_draft: {
      emoji: "🤖",
      label: cx(t, "doctor.coordination.role.aiDraft", "AI draft"),
      bubbleKey: "bubbleDraft",
      labelColor: "#4338ca",
      caption: cx(t, "doctor.coordination.role.aiDraftCaption", "Awaiting approval"),
    },
    system: {
      emoji: "⚙️",
      label: cx(t, "doctor.coordination.role.system", "System"),
      bubbleKey: "bubbleSystem",
      labelColor: "#6b7280",
    },
  };
  return map[role] || map.system;
}

export function intentTagLabel(t: (key: string) => string, tag: IntentTag): string {
  const key = `doctor.coordination.tag.${tag}`;
  const fallbacks: Record<string, string> = {
    reassure_patient: "Reassure",
    explain_process: "Process",
    request_xray: "X-ray",
    request_cbct: "CBCT",
    explain_timeline: "Timeline",
    discuss_pricing: "Pricing",
    reduce_anxiety: "Anxiety",
    encourage_consultation: "Consultation",
    collect_patient_info: "Collect info",
    schedule_visit: "Visit",
  };
  return cx(t, key, fallbacks[tag] || tag);
}

export function rewriteActionLabel(t: (key: string) => string, action: RewriteAction): string {
  const key = `doctor.coordination.rewrite.${action}`;
  const fallbacks: Record<RewriteAction, string> = {
    shorter: "Shorter",
    simpler: "Simpler",
    more_empathetic: "Empathetic",
    more_professional: "Professional",
    reassure_patient: "Reassure",
    more_concise: "Concise",
  };
  return cx(t, key, fallbacks[action]);
}

export const REWRITE_ACTION_IDS: RewriteAction[] = [
  "shorter",
  "simpler",
  "more_empathetic",
  "more_professional",
  "reassure_patient",
  "more_concise",
];
