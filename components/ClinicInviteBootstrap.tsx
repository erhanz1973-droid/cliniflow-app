import { useEffect } from "react";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import {
  parseClinicInviteFromUrl,
  savePendingClinicInvite,
} from "../lib/clinicInviteStorage";

/**
 * Captures clinic invite deep links and opens signup with the clinic code prefilled.
 * Uses /register-patient so store builds without /invite/[code] still work.
 */
export function ClinicInviteBootstrap() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const handleUrl = async (url: string | null) => {
      const code = parseClinicInviteFromUrl(url);
      if (!code || cancelled) return;
      await savePendingClinicInvite({ code, viaInvitation: true });
      router.replace({
        pathname: "/register-patient",
        params: { prefillClinicCode: code, fromClinicInvite: "1" },
      });
    };

    Linking.getInitialURL()
      .then((url) => handleUrl(url))
      .catch(() => {});

    const sub = Linking.addEventListener("url", (ev) => {
      void handleUrl(ev.url);
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [router]);

  return null;
}
