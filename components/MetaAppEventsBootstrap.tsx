import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { logLaunchPhaseOnce } from "../lib/launchAudit";
import { initMetaAppEvents, trackMetaAppOpen } from "../lib/metaAppEvents";

/** Initializes Meta SDK after shell mount; logs App Open on foreground. */
export function MetaAppEventsBootstrap() {
  const appState = useRef(AppState.currentState);
  const initStarted = useRef(false);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;
    logLaunchPhaseOnce("Meta Bootstrap Mounted");

    let cancelled = false;
    void (async () => {
      const ok = await initMetaAppEvents();
      if (!cancelled && ok) trackMetaAppOpen();
    })();

    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        trackMetaAppOpen();
      }
      appState.current = next;
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);

  return null;
}
