import AsyncStorage from "@react-native-async-storage/async-storage";

type OnboardingStateV1 = { v: 1; completed: boolean; skippedDental?: boolean };

function key(patientId: string) {
  return `cliniflow.patient_onboarding_v1.${String(patientId || "").trim()}`;
}

export async function getPatientOnboardingState(
  patientId: string
): Promise<OnboardingStateV1 | null> {
  const pid = String(patientId || "").trim();
  if (!pid) return null;
  try {
    const raw = await AsyncStorage.getItem(key(pid));
    if (!raw) return null;
    const p = JSON.parse(raw) as OnboardingStateV1;
    return p && p.v === 1 && p.completed ? p : null;
  } catch {
    return null;
  }
}

export async function shouldShowPatientOnboarding(patientId: string): Promise<boolean> {
  const s = await getPatientOnboardingState(patientId);
  return !s?.completed;
}

export async function markPatientOnboardingComplete(
  patientId: string,
  extra?: { skippedDental?: boolean }
): Promise<void> {
  const pid = String(patientId || "").trim();
  if (!pid) return;
  const state: OnboardingStateV1 = {
    v: 1,
    completed: true,
    skippedDental: !!extra?.skippedDental,
  };
  await AsyncStorage.setItem(key(pid), JSON.stringify(state));
}

export async function shouldShowDentalScanReminder(patientId: string): Promise<boolean> {
  const s = await getPatientOnboardingState(patientId);
  return !!(s?.completed && s?.skippedDental);
}

/** Call when patient has uploaded dental/clinical photos — hide soft reminder. */
export async function clearDentalScanReminder(patientId: string): Promise<void> {
  const pid = String(patientId || "").trim();
  if (!pid) return;
  const s = await getPatientOnboardingState(pid);
  if (!s) return;
  await AsyncStorage.setItem(
    key(pid),
    JSON.stringify({ v: 1, completed: true, skippedDental: false })
  );
}
