import { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../lib/auth";
import { ROLE_KEY } from "./(auth)/role-select";
import { getPendingClinicInvite } from "../../lib/clinicInviteStorage";
import { getAuthenticatedHomeRoute } from "../../lib/authRouting";

export default function Index() {
  const router = useRouter();
  const { user, isAuthReady, isAuthLoading } = useAuth();

  useEffect(() => {
    if (!isAuthReady || isAuthLoading) return;

    let alive = true;

    (async () => {
      try {
        if (user?.token) {
          router.replace(getAuthenticatedHomeRoute(user) as never);
          return;
        }

        const pendingInvite = await getPendingClinicInvite();
        if (!alive) return;
        if (pendingInvite?.code) {
          router.replace({
            pathname: "/register-patient",
            params: {
              prefillClinicCode: pendingInvite.code,
              clinicCode: pendingInvite.code,
              fromClinicInvite: "1",
            },
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
  }, [router, user?.token, user?.type, user?.status, isAuthReady, isAuthLoading]);

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
