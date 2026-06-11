import type { Router } from "expo-router";
import type { SmileScoreData } from "./smileScore";

type PatientRouter = Pick<Router, "push">;

export function goToSmileAiChat(
  router: PatientRouter,
  params?: {
    clinicId?: string;
    /** JSON-stringified SmileScoreData for route params */
    smileContextJson?: string;
  },
) {
  const clinicId = String(params?.clinicId || "").trim();
  router.push({
    pathname: "/(patient)/smile-ai-chat" as const,
    params: {
      ...(clinicId ? { clinicId } : {}),
      ...(params?.smileContextJson ? { smileContextJson: params.smileContextJson } : {}),
    },
  } as never);
}

export function serializeSmileContextForRoute(data: SmileScoreData): string {
  return JSON.stringify({
    smileScore: data.smileScore,
    potentialScore: data.potentialScore,
    strengths: data.strengths,
    improvementAreas: data.improvementAreas,
    recommendations: data.recommendations,
  });
}

export function parseSmileContextFromRoute(raw: string | string[] | undefined): SmileScoreData | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s || typeof s !== "string") return null;
  try {
    const o = JSON.parse(s) as SmileScoreData;
    if (!Number.isFinite(Number(o.smileScore))) return null;
    return o;
  } catch {
    return null;
  }
}
