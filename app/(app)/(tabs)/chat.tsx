import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

/**
 * Legacy alias — forwards to canonical patient messages (`/(patient)/messages`).
 */
export default function LegacyTabsChatRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    clinicId?: string;
    clinic_id?: string;
    clinicCode?: string;
    patientId?: string;
    prefillComposer?: string;
    prefillText?: string;
    prefillInquiry?: string;
    offerPrefillImage?: string;
  }>();

  useEffect(() => {
    const clinicId = String(params.clinicId || params.clinic_id || "").trim();
    router.replace({
      pathname: "/(patient)/messages",
      params: {
        ...(clinicId ? { clinicId, clinic_id: clinicId } : {}),
        ...(params.clinicCode ? { clinicCode: String(params.clinicCode) } : {}),
        ...(params.patientId ? { patientId: String(params.patientId) } : {}),
        ...(params.prefillComposer ? { prefillComposer: String(params.prefillComposer) } : {}),
        ...(params.prefillText ? { prefillText: String(params.prefillText) } : {}),
        ...(params.prefillInquiry ? { prefillInquiry: String(params.prefillInquiry) } : {}),
        ...(params.offerPrefillImage ? { offerPrefillImage: String(params.offerPrefillImage) } : {}),
      },
    } as never);
  }, [
    router,
    params.clinicId,
    params.clinic_id,
    params.clinicCode,
    params.patientId,
    params.prefillComposer,
    params.prefillText,
    params.prefillInquiry,
    params.offerPrefillImage,
  ]);

    return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8faff" }}>
      <ActivityIndicator size="large" color="#2563EB" />
            </View>
  );
}
