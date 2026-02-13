import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { useAuth } from "../lib/auth";

export default function Index() {
  const router = useRouter();
  const { user, isAuthLoading } = useAuth();

  useEffect(() => {
    if (isAuthLoading) return;

    if (!user) {
      router.replace("/login");
      return;
    }

    if (user.type === "doctor") {
      router.replace("/doctor/dashboard");
      return;
    }

    if (user.type === "patient") {
      router.replace("/(tabs)");
      return;
    }

    router.replace("/login");
  }, [isAuthLoading, user]);

  // ⚠️ Burası ÖNEMLİ
  // Asla uzun süreli loading UI gösterme
  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator />
    </View>
  );
}
