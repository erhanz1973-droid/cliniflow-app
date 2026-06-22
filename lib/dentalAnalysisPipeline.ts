/**
 * Shared Camera → Analysis AI pipeline (upload + ai-analyze).
 * Idempotent: same image bytes → one upload, one analysis (unless forceReanalyze).
 */
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { API_BASE } from "./api";
import {
  sha256LocalFileUri,
  normalizeContentHash,
  combineContentHashes,
} from "./treatmentGuide/imageContentHash";
import {
  getUploadedImageByHash,
  saveUploadedImageRecord,
} from "./treatmentGuide/workflowState";
import { normalizeImageFingerprint } from "./treatmentGuide/analysisCache";
import {
  DEFAULT_SMILE_PHOTO_TYPE,
  SMILE_DUAL_ANALYSIS_MODE,
  TEETH_CLOSEUP_PHOTO_TYPE,
} from "./smilePhotoCapture";
import { isAnalysisFallbackPayload } from "./dentalAnalysisNormalize";

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
const ANALYZE_TIMEOUT_MS = 90_000;

type UploadOk = { ok: true; url: string; storagePath?: string; reused?: boolean };
type UploadErr = { ok: false; message: string; aborted?: boolean };

const uploadInFlightByPatient = new Map<string, Promise<UploadOk | UploadErr>>();

/** Cache/dedupe key — strip signed token only; keep path stable. */
function stableRemoteUrlKey(url: string): string {
  return String(url || "").trim().split("?")[0];
}

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
  opts?: { contentHash?: string | null; patientId?: string; photoType?: string },
): Promise<UploadOk | UploadErr> {
  const patientId = String(opts?.patientId || "").trim();
  const contentHash = normalizeContentHash(opts?.contentHash);

  if (contentHash && patientId) {
    const local = await getUploadedImageByHash(patientId, contentHash);
    if (local?.remoteUrl) {
      return {
        ok: true,
        url: local.remoteUrl,
        storagePath: local.storagePath,
        reused: true,
      };
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
    const photoType = String(opts?.photoType || "").trim();
    if (photoType) formData.append("photoType", photoType);

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
      const url = String(json.url || json.imageUrl || "");
      const storagePath = String(json.path || json.storagePath || "").trim() || undefined;
      const reused = json.reused === true;
      if (contentHash && patientId) {
        await saveUploadedImageRecord(patientId, {
          contentHash,
          remoteUrl: stableRemoteUrlKey(url),
          storagePath,
          fingerprint: normalizeImageFingerprint(uri),
          uploadedAt: Date.now(),
        });
      }
      return { ok: true as const, url, storagePath, reused };
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
  errorCode?: string;
  retryable?: boolean;
  aiData?: Record<string, unknown>;
};

export type AnalyzePhotoResult = AnalyzePhotoOk | AnalyzePhotoErr;

export async function analyzePhoto(params: {
  imageUri: string;
  patientId: string;
  token: string;
  sessionId?: string | null;
  photoType?: string;
  lang?: string;
  forceReanalyze?: boolean;
  contentHash?: string | null;
}): Promise<AnalyzePhotoResult> {
  const {
    imageUri,
    patientId,
    token,
    sessionId,
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

  let analyzeImageUrl: string;
  let storagePath: string | undefined;
  if (isAlreadyUploadedRemoteUrl(imageUri)) {
    analyzeImageUrl = String(imageUri).trim();
    const refPath = analyzeImageUrl.split("?")[0];
    const m = refPath.match(/\/storage\/v1\/object\/(?:sign|public)\/[^/]+\/(.+)$/i);
    if (m?.[1]) storagePath = decodeURIComponent(m[1]);
  } else if (contentHash) {
    const prior = await getUploadedImageByHash(patientId, contentHash);
    if (prior?.remoteUrl) {
      analyzeImageUrl = prior.remoteUrl;
      storagePath = prior.storagePath;
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
      analyzeImageUrl = up.url;
      storagePath = up.storagePath;
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
    analyzeImageUrl = up.url;
    storagePath = up.storagePath;
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
        imageUrl: analyzeImageUrl,
        storagePath: storagePath || undefined,
        sessionId: sessionId || undefined,
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
      const errCode = String(aiData.error || "");
      return {
        ok: false,
        phase: "analyze",
        message: String(aiData.message || aiData.error || rawText.slice(0, 200)),
        status: aiRes.status,
        errorCode: errCode || undefined,
        retryable: aiData.retryable === true || errCode === "image_fetch_failed",
        aiData,
      };
    }
    return { ok: true, fileUrl: stableRemoteUrlKey(analyzeImageUrl), aiData };
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

async function ensureUploadedForAnalyze(
  imageUri: string,
  patientId: string,
  token: string,
  contentHashIn?: string | null,
  photoType?: string,
): Promise<
  | { ok: true; url: string; storagePath?: string; contentHash: string }
  | { ok: false; phase: "upload"; message: string }
> {
  let contentHash = normalizeContentHash(contentHashIn);
  const mimeGuess =
    /\.png(\?|$)/i.test(imageUri) ? "image/png" :
    /\.heic(\?|$)/i.test(imageUri) ? "image/heic" :
    "image/jpeg";

  if (isAlreadyUploadedRemoteUrl(imageUri)) {
    return {
      ok: true,
      url: String(imageUri).trim(),
      contentHash: contentHash || "",
    };
  }

  if (!contentHash) {
    const compressedProbe = await compressImageForAi(imageUri, mimeGuess);
    contentHash = normalizeContentHash(await sha256LocalFileUri(compressedProbe.uri));
  }

  const prior = contentHash ? await getUploadedImageByHash(patientId, contentHash) : null;
  if (prior?.remoteUrl) {
    return {
      ok: true,
      url: prior.remoteUrl,
      storagePath: prior.storagePath,
      contentHash,
    };
  }

  const compressed = await compressImageForAi(imageUri, mimeGuess);
  if (!contentHash) {
    contentHash = normalizeContentHash(await sha256LocalFileUri(compressed.uri));
  }
  const uploadName = `photo_${Date.now()}.jpg`;
  const up = await uploadImageForAi(compressed.uri, uploadName, compressed.mimeType, token, {
    contentHash,
    patientId,
    photoType,
  });
  if (!up.ok) {
    return { ok: false, phase: "upload", message: up.message };
  }
  return {
    ok: true,
    url: up.url,
    storagePath: up.storagePath,
    contentHash,
  };
}

/** Two-photo smile analysis: smiling face + teeth close-up. */
export async function analyzeDualSmilePhotos(params: {
  smileUri: string;
  teethUri: string;
  patientId: string;
  token: string;
  sessionId?: string | null;
  lang?: string;
  forceReanalyze?: boolean;
  smileContentHash?: string | null;
  teethContentHash?: string | null;
}): Promise<AnalyzePhotoResult> {
  const {
    smileUri,
    teethUri,
    patientId,
    token,
    sessionId,
    lang,
    forceReanalyze = false,
    smileContentHash: smileHashIn,
    teethContentHash: teethHashIn,
  } = params;

  if (!String(patientId || "").trim()) {
    return { ok: false, phase: "session", message: "no_patient" };
  }
  if (!String(smileUri || "").trim() || !String(teethUri || "").trim()) {
    return { ok: false, phase: "session", message: "both_photos_required" };
  }

  const smileUp = await ensureUploadedForAnalyze(
    smileUri,
    patientId,
    token,
    smileHashIn,
    DEFAULT_SMILE_PHOTO_TYPE,
  );
  if (!smileUp.ok) {
    return { ok: false, phase: smileUp.phase, message: smileUp.message };
  }
  const teethUp = await ensureUploadedForAnalyze(
    teethUri,
    patientId,
    token,
    teethHashIn,
    TEETH_CLOSEUP_PHOTO_TYPE,
  );
  if (!teethUp.ok) {
    return { ok: false, phase: teethUp.phase, message: teethUp.message };
  }

  const combinedHash = await combineContentHashes(smileUp.contentHash, teethUp.contentHash);
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
        imageUrl: smileUp.url,
        storagePath: smileUp.storagePath || undefined,
        teethImageUrl: teethUp.url,
        teethStoragePath: teethUp.storagePath || undefined,
        teethContentHash: teethUp.contentHash || undefined,
        sessionId: sessionId || undefined,
        photoType: DEFAULT_SMILE_PHOTO_TYPE,
        analysisMode: SMILE_DUAL_ANALYSIS_MODE,
        userLocation,
        preferredCountry: null,
        lang: effectiveLang,
        forceReanalyze: forceReanalyze === true,
        contentHash: combinedHash || undefined,
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
      const errCode = String(aiData.error || "");
      return {
        ok: false,
        phase: "analyze",
        message: String(aiData.message || aiData.error || rawText.slice(0, 200)),
        status: aiRes.status,
        errorCode: errCode || undefined,
        retryable: aiData.retryable === true || errCode === "image_fetch_failed",
        aiData,
      };
    }
    if (isAnalysisFallbackPayload(aiData)) {
      return {
        ok: false,
        phase: "analyze",
        message: String(aiData.summary || aiData.message || "analysis_failed"),
        errorCode: "analysis_fallback",
        aiData,
      };
    }
    return {
      ok: true,
      fileUrl: stableRemoteUrlKey(smileUp.url),
      aiData: {
        ...aiData,
        teethImageUrl: teethUp.url,
        smileImageUrl: smileUp.url,
      },
    };
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
