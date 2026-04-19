/**
 * Backend path: POST /api/chat/smile-simulation → cropCompositeSimulation,
 * then poll GET /api/chat/sim-status/:jobId.
 *
 * Usage from a screen (Expo):
 *   import { runSmileSimulation } from '@/lib/smileSimulation';
 *   const result = await runSmileSimulation(patientId, imageUri, { mode: 'full' });
 *
 * `imageUri` may be `file://...` (uploads via ai-upload) or `https://...`.
 * Set EXPO_PUBLIC_API_BASE to http://<LAN-IP>:<PORT> (not localhost on device).
 */
import { apiGet, apiPost, API_BASE } from "./api";
import { uploadLocalImageForAi } from "./uploadAiImage";

/** Full URL for POST smile-simulation (Metro: "USING API:" log must match this). */
export const SMILE_SIMULATION_URL = API_BASE + "/api/chat/smile-simulation";

export type SmileSimulationResult = {
  ok: boolean;
  simulatedImageUrl: string | null;
  status: string;
  error?: string;
  raw: Record<string, unknown>;
};

/** Match messages.tsx: ~3s × 35 ≈ 105s max wait for slow Replicate jobs. */
const POLL_MS = 3000;
const POLL_MAX = 35;

async function resolveImageUrl(imageUri: string): Promise<string> {
  if (imageUri.startsWith("http://") || imageUri.startsWith("https://")) {
    return imageUri;
  }
  return uploadLocalImageForAi(imageUri);
}

async function runSmileSimulationJob(params: {
  patientId: string;
  imageUrl: string;
  mode?: string;
  /** Tooth color preset: natural | bright | hollywood | soft (backend default: natural) */
  preset?: string;
}): Promise<SmileSimulationResult> {
  const body = {
    patientId: params.patientId,
    imageUrl: params.imageUrl,
    mode: params.mode ?? "full",
    preset: params.preset ?? "natural",
  };
  console.log(
    "[SIM POST] POST /api/chat/smile-simulation",
    "| preset:",
    body.preset,
    "| imageUrl:",
    (body.imageUrl || "").slice(0, 72)
  );

  const start = await apiPost<{
    ok?: boolean;
    jobId?: string;
    status?: string;
    simulatedImageUrl?: string;
    variations?: unknown[];
  }>("/api/chat/smile-simulation", body);

  // v6 compat: some backends return the image URL directly (no async job).
  if (start?.ok && start.simulatedImageUrl) {
    return {
      ok: true,
      simulatedImageUrl: start.simulatedImageUrl,
      status: "succeeded",
      raw: start as Record<string, unknown>,
    };
  }

  const jobId = start?.jobId;
  if (!jobId) {
    return {
      ok: false,
      simulatedImageUrl: null,
      status: "no_job",
      error: "smile-simulation did not return jobId",
      raw: start as Record<string, unknown>,
    };
  }

  console.log("[SIM JOB] new jobId (poll sim-status with this only):", jobId);

  for (let i = 0; i < POLL_MAX; i++) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const st = await apiGet<{
      ok?: boolean;
      status?: string;
      simulatedImageUrl?: string;
      error?: string;
      message?: string;
    }>(`/api/chat/sim-status/${jobId}`);

    if (st.status === "pending") continue;
    if (st.status === "succeeded" && st.simulatedImageUrl) {
      return {
        ok: true,
        simulatedImageUrl: st.simulatedImageUrl,
        status: "succeeded",
        raw: st as Record<string, unknown>,
      };
    }
    return {
      ok: false,
      simulatedImageUrl: null,
      status: st.status ?? "failed",
      error: st.error || st.message || "simulation_failed",
      raw: st as Record<string, unknown>,
    };
  }

  return {
    ok: false,
    simulatedImageUrl: null,
    status: "timeout",
    error: "sim-status poll timeout",
    raw: {},
  };
}

/**
 * Primary entry: resolves local camera roll URIs to HTTPS, then runs async smile job.
 * Metro should show CALLING API (from api.ts) and this log with full smile-simulation URL.
 */
export async function runSmileSimulation(
  patientId: string,
  imageUri: string,
  options?: { mode?: string; preset?: string }
): Promise<SmileSimulationResult> {
  console.log("USING API:", SMILE_SIMULATION_URL);
  const imageUrl = await resolveImageUrl(imageUri);
  return runSmileSimulationJob({
    patientId,
    imageUrl,
    mode: options?.mode,
    preset: options?.preset,
  });
}

/**
 * When you already have a remote `imageUrl` (e.g. from ai-upload).
 * POST `/api/chat/smile-simulation` with JSON:
 * `{ patientId, imageUrl, mode, preset }` (backend defaults `preset` to `"natural"`).
 */
export async function runSmileSimulationWithImageUrl(
  imageUrl: string,
  preset: string,
  patientId: string,
  mode: string = "full"
): Promise<SmileSimulationResult> {
  console.log("USING API:", SMILE_SIMULATION_URL);
  return runSmileSimulationJob({
    patientId,
    imageUrl,
    mode,
    preset: preset || "natural",
  });
}
