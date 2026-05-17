import { useCallback, useEffect, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { API_BASE } from "../lib/api";
import { useAuth } from "../lib/auth";
import {
  derivePatientClinicMembership,
  parsePatientMeClinicFields,
  resolveLinkedClinicDisplayName,
  resolveLinkedClinicId,
  type PatientMeClinicFields,
} from "../lib/patientClinicMembership";

export function usePatientClinicMembership(routeClinicId?: string | null) {
  const { user } = useAuth();
  const [patientMe, setPatientMe] = useState<PatientMeClinicFields | null>(null);
  const [synced, setSynced] = useState(false);

  const refresh = useCallback(async () => {
    const tok = String(user?.token || "").trim();
    if (!tok) {
      setPatientMe(null);
      setSynced(true);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/patient/me`, {
        headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" },
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      setPatientMe(parsePatientMeClinicFields(json));
    } catch {
      setPatientMe(null);
    } finally {
      setSynced(true);
    }
  }, [user?.token]);

  useEffect(() => {
    setSynced(false);
    void refresh();
  }, [refresh]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const membership = useMemo(
    () => derivePatientClinicMembership({ user, patientRecord: patientMe }),
    [user, patientMe],
  );

  const linkedClinicId = useMemo(
    () =>
      resolveLinkedClinicId({
        user,
        patientRecord: patientMe,
        routeClinicId,
      }),
    [user, patientMe, routeClinicId],
  );

  const linkedClinicName = useMemo(
    () => resolveLinkedClinicDisplayName(patientMe),
    [patientMe],
  );

  return {
    ...membership,
    linkedClinicId,
    linkedClinicName,
    patientMe,
    synced,
    refresh,
  };
}
