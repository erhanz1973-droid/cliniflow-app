import type { Router } from "expo-router";
import { safeGetItem, safeRemoveItem, safeSetItem } from "./asyncStorageSafe";
import { API_BASE } from "./api";

export const PENDING_AI_OFFER_KEY = "@cliniflow:pending_ai_offer_v1";

export type PendingAiOfferPayload = {
  image: string;
  photos?: string[];
  analysis: Record<string, unknown>;
  /** Pre-filled clinic message (e.g. smile score quote). */
  message?: string;
};

export async function persistPendingAiOfferForClinicSelect(payload: PendingAiOfferPayload) {
  await safeSetItem(PENDING_AI_OFFER_KEY, JSON.stringify(payload));
}

export async function loadPendingAiOfferForClinicSelect(): Promise<PendingAiOfferPayload | null> {
  const raw = await safeGetItem(PENDING_AI_OFFER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PendingAiOfferPayload;
  } catch {
    return null;
  }
}

export async function clearPendingAiOfferForClinicSelect() {
  await safeRemoveItem(PENDING_AI_OFFER_KEY);
}

/**
 * AI analiz sonrası: büyük payload’ı AsyncStorage’a yazar, klinik seçim ekranına gider.
 * Storage başarısız olsa bile navigasyon devam eder (ekran backend / kullanıcı girdisiyle toparlar).
 */
export async function goToClinicSelect(
  router: Pick<Router, "push">,
  opts: { image: string; photos?: string[]; analysis: Record<string, unknown>; message?: string },
) {
  const image = String(opts.image || "").trim();
  const photos = (opts.photos || [image]).map((u) => String(u || "").trim()).filter(Boolean);
  await persistPendingAiOfferForClinicSelect({
    image,
    photos,
    analysis: opts.analysis || {},
    ...(opts.message?.trim() ? { message: opts.message.trim() } : {}),
  });
  router.push({ pathname: "/(patient)/clinic-select-for-offer" } as any);
}

export type SendOfferRequestParams = {
  token: string;
  clinicIds: string[];
  image: string;
  photos?: string[];
  analysis: Record<string, unknown>;
  message: string;
};

export type SendOfferRequestResult =
  | { ok: true; requestIds: string[] }
  | { ok: false; error: string; message?: string };

export async function sendOfferRequest(
  params: SendOfferRequestParams,
): Promise<SendOfferRequestResult> {
  const { token, clinicIds, image, photos, analysis, message } = params;
  const imageUrl = String(image || "").trim();
  const photoList = (photos?.length ? photos : [imageUrl])
    .map((u) => String(u || "").trim())
    .filter((u) => /^https?:\/\//i.test(u));
  if (!photoList.length) {
    return {
      ok: false,
      error: "photo_url_required",
      message: "Önce fotoğrafın sunucuya yüklenmesi gerekir (geçerli https adresi).",
    };
  }
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
        image: photoList[0],
        photos: photoList,
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
