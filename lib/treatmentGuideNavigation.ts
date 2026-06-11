import type { Router } from "expo-router";

export type GoToTreatmentGuideParams = {
  clinicId?: string;
  imageUri?: string;
  smileUri?: string;
  teethUri?: string;
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
  const imageUri = String(params?.imageUri || params?.smileUri || "").trim();
  const smileUri = String(params?.smileUri || imageUri || "").trim();
  const teethUri = String(params?.teethUri || "").trim();
  const href = {
    pathname: "/(patient)/treatment-guide" as const,
    params: {
      ...(clinicId ? { clinicId } : {}),
      ...(imageUri ? { imageUri } : {}),
      ...(smileUri ? { smileUri } : {}),
      ...(teethUri ? { teethUri } : {}),
    },
  };
  if (opts?.replace) router.replace(href as never);
  else router.push(href as never);
}
