import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAuthSession } from "../lib/auth";
import { fetchPatientInboxUnreadTotal, invalidatePatientInboxUnreadCache } from "../lib/patientInboxUnread";
import { emitOfferUnreadEvent, subscribeOfferUnreadEvents } from "../lib/offerUnreadEvents";
import { playInAppNewMessageSoundDebouncedForThread } from "../lib/playInAppMessageSound";

const POLL_MS = 24_000;

/**
 * Foreground patient offer inbox awareness: polls inbox-summary and plays sound on increase.
 */
export function PatientOfferUnreadWatcher() {
  const { token: sessionToken, isPatient } = useAuthSession();
  const token = sessionToken.trim();
  const prevRef = useRef(0);
  const primedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const poll = useCallback(async () => {
    if (!token || !isPatient) return;
    if (appStateRef.current !== "active") return;
    try {
      const total = await fetchPatientInboxUnreadTotal(token);
      if (primedRef.current && total > prevRef.current) {
        playInAppNewMessageSoundDebouncedForThread("patient_offer_inbox", 2800);
        emitOfferUnreadEvent({ type: "offer_activity", recipient: "patient" });
      }
      prevRef.current = total;
      primedRef.current = true;
    } catch {
      /* ignore */
    }
  }, [token, isPatient]);

  useEffect(() => {
    if (!token || !isPatient) {
      prevRef.current = 0;
      primedRef.current = false;
    }
  }, [token, isPatient]);

  useEffect(() => {
    if (!token || !isPatient) return;
    return subscribeOfferUnreadEvents((ev) => {
      if (ev.recipient !== "patient") return;
      if (ev.type === "offer_mark_read") invalidatePatientInboxUnreadCache();
    });
  }, [token, isPatient]);

  useEffect(() => {
    if (!token || !isPatient) return;
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    const sub = AppState.addEventListener("change", (s) => {
      appStateRef.current = s;
      if (s === "active") void poll();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [token, isPatient, poll]);

  return null;
}
