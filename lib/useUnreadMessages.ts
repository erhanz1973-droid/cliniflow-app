import { useState, useEffect, useRef, useCallback } from "react";
import { safeGetItem, safeSetItem } from "./asyncStorageSafe";
import { API_BASE } from "./api";
import { markPatientClinicMessagesRead } from "./markChatRead";

/** Unread badge polling — keep moderate to reduce /messages/unread-count load (realtime via Socket.IO on chat screen). */
const POLL_INTERVAL_MS = 20_000;

function storageKey(patientId: string) {
  return `@clinifly:messages_last_read_${patientId}`;
}

export function useUnreadMessages(patientId: string | undefined, token: string | undefined) {
  const [unreadCount, setUnreadCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    if (!patientId || !token) return;
    try {
      const raw = await safeGetItem(storageKey(patientId));
      const lastRead = raw ? Number(raw) : Date.now() - 7 * 24 * 60 * 60 * 1000;

      const url = `${API_BASE}/api/patient/${patientId}/messages/unread-count?since=${lastRead}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.ok) {
        setUnreadCount(Number(json.count ?? 0));
      }
    } catch {
      /* ignore network errors silently */
    }
  }, [patientId, token]);

  useEffect(() => {
    if (!patientId || !token) return;
    fetchCount();
    timerRef.current = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchCount, patientId, token]);

  /** Call when the messages screen is opened to reset tab badge; never blocks on storage. */
  const markRead = useCallback(async () => {
    if (!patientId) return;
    const now = Date.now();
    void safeSetItem(storageKey(patientId), String(now));
    setUnreadCount(0);
    if (token) void markPatientClinicMessagesRead(token);
  }, [patientId, token]);

  const badgeLabel = unreadCount <= 0 ? undefined : unreadCount > 9 ? "9+" : String(unreadCount);

  return { unreadCount, badgeLabel, markRead, refresh: fetchCount };
}
