/**
 * Shared Camera → Analysis AI pipeline (upload + ai-analyze).
 * UI layers (Alerts, chat bubbles) stay in screens.
 */
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import { API_BASE } from "./api";

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
  opts: { maxWidth?: number; quality?: number } = {}
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
      const info = await FileSystem.getInfoAsync(fileUri, { size: true });
      if (info.exists && "size" in info && (info as any).size > 0) {
        return Math.round((info as any).size / 1024);
      }
    } catch { /* non-fatal */ }
    return 0;
  };

  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
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
        const reResult = await ImageManipulator.manipulateAsync(
          result.uri,
          [],
          { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
        );
        const reSizeKB = await readSizeKB(reResult.uri);
        if (reSizeKB > 0) return { uri: reResult.uri, mimeType: "image/jpeg" };
      } catch { /* fall through */ }
    }
    return { uri: result.uri, mimeType: "image/jpeg" };
  } catch {
    return { uri, mimeType };
  }
}

const UPLOAD_TIMEOUT_MS = 90_000;
const ANALYZE_TIMEOUT_MS = 60_000;

export async function uploadImageForAi(
  uri: string,
  name: string,
  mimeType: string,
  token: string
): Promise<{ ok: true; url: string } | { ok: false; message: string; aborted?: boolean }> {
  try {
    const info = await FileSystem.getInfoAsync(uri, { size: true });
    const size = info.exists && "size" in info ? ((info as any).size as number) : 0;
    if (size === 0) {
      return { ok: false, message: "empty_file" };
    }
  } catch { /* proceed */ }

  const formData = new FormData();
  formData.append("file", { uri, name, type: mimeType } as any);
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
    let json: Record<string, any> = {};
    try {
      json = JSON.parse(rawText);
    } catch { /* */ }
    if (!res.ok || !json.url) {
      return {
        ok: false,
        message: String(json.message || json.error || rawText.slice(0, 200)),
      };
    }
    return { ok: true, url: json.url as string };
  } catch (e) {
    const aborted = (e as Error)?.name === "AbortError";
    return { ok: false, message: aborted ? "timeout" : String((e as Error)?.message || e), aborted };
  } finally {
    clearTimeout(tid);
  }
}

export type AnalyzePhotoOk = {
  ok: true;
  fileUrl: string;
  aiData: Record<string, any>;
};

export type AnalyzePhotoErr = {
  ok: false;
  phase: "session" | "upload" | "analyze" | "parse";
  message: string;
  status?: number;
  aiData?: Record<string, any>;
};

export type AnalyzePhotoResult = AnalyzePhotoOk | AnalyzePhotoErr;

export async function analyzePhoto(params: {
  imageUri: string;
  patientId: string;
  token: string;
  photoType?: string;
  /** App language: tr | en | ka | ru — sent to /api/chat/ai-analyze for localized AI */
  lang?: string;
}): Promise<AnalyzePhotoResult> {
  const { imageUri, patientId, token, photoType = "general", lang } = params;
  if (!String(patientId || "").trim()) {
    return { ok: false, phase: "session", message: "no_patient" };
  }
  if (!String(imageUri || "").trim()) {
    return { ok: false, phase: "session", message: "no_image" };
  }

  const mimeGuess =
    /\.png(\?|$)/i.test(imageUri) ? "image/png" :
    /\.heic(\?|$)/i.test(imageUri) ? "image/heic" :
    "image/jpeg";
  const compressed = await compressImageForAi(imageUri, mimeGuess);
  let uploadName =
    compressed.mimeType === "image/jpeg" && !/\.(jpe?g)$/i.test(imageUri)
      ? `photo_${Date.now()}.jpg`
      : `photo_${Date.now()}.${compressed.mimeType === "image/png" ? "png" : "jpg"}`;

  const up = await uploadImageForAi(compressed.uri, uploadName, compressed.mimeType, token);
  if (!up.ok) {
    return { ok: false, phase: "upload", message: up.message };
  }
  const fileUrl = up.url;

  const userLocation = await getUserLocationForAnalysis();
  const effectiveLang = (lang && String(lang).trim()) || "en";
  console.log("AI LANG:", effectiveLang);
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
      }),
      signal: controller.signal,
    });
    const rawText = await aiRes.text().catch((e) => `[text() failed: ${(e as Error).message}]`);
    let aiData: Record<string, any> = {};
    try {
      aiData = JSON.parse(rawText);
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
