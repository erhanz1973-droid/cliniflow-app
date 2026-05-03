import { API_BASE } from "./api";

export type ToothDetection = {
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  class?: string;
};

export type AnalyzeTeethResponse = {
  ok: boolean;
  teethCount?: number;
  detections?: ToothDetection[];
  imageWidth?: number;
  imageHeight?: number;
  error?: string;
  message?: string;
};

/**
 * POST JSON { image: base64 } to backend (no data: prefix required).
 */
export async function analyzeTeethBase64(
  base64: string,
  signal?: AbortSignal
): Promise<AnalyzeTeethResponse> {
  const url = `${API_BASE.replace(/\/+$/, "")}/analyze-teeth`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ image: base64 }),
    signal,
  });
  const json = (await res.json()) as AnalyzeTeethResponse;
  if (!res.ok && !json.error) {
    return { ok: false, error: "http_error", message: `HTTP ${res.status}` };
  }
  return json;
}
