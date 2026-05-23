import { useCallback, useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";
import { getGlobalChatOpen, getGlobalOfferChatOpen } from "../hooks/chatSessionGlobal";
import { getMessageSoundPreference } from "../lib/messageSoundPreference";
import { playInAppNewMessageSoundDebouncedForThread } from "../lib/playInAppMessageSound";
import { invalidatePatientInboxUnreadCache } from "../lib/patientInboxUnread";
import { subscribeOfferUnreadEvents } from "../lib/offerUnreadEvents";

const POLL_MS = 18_000;

type ClinicMsgSnap = { lastClinicId: string; lastClinicAt: number };

function pickLastClinicInbound(messages: unknown[]): ClinicMsgSnap {
  let lastClinicId = "";
  let lastClinicAt = 0;
  for (const row of messages) {
    if (!row || typeof row !== "object") continue;
    const m = row as Record<string, unknown>;
    if (m.from_patient === true) continue;
    const fromRole = String(m.from_role || m.fromRole || "").toLowerCase();
    if (fromRole === "patient") continue;
    const id = String(m.id || m.message_id || "").trim();
    const ts = Number(m.createdAt ?? m.created_at ?? 0) || 0;
    if (!id || ts < lastClinicAt) continue;
    lastClinicId = id;
    lastClinicAt = ts;
  }
  return { lastClinicId, lastClinicAt };
}

/**
 * Foreground clinic-thread awareness for enrolled patients: plays custom in-app tone when
 * a new clinic message arrives while the main chat screen is not open.
 */
export function PatientForegroundClinicMessageWatcher() {
  const { user, isPatient, isAuthReady } = useAuth();
  const token = String(user?.token || "").trim();
  const patientId = String(user?.patientId || user?.id || "").trim();
  const clinicId = String(user?.clinicId || "").trim();
  const snapRef = useRef<ClinicMsgSnap>({ lastClinicId: "", lastClinicAt: 0 });
  const primedRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!token || !isPatient) {
      snapRef.current = { lastClinicId: "", lastClinicAt: 0 };
      primedRef.current = false;
    }
  }, [token, isPatient]);

  const poll = useCallback(async () => {
    if (!token || !isPatient || !patientId) return;
    if (appStateRef.current !== "active") return;
    if (getGlobalChatOpen() || getGlobalOfferChatOpen()) return;

    const soundOn = await getMessageSoundPreference();
    if (!soundOn) {
      primedRef.current = true;
      return;
    }

    try {
      const qp = new URLSearchParams();
      if (clinicId) {
        qp.set("clinic_id", clinicId);
        qp.set("clinicId", clinicId);
      }
      const qs = qp.toString() ? `?${qp.toString()}` : "";
      const res = await fetch(`${API_BASE}/api/patient/me/messages${qs}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const messages = Array.isArray(data.messages)
        ? data.messages
        : Array.isArray(data.items)
          ? data.items
          : [];
      const snap = pickLastClinicInbound(messages);
      if (!snap.lastClinicId) {
        primedRef.current = true;
        return;
      }

      const prev = snapRef.current;
      if (
        primedRef.current &&
        snap.lastClinicId !== prev.lastClinicId &&
        snap.lastClinicAt >= prev.lastClinicAt &&
        !getGlobalChatOpen() &&
        !getGlobalOfferChatOpen()
      ) {
        playInAppNewMessageSoundDebouncedForThread(
          `patient_clinic_fg:${patientId}:${clinicId || "default"}`,
          2800,
        );
      }

      snapRef.current = snap;
      primedRef.current = true;
    } catch {
      /* ignore */
    }
  }, [token, isPatient, patientId, clinicId]);

  useEffect(() => {
    if (!isAuthReady || !isPatient || !token) return;

    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    const appSub = AppState.addEventListener("change", (s) => {
      appStateRef.current = s;
      if (s === "active") void poll();
    });
    const unsub = subscribeOfferUnreadEvents((ev) => {
      if (ev.recipient !== "patient") return;
      invalidatePatientInboxUnreadCache();
      if (appStateRef.current === "active") void poll();
    });

    return () => {
      clearInterval(id);
      appSub.remove();
      unsub();
    };
  }, [isAuthReady, isPatient, token, poll]);

  return null;
}
