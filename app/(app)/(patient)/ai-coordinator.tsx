import { useEffect } from "react";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

/** Legacy route — forwards to unified Treatment Guide. */
export default function AiCoordinatorRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<{ clinicId?: string; clinic_id?: string; imageUri?: string }>();

  useEffect(() => {
    router.replace({
      pathname: "/(patient)/treatment-guide",
      params: {
        ...(params.clinicId ? { clinicId: String(params.clinicId) } : {}),
        ...(params.clinic_id ? { clinic_id: String(params.clinic_id) } : {}),
        ...(typeof params.imageUri === "string" && params.imageUri.trim()
          ? { imageUri: params.imageUri.trim() }
          : {}),
      },
    } as never);
  }, [router, params.clinicId, params.clinic_id, params.imageUri]);

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#2563eb" />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8fafc" },
});
