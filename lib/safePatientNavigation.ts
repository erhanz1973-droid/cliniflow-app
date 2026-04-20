import type { Router } from "expo-router";

const PATIENT_HOME = "/(patient)/" as const;

type NavBack = { canGoBack(): boolean; goBack(): void };

/**
 * Tab / stack kökünde `router.back()` GO_BACK hatası vermesin: mümkünse pop, değilse ana sayfa.
 */
export function leaveToPatientHome(
  router: Pick<Router, "replace">,
  navigation: NavBack
) {
  if (navigation.canGoBack()) {
    navigation.goBack();
  } else {
    router.replace(PATIENT_HOME as any);
  }
}
