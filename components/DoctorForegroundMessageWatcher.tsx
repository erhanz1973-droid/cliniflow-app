import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus, ToastAndroid, Platform } from "react-native";
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
import { playInAppNewMessageSoundDebouncedForThread } from "../lib/playInAppMessageSound";
import {
  canonicalDoctorPatientChatKey,
  getGlobalDoctorChatPatientIdOpen,
} from "../lib/doctorChatForeground";
import { showDoctorForegroundBanner } from "../lib/doctorForegroundBannerController";
import { useLanguage } from "../lib/language-context";

const POLL_MS = 28_000;
const FOREGROUND_ALERT_DEBOUNCE_MS = 120_000;

type Snap = { lastId: string; unread: number };

function resolveThreadDisplayName(
  row: { patientName?: string | null; patientLegacyId?: string | null },
  fallback: string,
): string {
  const raw = String(row.patientName || "").trim();
  if (raw && raw !== "Hasta" && raw !== "Patient" && raw !== "—") return raw;
  const leg = String(row.patientLegacyId || "").trim();
  if (leg && !/^[0-9a-f-]{36}$/i.test(leg)) return leg;
  return fallback;
}

/**
 * App-scoped doctor messaging awareness while foregrounded: polls thread-summary and
 * plays sound + banner when activity changes (not only when chat screen is mounted).
 */
export function DoctorForegroundMessageWatcher() {
  const { token: sessionToken, isDoctor } = useAuthSession();
  const { t } = useLanguage();
  const token = sessionToken.trim();
  const snapRef = useRef<Map<string, Snap>>(new Map());
  const primedRef = useRef(false);
  const offerUnreadTotalRef = useRef(0);
  const offerUnreadPrimedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const lastForegroundAlertAtRef = useRef<Map<string, number>>(new Map());

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
        const unknownPatient =
          t("doctor.patientChat.headerSub") !== "doctor.patientChat.headerSub"
            ? t("doctor.patientChat.headerSub")
            : "Patient";
        for (const row of threads) {
          const pid = canonicalDoctorPatientChatKey(String(row.patientDbId || ""));
          if (!pid) continue;
          const lastId = String(row.lastMessage?.id || "").trim();
          const unread = Math.max(0, Number(row.unreadFromPatient) || 0);
          const prev = snapRef.current.get(pid);
          const lastChanged = lastId !== "" && lastId !== (prev?.lastId ?? "");
          if (!lastChanged) continue;
          if (openKey && openKey === pid) continue;

          resetDoctorHomeBadgeAck(["inbox", "patients"]);
          void refreshDoctorHomeBadgeLiveCounts(token);

          const now = Date.now();
          const lastAlert = lastForegroundAlertAtRef.current.get(pid) ?? 0;
          if (now - lastAlert < FOREGROUND_ALERT_DEBOUNCE_MS) continue;
          lastForegroundAlertAtRef.current.set(pid, now);

          const name = resolveThreadDisplayName(row, unknownPatient);
          const preview = String(row.lastMessage?.text || "").trim().replace(/\s+/g, " ").slice(0, 120);
          const title =
            t("doctor.foregroundChat.bannerTitle") !== "doctor.foregroundChat.bannerTitle"
              ? t("doctor.foregroundChat.bannerTitle")
              : "New message";
          const body =
            preview !== ""
              ? t("doctor.foregroundChat.bannerBodyPreview", { name, preview })
              : unread > 0
                ? t("doctor.foregroundChat.bannerBodyUnread", { name, count: String(unread) })
                : name;

          playInAppNewMessageSoundDebouncedForThread(`fg_poll:${pid}`, 2800);

          if (Platform.OS === "android") {
            ToastAndroid.show(body.slice(0, 300), ToastAndroid.SHORT);
          }
          showDoctorForegroundBanner({ title, body });
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
          playInAppNewMessageSoundDebouncedForThread("fg_offer_unread", 2800);
          const title =
            t("doctor.foregroundChat.offerTitle") !== "doctor.foregroundChat.offerTitle"
              ? t("doctor.foregroundChat.offerTitle")
              : "New offer activity";
          const body =
            t("doctor.foregroundChat.offerBody") !== "doctor.foregroundChat.offerBody"
              ? t("doctor.foregroundChat.offerBody")
              : "A patient replied to a treatment offer.";
          if (Platform.OS === "android") {
            ToastAndroid.show(body.slice(0, 300), ToastAndroid.SHORT);
          }
          showDoctorForegroundBanner({ title, body });
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
  }, [token, isDoctor, t]);

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
