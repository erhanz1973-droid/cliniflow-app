import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ROLE_STORAGE_KEY } from "./onboarding";

type Role = "doctor" | "patient" | null;

export default function Index() {
  const [role, setRole] = useState<Role | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.getItem(ROLE_STORAGE_KEY)
      .then((v) => setRole(v === "doctor" || v === "patient" ? v : null))
      .catch(() => setRole(null));
  }, []);

  // Still loading from AsyncStorage
  if (role === undefined) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8faff" }}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  if (role === null) return <Redirect href="/onboarding" />;
  if (role === "doctor") return <Redirect href="/login/doctor" />;
  return <Redirect href="/login/patient" />;
}
