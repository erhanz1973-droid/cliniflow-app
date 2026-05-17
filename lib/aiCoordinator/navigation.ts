import type { Router } from "expo-router";
import { goToTreatmentGuide, type GoToTreatmentGuideParams } from "../treatmentGuideNavigation";

export type GoToAiCoordinatorParams = GoToTreatmentGuideParams;

/**
 * Opens the unified AI Treatment Guide (analysis, intake, embedded chat).
 */
export function goToAiCoordinator(
  router: Pick<Router, "push" | "replace">,
  params?: GoToAiCoordinatorParams,
) {
  goToTreatmentGuide(router, params);
}
