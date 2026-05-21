import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useAuth } from "../lib/auth";
import {
  fetchPatientInboxSummary,
  invalidatePatientInboxUnreadCache,
  schedulePatientInboxSummaryRefresh,
} from "../lib/patientInboxUnread";
import { subscribeOfferUnreadEvents } from "../lib/offerUnreadEvents";

const POLL_ACTIVE_MS = 8_000;
const POLL_BACKGROUND_MS = 25_000;

/**
 * Keeps patient inbox-summary (Teklifler badge) in sync via push events + light polling.
 * Mount once in app shell — screens subscribe with subscribePatientInboxSummary.
 */
export function PatientOfferUnreadWatcher() {
  const { user, isPatient, isAuthReady } = useAuth();
  const token = String(user?.token || "").trim();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAuthReady || !isPatient || !token) return;

    const pull = () => {
      invalidatePatientInboxUnreadCache();
      void fetchPatientInboxSummary(token);
    };

    pull();

    const restartPoll = () => {
      if (pollRef.current) clearInterval(pollRef.current);
      const ms = AppState.currentState === "active" ? POLL_ACTIVE_MS : POLL_BACKGROUND_MS;
      pollRef.current = setInterval(pull, ms);
    };

    restartPoll();
    const appSub = AppState.addEventListener("change", restartPoll);

    const unsub = subscribeOfferUnreadEvents((ev) => {
      if (ev.recipient !== "patient") return;
      schedulePatientInboxSummaryRefresh(token);
    });

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      appSub.remove();
      unsub();
    };
  }, [isAuthReady, isPatient, token]);

  return null;
}
