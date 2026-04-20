import type { Router } from "expo-router";

const PATIENT_HOME = "/(patient)/" as const;

/**
 * Hasta ana ekranına dön. `navigation.goBack()` / `GO_BACK` sekme + stack birleşiminde
 * bazen hiçbir navigator tarafından işlenmiyor; bu yüzden doğrudan replace kullanıyoruz.
 */
export function leaveToPatientHome(router: Pick<Router, "replace">) {
  router.replace(PATIENT_HOME as any);
}
