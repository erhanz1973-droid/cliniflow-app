import type { Router } from "expo-router";
import { setLastCapturedImage } from "./lastCapturedImage";

type PatientRouter = Pick<Router, "push" | "replace" | "setParams">;

export type GoToAnalysisInput = string | { imageUri: string };

function resolveImageUri(input: GoToAnalysisInput): string {
  if (typeof input === "string") return String(input || "").trim();
  return String(input.imageUri || "").trim();
}

/**
 * Camera / gallery handoff → analysis screen (review + auto API on analysis route).
 */
export function goToAnalysis(
  router: PatientRouter,
  input: GoToAnalysisInput,
  opts?: { replace?: boolean }
) {
  const uri = resolveImageUri(input);
  if (!uri) {
    goToDentalCamera(router);
    return;
  }
  if (__DEV__) console.log("[FLOW] navigating to analysis", uri);
  setLastCapturedImage(uri);
  const href = {
    pathname: "/(patient)/dental-analysis" as const,
    params: { imageUri: uri },
  };
  if (opts?.replace) router.replace(href as any);
  else router.push(href as any);
}

/** Opens in-app camera flow (never Messages). */
export function goToDentalCamera(router: PatientRouter) {
  router.push({ pathname: "/(patient)/dental-camera" as const } as any);
}

/** @deprecated Prefer goToDentalCamera — name kept for imports across the app */
export function goToCamera(router: PatientRouter) {
  goToDentalCamera(router);
}
