import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { initMetaAppEvents, trackMetaAppOpen } from "../lib/metaAppEvents";

/** Initializes Meta SDK and logs App Open / Activate App on startup and foreground. */
export function MetaAppEventsBootstrap() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
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
