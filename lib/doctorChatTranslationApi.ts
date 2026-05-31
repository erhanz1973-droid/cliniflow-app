import { apiFetchJson } from "./api";

export type MessageTranslation = {
  sourceLanguage: string;
  targetLanguage: string;
  translatedText: string;
  translatedAt?: string;
};

export type TranslateMessageResponse = {
  ok?: boolean;
  messageId?: string;
  cached?: boolean;
  translation?: MessageTranslation;
  translatedText?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  error?: string;
};

export const LANG_FLAG: Record<string, string> = {
  tr: "🇹🇷",
  en: "🇬🇧",
  ka: "🇬🇪",
  ru: "🇷🇺",
  de: "🇩🇪",
  fr: "🇫🇷",
  ar: "🇸🇦",
};

export function langFlag(code?: string | null) {
  const key = String(code || "")
    .trim()
    .toLowerCase()
    .slice(0, 2);
  return LANG_FLAG[key] || "🌐";
}

/** Read cached translation blob from API message payload. */
export function pickCachedTranslation(
  raw: unknown,
  targetLang: string,
): MessageTranslation | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const target = String(targetLang || "en")
    .trim()
    .toLowerCase()
    .slice(0, 2);

  const byTarget = obj.byTarget;
  if (byTarget && typeof byTarget === "object" && !Array.isArray(byTarget)) {
    const entry = (byTarget as Record<string, unknown>)[target];
    if (entry && typeof entry === "object") {
      const e = entry as Record<string, unknown>;
      const translatedText = String(e.translatedText || "").trim();
      if (!translatedText) return null;
      return {
        sourceLanguage: String(e.sourceLanguage || "auto"),
        targetLanguage: String(e.targetLanguage || target),
        translatedText,
        translatedAt: e.translatedAt ? String(e.translatedAt) : undefined,
      };
    }
  }

  if (obj.translatedText && String(obj.targetLanguage || "").slice(0, 2) === target) {
    return {
      sourceLanguage: String(obj.sourceLanguage || "auto"),
      targetLanguage: String(obj.targetLanguage || target),
      translatedText: String(obj.translatedText),
      translatedAt: obj.translatedAt ? String(obj.translatedAt) : undefined,
    };
  }

  return null;
}

export async function translateDoctorMessage(
  messageId: string,
  targetLanguage?: string,
): Promise<TranslateMessageResponse> {
  return apiFetchJson<TranslateMessageResponse>(
    `/api/doctor/messages/${encodeURIComponent(messageId)}/translate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(targetLanguage ? { targetLanguage } : {}),
      timeoutMs: 35_000,
    },
  );
}
