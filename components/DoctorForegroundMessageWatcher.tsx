import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAuthSession } from "../lib/auth";
import {
  fetchDoctorThreadSummary,
  fetchDoctorUnreadBreakdown,
  invalidateDoctorMessagingCache,
} from "../lib/doctorMessaging";
import {
  refreshDoctorHomeBadgeLiveCounts,
  resetDoctorHomeBadgeAck,
} from "../lib/doctorHomeBadges";
import { emitOfferUnreadEvent, subscribeOfferUnreadEvents } from "../lib/offerUnreadEvents";
import { syncDoctorRequestUnreadFromServer } from "../lib/doctorRequestsUnread";
import {
  canonicalDoctorPatientChatKey,
  getGlobalDoctorChatPatientIdOpen,
} from "../lib/doctorChatForeground";

const POLL_MS = 28_000;

type Snap = { lastId: string; unread: number };

/**
 * Foreground doctor messaging awareness: silent badge refresh only (no sound/banner).
 * Push sound plays when the app is backgrounded via the OS notification channel.
 */
export function DoctorForegroundMessageWatcher() {
  const { token: sessionToken, isDoctor } = useAuthSession();
  const token = sessionToken.trim();
  const snapRef = useRef<Map<string, Snap>>(new Map());
  const primedRef = useRef(false);
  const offerUnreadTotalRef = useRef(0);
  const offerUnreadPrimedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!token || !isDoctor) {
      snapRef.current = new Map();
      primedRef.current = false;
      offerUnreadTotalRef.current = 0;
      offerUnreadPrimedRef.current = false;
    }
  }, [token, isDoctor]);

  useEffect(() => {
    if (!token || !isDoctor) return;
    return subscribeOfferUnreadEvents((ev) => {
      if (ev.recipient !== "doctor") return;
      if (ev.type === "offer_mark_read") {
        invalidateDoctorMessagingCache();
      }
    });
  }, [token, isDoctor]);

  const poll = useCallback(async (opts?: { forceRefresh?: boolean }) => {
    if (!token || !isDoctor) return;
    if (appStateRef.current !== "active") return;
    try {
      /** `refresh: false` uses server+client TTL so 22s poll does not bypass thread-summary cache (was DB-heavy). */
      const data = await fetchDoctorThreadSummary(token, {
        refresh: opts?.forceRefresh === true,
        onlyActive: true,
      });
      const threads = Array.isArray(data.threads) ? data.threads : [];
      const newMap = new Map<string, Snap>();
      const openKey = getGlobalDoctorChatPatientIdOpen();

      for (const row of threads) {
        const pid = canonicalDoctorPatientChatKey(String(row.patientDbId || ""));
        if (!pid) continue;
        const lastId = String(row.lastMessage?.id || "").trim();
        const unread = Math.max(0, Number(row.unreadFromPatient) || 0);
        newMap.set(pid, { lastId, unread });
      }

      if (primedRef.current) {
        for (const row of threads) {
          const pid = canonicalDoctorPatientChatKey(String(row.patientDbId || ""));
          if (!pid) continue;
          const lastId = String(row.lastMessage?.id || "").trim();
          const unread = Math.max(0, Number(row.unreadFromPatient) || 0);
          const prev = snapRef.current.get(pid);
          const lastChanged = lastId !== "" && lastId !== (prev?.lastId ?? "");
          const unreadIncreased = unread > (prev?.unread ?? 0);
          if (!lastChanged && !unreadIncreased) continue;
          if (openKey && openKey === pid) continue;

          resetDoctorHomeBadgeAck(["inbox", "patients"]);
          void refreshDoctorHomeBadgeLiveCounts(token);
        }
      }

      snapRef.current = newMap;
      primedRef.current = true;

      try {
        const { offerUnread } = await fetchDoctorUnreadBreakdown(token);
        const prevOfferOnly = offerUnreadTotalRef.current;
        if (offerUnreadPrimedRef.current && offerUnread > prevOfferOnly) {
          resetDoctorHomeBadgeAck(["inbox", "requests"]);
          void refreshDoctorHomeBadgeLiveCounts(token);
          invalidateDoctorMessagingCache();
          void syncDoctorRequestUnreadFromServer(token);
          emitOfferUnreadEvent({ type: "offer_activity", recipient: "doctor" });
        }
        offerUnreadTotalRef.current = offerUnread;
        offerUnreadPrimedRef.current = true;
      } catch {
        /* ignore offer tally poll */
      }
    } catch {
      /* ignore */
    }
  }, [token, isDoctor]);

  useEffect(() => {
    if (!token || !isDoctor) return;
    void poll({ forceRefresh: true });
    const id = setInterval(() => void poll({ forceRefresh: false }), POLL_MS);
    const sub = AppState.addEventListener("change", (s) => {
      appStateRef.current = s;
      /** Avoid busting thread-summary cache on every resume (collides with screen back-navigation). */
      if (s === "active") void poll({ forceRefresh: false });
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [token, isDoctor, poll]);

  return null;
}
