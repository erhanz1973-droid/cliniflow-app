import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  normalizeClinicInviteCode,
  savePendingClinicInvite,
} from "../../../lib/clinicInviteStorage";

/**
 * Alias for https://…/invite/CLINIC_CODE and clinifly://invite/CLINIC_CODE
 * (QR / web landing URL). Forwards to patient signup with clinic code prefilled.
 */
export default function ClinicInviteUrlAliasScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = normalizeClinicInviteCode(
    Array.isArray(params.code) ? params.code[0] : params.code,
  );

  useEffect(() => {
    if (!code) {
      router.replace("/role-select");
      return;
    }
    let cancelled = false;
    (async () => {
      await savePendingClinicInvite({ code, viaInvitation: true });
      if (cancelled) return;
      router.replace({
        pathname: "/register-patient",
        params: {
          prefillClinicCode: code,
          clinicCode: code,
          fromClinicInvite: "1",
        },
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [code, router]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f6f7f9" }}>
      <ActivityIndicator size="large" color="#2563EB" />
    </View>
  );
}
