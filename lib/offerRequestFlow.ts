import type { Router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./api";

export const PENDING_AI_OFFER_KEY = "@cliniflow:pending_ai_offer_v1";

export type PendingAiOfferPayload = {
  image: string;
  analysis: Record<string, unknown>;
};

export async function persistPendingAiOfferForClinicSelect(payload: PendingAiOfferPayload) {
  await AsyncStorage.setItem(PENDING_AI_OFFER_KEY, JSON.stringify(payload));
}

export async function loadPendingAiOfferForClinicSelect(): Promise<PendingAiOfferPayload | null> {
  const raw = await AsyncStorage.getItem(PENDING_AI_OFFER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingAiOfferPayload;
  } catch {
    return null;
  }
}

export async function clearPendingAiOfferForClinicSelect() {
  await AsyncStorage.removeItem(PENDING_AI_OFFER_KEY);
}

/**
 * AI analiz sonrası: büyük payload’ı AsyncStorage’a yazar, klinik seçim ekranına gider.
 */
export async function goToClinicSelect(
  router: Pick<Router, "push">,
  opts: { image: string; analysis: Record<string, unknown> }
) {
  await persistPendingAiOfferForClinicSelect({
    image: String(opts.image || "").trim(),
    analysis: opts.analysis || {},
  });
  router.push({ pathname: "/(patient)/clinic-select-for-offer" } as any);
}

export type SendOfferRequestParams = {
  token: string;
  clinicIds: string[];
  image: string;
  analysis: Record<string, unknown>;
  message: string;
};

export type SendOfferRequestResult =
  | { ok: true; requestIds: string[] }
  | { ok: false; error: string; message?: string };

export async function sendOfferRequest(
  params: SendOfferRequestParams
): Promise<SendOfferRequestResult> {
  const { token, clinicIds, image, analysis, message } = params;
  try {
    const res = await fetch(`${API_BASE}/api/patient/treatment-requests`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        clinicIds,
        image,
        analysis,
        message: String(message || "").trim(),
      }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return {
        ok: false,
        error: String(json.error || "request_failed"),
        message: String(json.message || ""),
      };
    }
    const ids = Array.isArray(json.requestIds)
      ? (json.requestIds as unknown[]).map((x) => String(x))
      : [];
    return { ok: true, requestIds: ids };
  } catch (e) {
    return {
      ok: false,
      error: "network",
      message: String((e as Error)?.message || e),
    };
  }
}

/** Teklifler / talepler listesi (mevcut deep link ile uyumlu). */
export function goToOffers(router: Pick<Router, "push" | "replace">) {
  router.replace("/my-requests" as any);
}
