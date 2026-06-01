import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ROLE_KEY } from "./(auth)/role-select";
import { getPendingClinicInvite } from "../../lib/clinicInviteStorage";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const pendingInvite = await getPendingClinicInvite();
        if (!alive) return;
        if (pendingInvite?.code) {
          router.replace({
            pathname: "/clinic-invite/[code]",
            params: { code: pendingInvite.code },
          });
          return;
        }
        const v = await AsyncStorage.getItem(ROLE_KEY);
        if (!alive) return;
        const role = v === "doctor" || v === "patient" ? v : null;
        if (role === null) {
          router.replace("/role-select");
        } else if (role === "doctor") {
          router.replace("/login/doctor");
        } else {
          router.replace("/login/patient");
        }
      } catch {
        if (alive) router.replace("/role-select");
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#f8faff",
      }}
    >
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );
}
