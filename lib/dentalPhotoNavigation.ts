import type { Router } from "expo-router";
import { setLastCapturedImage } from "./lastCapturedImage";
import { setSmilePhotoPair, setSmilePhotoUri, setTeethPhotoUri } from "./smilePhotoPair";
import { goToTreatmentGuide } from "./treatmentGuideNavigation";
import type { SmilePhotoCaptureMode } from "./smilePhotoCapture";

type PatientRouter = Pick<Router, "push" | "replace" | "setParams">;

export type GoToAnalysisInput =
  | string
  | { imageUri: string }
  | { smileUri: string; teethUri?: string | null };

function resolveImageUri(input: GoToAnalysisInput): string {
  if (typeof input === "string") return String(input || "").trim();
  if ("imageUri" in input) return String(input.imageUri || "").trim();
  return String(input.smileUri || "").trim();
}

/**
 * Camera / gallery handoff → treatment guide with smile + optional teeth URIs.
 */
export function goToAnalysis(
  router: PatientRouter,
  input: GoToAnalysisInput,
  opts?: { replace?: boolean },
) {
  if (typeof input === "object" && "smileUri" in input) {
    const smileUri = String(input.smileUri || "").trim();
    const teethUri = String(input.teethUri || "").trim() || null;
    if (!smileUri && !teethUri) {
      goToDentalCamera(router, "smile");
      return;
    }
    setSmilePhotoPair({ smileUri: smileUri || null, teethUri });
    if (smileUri) setLastCapturedImage(smileUri);
    goToTreatmentGuide(router, { smileUri, teethUri: teethUri || undefined }, opts);
    return;
  }

  const uri = resolveImageUri(input);
  if (!uri) {
    goToDentalCamera(router, "smile");
    return;
  }
  if (__DEV__) console.log("[FLOW] navigating to treatment guide", uri);
  setLastCapturedImage(uri);
  setSmilePhotoUri(uri);
  goToTreatmentGuide(router, { smileUri: uri }, opts);
}

/** Opens smile or teeth capture screen. */
export function goToDentalCamera(
  router: PatientRouter,
  mode: SmilePhotoCaptureMode = "smile",
) {
  router.push({
    pathname: "/(patient)/dental-camera" as const,
    params: { mode },
  } as any);
}

/** @deprecated Prefer goToDentalCamera — name kept for imports across the app */
export function goToCamera(router: PatientRouter) {
  goToDentalCamera(router, "smile");
}

/** Return to treatment guide after capturing one photo in the dual flow. */
export function returnFromSmileCapture(
  router: PatientRouter,
  opts: { mode: SmilePhotoCaptureMode; uri: string; smileUri?: string | null; teethUri?: string | null },
) {
  const uri = String(opts.uri || "").trim();
  if (!uri) return;
  const smileUri = opts.mode === "smile" ? uri : String(opts.smileUri || "").trim() || null;
  const teethUri = opts.mode === "closeup_teeth" ? uri : String(opts.teethUri || "").trim() || null;
  if (opts.mode === "smile") setSmilePhotoUri(uri);
  else setTeethPhotoUri(uri);
  if (smileUri) setLastCapturedImage(smileUri);
  goToTreatmentGuide(
    router,
    {
      smileUri: smileUri || undefined,
      teethUri: teethUri || undefined,
    },
    { replace: true },
  );
}
