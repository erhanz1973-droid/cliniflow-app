/** Cross-screen signal: clinic join/leave or session patch — Home refetches /me + UI. */

type Listener = (reason: string) => void;

const listeners = new Set<Listener>();

export function subscribePatientClinicMembershipInvalidation(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function invalidatePatientClinicMembership(reason: string): void {
  __DEV__ &&
    console.log("[PATIENT_CLINIC_MEMBERSHIP]", "invalidate", reason, {
      listenerCount: listeners.size,
    });
  listeners.forEach((l) => {
    try {
      l(reason);
    } catch (e) {
      __DEV__ && console.warn("[PATIENT_CLINIC_MEMBERSHIP] listener error", e);
    }
  });
}
