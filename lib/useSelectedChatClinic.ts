import { useState, useEffect } from "react";
import {
  loadSelectedChatClinic,
  saveSelectedChatClinic,
  type SelectedClinic,
} from "./selectedChatClinic";

type UserLite = { clinicId?: string; clinicCode?: string } | null | undefined;

type RouteLite = {
  clinicId?: string;
  clinic_id?: string;
  clinicCode?: string;
};

/**
 * Resolves the clinic to attach to patient chat sends:
 * 1) deep link / screen param clinic id
 * 2) user's joined clinic (JWT / auth)
 * 3) persisted selection (e.g. lead flow before membership updates)
 */
export function useSelectedChatClinic(user: UserLite, routeParams: RouteLite) {
  const [selectedClinic, setSelectedClinic] = useState<SelectedClinic | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const paramId = String(routeParams.clinicId || routeParams.clinic_id || "").trim();
      const paramCode = String(routeParams.clinicCode || "").trim();
      if (paramId) {
        const sc: SelectedClinic = {
          id: paramId,
          clinic_code: paramCode || undefined,
        };
        if (!cancelled) {
          setSelectedClinic(sc);
          setReady(true);
        }
        await saveSelectedChatClinic(sc);
        return;
      }

      const uid = user?.clinicId && String(user.clinicId).trim();
      if (uid) {
        const sc: SelectedClinic = {
          id: uid,
          clinic_code: user?.clinicCode ? String(user.clinicCode).trim() : undefined,
        };
        if (!cancelled) {
          setSelectedClinic(sc);
          setReady(true);
        }
        await saveSelectedChatClinic(sc);
        return;
      }

      const fromStore = await loadSelectedChatClinic();
      if (fromStore?.id) {
        if (!cancelled) {
          setSelectedClinic(fromStore);
          setReady(true);
        }
        return;
      }

      if (!cancelled) {
        setSelectedClinic(null);
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    user?.clinicId,
    user?.clinicCode,
    routeParams.clinicId,
    routeParams.clinic_id,
    routeParams.clinicCode,
  ]);

  return { selectedClinic, setSelectedClinic, ready };
}
