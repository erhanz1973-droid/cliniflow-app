import type { Router } from "expo-router";
import { Alert } from "react-native";

import { fetchRequestMessagingMeta } from "./offerMessagingMeta";

export type OpenCoordinationContext = {
  requestId: string;
  patientId?: string | null;
  patientName?: string;
};

/** Doctor → Incoming Requests → AI coordination supervision (same patient thread as the request). */
export function openDoctorCoordinationWorkspace(
  router: Pick<Router, "push">,
  ctx: OpenCoordinationContext,
  token: string,
  t: (key: string) => string,
): void {
  const go = (patientId: string) => {
    router.push({
      pathname: "/doctor/coordination",
      params: {
        patientId,
        patientName: ctx.patientName || "Patient",
        requestId: ctx.requestId,
      },
    } as never);
  };

  const direct = String(ctx.patientId || "").trim();
  if (direct) {
    go(direct);
    return;
  }

  void fetchRequestMessagingMeta(token, ctx.requestId).then((meta) => {
    const resolved = meta?.patient_id ? String(meta.patient_id).trim() : "";
    if (resolved) {
      go(resolved);
      return;
    }
    Alert.alert(
      t("doctor.coordination.unavailableTitle") !== "doctor.coordination.unavailableTitle"
        ? t("doctor.coordination.unavailableTitle")
        : "Koordinasyon",
      t("doctor.coordination.unavailableBody") !== "doctor.coordination.unavailableBody"
        ? t("doctor.coordination.unavailableBody")
        : "Bu talep için hasta kimliği henüz hazır değil. Önce mesajlaşmayı başlatın.",
    );
  });
}
