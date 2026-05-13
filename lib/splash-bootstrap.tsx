import { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";

/**
 * One-time splash hide — lives outside `app/_layout.tsx` so the root layout stays hook-free besides providers.
 */
export function SplashBootstrap() {
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await SplashScreen.preventAutoHideAsync();
      } catch {
        /* already prevented or unsupported */
      }
      if (cancelled) return;
      try {
        await SplashScreen.hideAsync();
      } catch {
        /* no native splash for this VC — ignore */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
