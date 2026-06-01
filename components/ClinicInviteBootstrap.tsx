import { useEffect } from "react";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import {
  parseClinicInviteFromUrl,
  savePendingClinicInvite,
} from "../lib/clinicInviteStorage";

/**
 * Captures invite deep links (clinifly://clinic-invite/CODE, https://…/invite/CODE)
 * and routes to the welcome screen while persisting the clinic code for signup.
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
        pathname: "/invite/[code]",
        params: { code },
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
