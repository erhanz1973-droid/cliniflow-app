import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus, ToastAndroid, Platform } from "react-native";
import { useAuth } from "../lib/auth";
import {
  fetchDoctorThreadSummary,
  invalidateDoctorThreadSummaryCacheOnly,
} from "../lib/doctorMessaging";
import { playInAppNewMessageSoundDebouncedForThread } from "../lib/playInAppMessageSound";
import {
  canonicalDoctorPatientChatKey,
  getGlobalDoctorChatPatientIdOpen,
} from "../lib/doctorChatForeground";
import { showDoctorForegroundBanner } from "../lib/doctorForegroundBannerController";
import { useLanguage } from "../lib/language-context";

const POLL_MS = 22_000;

type Snap = { lastId: string; unread: number };

/**
 * App-scoped doctor messaging awareness while foregrounded: polls thread-summary and
 * plays sound + banner when activity changes (not only when chat screen is mounted).
 */
export function DoctorForegroundMessageWatcher() {
  const { user, isDoctor } = useAuth();
  const { t } = useLanguage();
  const token = user?.token?.trim() ?? "";
  const snapRef = useRef<Map<string, Snap>>(new Map());
  const primedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!token || !isDoctor) {
      snapRef.current = new Map();
      primedRef.current = false;
    }
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
        let bustThreadSummary = false;
        for (const row of threads) {
          const pid = canonicalDoctorPatientChatKey(String(row.patientDbId || ""));
          if (!pid) continue;
          const lastId = String(row.lastMessage?.id || "").trim();
          const unread = Math.max(0, Number(row.unreadFromPatient) || 0);
          const prev = snapRef.current.get(pid);
          const lastChanged = lastId !== "" && lastId !== (prev?.lastId ?? "");
          const unreadUp = unread > (prev?.unread ?? 0);
          if (!lastChanged && !unreadUp) continue;
          if (openKey && openKey === pid) continue;

          bustThreadSummary = true;

          const name = String(row.patientName || "").trim() || "—";
          const preview = String(row.lastMessage?.text || "").trim().replace(/\s+/g, " ").slice(0, 120);
          const title =
            t("doctor.foregroundChat.bannerTitle") !== "doctor.foregroundChat.bannerTitle"
              ? t("doctor.foregroundChat.bannerTitle")
              : "New chat activity";
          const body =
            preview !== ""
              ? `${name}: ${preview}`
              : `${name}${unreadUp ? ` · ${unread}` : ""}`;

          playInAppNewMessageSoundDebouncedForThread(`fg_poll:${pid}`, 2800);

          if (Platform.OS === "android") {
            ToastAndroid.show(body.slice(0, 300), ToastAndroid.SHORT);
          }
          showDoctorForegroundBanner({ title, body });
        }
        if (bustThreadSummary) invalidateDoctorThreadSummaryCacheOnly();
      }

      snapRef.current = newMap;
      primedRef.current = true;
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
      if (s === "active") void poll({ forceRefresh: true });
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [token, isDoctor, poll]);

  return null;
}
