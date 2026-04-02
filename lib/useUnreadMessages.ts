import { useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./api";

const POLL_INTERVAL_MS = 10_000;

function storageKey(patientId: string) {
  return `@clinifly:messages_last_read_${patientId}`;
}

export function useUnreadMessages(patientId: string | undefined, token: string | undefined) {
  const [unreadCount, setUnreadCount] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchCount = useCallback(async () => {
    if (!patientId || !token) return;
    try {
      const raw = await AsyncStorage.getItem(storageKey(patientId)).catch(() => null);
      const lastRead = raw ? Number(raw) : Date.now() - 7 * 24 * 60 * 60 * 1000;

      const url = `${API_BASE}/api/patient/${patientId}/messages/unread-count?since=${lastRead}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.ok) setUnreadCount(json.count ?? 0);
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

  /** Call this when the messages screen is opened to reset the badge */
  const markRead = useCallback(async () => {
    if (!patientId) return;
    await AsyncStorage.setItem(storageKey(patientId), String(Date.now())).catch(() => {});
    setUnreadCount(0);
  }, [patientId]);

  const badgeLabel = unreadCount <= 0 ? undefined : unreadCount > 9 ? "9+" : String(unreadCount);

  return { unreadCount, badgeLabel, markRead, refresh: fetchCount };
}
