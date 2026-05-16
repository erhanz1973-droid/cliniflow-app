import { useCallback, useRef } from "react";
import { InteractionManager } from "react-native";
import { useFocusEffect } from "expo-router";

import { focusPerfMark, focusPerfStart } from "../lib/perfFocus";

type Options = {
  /** Minimum ms between focus-driven refreshes. Default 45s. */
  minIntervalMs?: number;
  /** When false, focus refresh is skipped entirely. */
  enabled?: boolean;
};

/**
 * Runs `refresh` after navigation transitions, debounced per screen.
 * Never blocks UI — caller must avoid setLoading(true) on focus.
 */
export function useDeferredFocusRefresh(
  perfLabel: string,
  refresh: () => void | Promise<void>,
  options?: Options
) {
  const lastRunRef = useRef(0);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const minMs = options?.minIntervalMs ?? 45_000;
  const enabled = options?.enabled !== false;

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;
      const endFocus = focusPerfStart(perfLabel);
      let cancelled = false;
      const task = InteractionManager.runAfterInteractions(() => {
        if (cancelled) return;
        const since = lastRunRef.current ? Date.now() - lastRunRef.current : Infinity;
        if (since < minMs) {
          focusPerfMark(`${perfLabel}:skip`, { sinceMs: since });
          endFocus();
          return;
        }
        lastRunRef.current = Date.now();
        focusPerfMark(`${perfLabel}:run`, { sinceMs: since });
        void Promise.resolve(refreshRef.current()).finally(endFocus);
      });
      return () => {
        cancelled = true;
        task.cancel();
        endFocus();
      };
    }, [perfLabel, enabled, minMs])
  );
}
