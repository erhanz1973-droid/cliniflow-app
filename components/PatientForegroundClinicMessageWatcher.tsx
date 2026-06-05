import { useEffect } from "react";
import { useAuth } from "../lib/auth";
import { invalidatePatientInboxUnreadCache } from "../lib/patientInboxUnread";
import { subscribeOfferUnreadEvents } from "../lib/offerUnreadEvents";

/**
 * Foreground patient offer awareness: silent inbox cache refresh only.
 * Push sound plays when the app is backgrounded via the OS notification channel.
 */
export function PatientForegroundClinicMessageWatcher() {
  const { isPatient, isAuthReady } = useAuth();

  useEffect(() => {
    if (!isAuthReady || !isPatient) return;
    return subscribeOfferUnreadEvents((ev) => {
      if (ev.recipient !== "patient") return;
      invalidatePatientInboxUnreadCache();
    });
  }, [isAuthReady, isPatient]);

  return null;
}
