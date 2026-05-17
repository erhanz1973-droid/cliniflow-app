import type { Router } from "expo-router";

export type GoToTreatmentGuideParams = {
  clinicId?: string;
  imageUri?: string;
};

type PatientRouter = Pick<Router, "push" | "replace">;

/**
 * Unified AI Treatment Guide (analysis, intake, chat, next steps).
 */
export function goToTreatmentGuide(
  router: PatientRouter,
  params?: GoToTreatmentGuideParams,
  opts?: { replace?: boolean },
) {
  const clinicId = String(params?.clinicId || "").trim();
  const imageUri = String(params?.imageUri || "").trim();
  const href = {
    pathname: "/(patient)/treatment-guide" as const,
    params: {
      ...(clinicId ? { clinicId } : {}),
      ...(imageUri ? { imageUri } : {}),
    },
  };
  if (opts?.replace) router.replace(href as never);
  else router.push(href as never);
}
