import { useEffect } from "react";
import { useAuth } from "../lib/auth";
import { hydrateClinicStore } from "../store/useClinicStore";
import { refreshActiveClinicFromApi } from "../lib/fetchPatientMyClinic";

/** Hydrate cached clinic + refresh from API when a patient session is active. */
export function ClinicBootstrap() {
  const { user, isAuthReady } = useAuth();

  useEffect(() => {
    void hydrateClinicStore();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user?.token) return;
    if (String(user.type || "").toLowerCase() !== "patient") return;
    void refreshActiveClinicFromApi(user.token);
  }, [isAuthReady, user?.token, user?.type]);

  return null;
}
