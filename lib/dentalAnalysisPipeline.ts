/**
 * Shared Camera → Analysis AI pipeline (upload + ai-analyze).
 * Idempotent: same image bytes → one upload, one analysis (unless forceReanalyze).
 */
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { API_BASE } from "./api";
import { sha256LocalFileUri, normalizeContentHash } from "./treatmentGuide/imageContentHash";
import {
  getUploadedImageByHash,
  saveUploadedImageRecord,
} from "./treatmentGuide/workflowState";
import { normalizeImageFingerprint } from "./treatmentGuide/analysisCache";

export type UserLocation = { latitude: number; longitude: number } | null;

export async function getUserLocationForAnalysis(): Promise<UserLocation> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;
  }
}

export async function compressImageForAi(
  uri: string,
  mimeType: string,
  opts: { maxWidth?: number; quality?: number } = {},
): Promise<{ uri: string; mimeType: string }> {
  const isCompressible =
    mimeType === "image/jpeg" ||
    mimeType === "image/jpg" ||
    mimeType === "image/png" ||
    mimeType === "image/heic" ||
    mimeType === "image/heif";
  if (!isCompressible) return { uri, mimeType };

  const { maxWidth = 1024, quality = 0.75 } = opts;
  const readSizeKB = async (fileUri: string): Promise<number> => {
    try {
      const info = await FileSystem.getInfoAsync(fileUri, {
        size: true,
      } as Parameters<typeof FileSystem.getInfoAsync>[1]);
      if (info.exists && "size" in info && (info as { size: number }).size > 0) {
        return Math.round((info as { size: number }).size / 1024);
      }
    } catch {
      /* non-fatal */
    }
    return 0;
  };

  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
    );
    let sizeKB = await readSizeKB(result.uri);
    if (sizeKB === 0) {
      await new Promise((r) => setTimeout(r, 100));
      sizeKB = await readSizeKB(result.uri);
    }
    if (sizeKB === 0) return { uri, mimeType };

    const ONE_MB_KB = 1024;
    if (sizeKB > ONE_MB_KB) {
      try {
        const reResult = await ImageManipulator.manipulateAsync(result.uri, [], {
          compress: 0.6,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        const reSizeKB = await readSizeKB(reResult.uri);
        if (reSizeKB > 0) return { uri: reResult.uri, mimeType: "image/jpeg" };
      } catch {
        /* fall through */
      }
    }
    return { uri: result.uri, mimeType: "image/jpeg" };
  } catch {
    return { uri, mimeType };
  }
}

const UPLOAD_TIMEOUT_MS = 90_000;
const ANALYZE_TIMEOUT_MS = 60_000;

const uploadInFlightByPatient = new Map<string, Promise<{ ok: true; url: string } | { ok: false; message: string }>>();

export function isAlreadyUploadedRemoteUrl(uri: string): boolean {
  const s = String(uri || "").trim();
  if (!/^https?:\/\//i.test(s)) return false;
  const base = API_BASE.replace(/\/+$/, "");
  if (s.startsWith(base)) return true;
  if (/supabase\.co\/storage\//i.test(s) || /\/storage\/v1\/object\//i.test(s)) return true;
  if (s.includes("/uploads/chat/") || s.includes("/uploads/patient/") || s.includes("/api/")) return true;
  return false;
}

export async function uploadImageForAi(
  uri: string,
  name: string,
  mimeType: string,
  token: string,
  opts?: { contentHash?: string | null; patientId?: string },
): Promise<{ ok: true; url: string; reused?: boolean } | { ok: false; message: string; aborted?: boolean }> {
  const patientId = String(opts?.patientId || "").trim();
  const contentHash = normalizeContentHash(opts?.contentHash);

  if (contentHash && patientId) {
    const local = await getUploadedImageByHash(patientId, contentHash);
    if (local?.remoteUrl) {
      return { ok: true, url: local.remoteUrl, reused: true };
    }
  }

  const inflightKey = `${patientId}|${contentHash || uri}`;
  const existing = uploadInFlightByPatient.get(inflightKey);
  if (existing) return existing;

  const task = (async () => {
    try {
      const info = await FileSystem.getInfoAsync(uri, {
        size: true,
      } as Parameters<typeof FileSystem.getInfoAsync>[1]);
      const size = info.exists && "size" in info ? ((info as { size: number }).size as number) : 0;
      if (size === 0) {
        return { ok: false as const, message: "empty_file" };
      }
    } catch {
      /* proceed */
    }

    const normalizedMime =
      mimeType === "image/jpg" || mimeType === "jpeg" ? "image/jpeg" : mimeType;
    const isPng = normalizedMime === "image/png";
    const fileName =
      name && /\.(jpe?g|png|heic|webp)$/i.test(String(name))
        ? String(name)
        : isPng
          ? `photo_${Date.now()}.png`
          : `photo_${Date.now()}.jpg`;
    const partType = isPng ? "image/png" : "image/jpeg";

    const formData = new FormData();
    formData.append("file", { uri, name: fileName, type: partType } as unknown as Blob);
    if (contentHash) formData.append("contentHash", contentHash);

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
    try {
      const res = await fetch(`${API_BASE}/api/chat/ai-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        body: formData,
        signal: controller.signal,
      });
      const rawText = await res.text().catch((e) => `[text() failed: ${(e as Error).message}]`);
      let json: Record<string, unknown> = {};
      try {
        json = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        /* */
      }
      if (!res.ok || !json.url) {
        return {
          ok: false as const,
          message: String(json.message || json.error || rawText.slice(0, 200)),
        };
      }
      const url = String(json.url);
      const reused = json.reused === true;
      if (contentHash && patientId) {
        await saveUploadedImageRecord(patientId, {
          contentHash,
          remoteUrl: url.split("?")[0],
          fingerprint: normalizeImageFingerprint(uri),
          uploadedAt: Date.now(),
        });
      }
      return { ok: true as const, url, reused };
    } catch (e) {
      const aborted = (e as Error)?.name === "AbortError";
      return {
        ok: false as const,
        message: aborted ? "timeout" : String((e as Error)?.message || e),
        aborted,
      };
    } finally {
      clearTimeout(tid);
    }
  })();

  uploadInFlightByPatient.set(inflightKey, task);
  try {
    return await task;
  } finally {
    uploadInFlightByPatient.delete(inflightKey);
  }
}

export type AnalyzePhotoOk = {
  ok: true;
  fileUrl: string;
  aiData: Record<string, unknown>;
};

export type AnalyzePhotoErr = {
  ok: false;
  phase: "session" | "upload" | "analyze" | "parse";
  message: string;
  status?: number;
  aiData?: Record<string, unknown>;
};

export type AnalyzePhotoResult = AnalyzePhotoOk | AnalyzePhotoErr;

export async function analyzePhoto(params: {
  imageUri: string;
  patientId: string;
  token: string;
  photoType?: string;
  lang?: string;
  forceReanalyze?: boolean;
  contentHash?: string | null;
}): Promise<AnalyzePhotoResult> {
  const {
    imageUri,
    patientId,
    token,
    photoType = "general",
    lang,
    forceReanalyze = false,
    contentHash: contentHashIn,
  } = params;

  if (!String(patientId || "").trim()) {
    return { ok: false, phase: "session", message: "no_patient" };
  }
  if (!String(imageUri || "").trim()) {
    return { ok: false, phase: "session", message: "no_image" };
  }

  let contentHash = normalizeContentHash(contentHashIn);
  if (!contentHash && !isAlreadyUploadedRemoteUrl(imageUri)) {
    const compressedProbe = await compressImageForAi(
      imageUri,
      /\.png(\?|$)/i.test(imageUri) ? "image/png" : "image/jpeg",
    );
    contentHash = normalizeContentHash(await sha256LocalFileUri(compressedProbe.uri));
  }

  const mimeGuess =
    /\.png(\?|$)/i.test(imageUri) ? "image/png" :
    /\.heic(\?|$)/i.test(imageUri) ? "image/heic" :
    "image/jpeg";

  let fileUrl: string;
  if (isAlreadyUploadedRemoteUrl(imageUri)) {
    fileUrl = String(imageUri).trim().split("?")[0];
  } else if (contentHash) {
    const prior = await getUploadedImageByHash(patientId, contentHash);
    if (prior?.remoteUrl) {
      fileUrl = prior.remoteUrl;
    } else {
      const compressed = await compressImageForAi(imageUri, mimeGuess);
      if (!contentHash) {
        contentHash = normalizeContentHash(await sha256LocalFileUri(compressed.uri));
      }
      const uploadName =
        compressed.mimeType === "image/jpeg" && !/\.(jpe?g)$/i.test(imageUri)
          ? `photo_${Date.now()}.jpg`
          : `photo_${Date.now()}.${compressed.mimeType === "image/png" ? "png" : "jpg"}`;

      const up = await uploadImageForAi(compressed.uri, uploadName, compressed.mimeType, token, {
        contentHash,
        patientId,
      });
      if (!up.ok) {
        return { ok: false, phase: "upload", message: up.message };
      }
      fileUrl = up.url.split("?")[0];
    }
  } else {
    const compressed = await compressImageForAi(imageUri, mimeGuess);
    contentHash = normalizeContentHash(await sha256LocalFileUri(compressed.uri));
    const uploadName = `photo_${Date.now()}.jpg`;
    const up = await uploadImageForAi(compressed.uri, uploadName, compressed.mimeType, token, {
      contentHash: contentHash || undefined,
      patientId,
    });
    if (!up.ok) {
      return { ok: false, phase: "upload", message: up.message };
    }
    fileUrl = up.url.split("?")[0];
  }

  const userLocation = await getUserLocationForAnalysis();
  const effectiveLang = (lang && String(lang).trim()) || "en";
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
  try {
    const aiRes = await fetch(`${API_BASE}/api/chat/ai-analyze`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        patientId,
        imageUrl: fileUrl,
        photoType,
        userLocation,
        preferredCountry: null,
        lang: effectiveLang,
        forceReanalyze: forceReanalyze === true,
        contentHash: contentHash || undefined,
      }),
      signal: controller.signal,
    });
    const rawText = await aiRes.text().catch((e) => `[text() failed: ${(e as Error).message}]`);
    let aiData: Record<string, unknown> = {};
    try {
      aiData = JSON.parse(rawText) as Record<string, unknown>;
    } catch {
      return { ok: false, phase: "parse", message: rawText.slice(0, 200), status: aiRes.status };
    }
    if (!aiRes.ok) {
      return {
        ok: false,
        phase: "analyze",
        message: String(aiData.message || aiData.error || rawText.slice(0, 200)),
        status: aiRes.status,
        aiData,
      };
    }
    return { ok: true, fileUrl, aiData };
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    return {
      ok: false,
      phase: "analyze",
      message: aborted ? "timeout" : String((e as Error)?.message || e),
    };
  } finally {
    clearTimeout(tid);
  }
}
