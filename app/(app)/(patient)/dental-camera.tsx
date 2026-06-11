import React, { useCallback } from "react";
import {
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useLanguage } from "../../../lib/language-context";
import { goToAnalysis } from "../../../lib/dentalPhotoNavigation";
import { leaveToPatientHome } from "../../../lib/safePatientNavigation";
import { SmilePhotoCaptureGuidance } from "../../../components/smile/SmilePhotoCaptureGuidance";
import { SmilePhotoCaptureMotivation } from "../../../components/smile/SmilePhotoCaptureMotivation";
import { pickIntakeImageFromLibrary, pickIntakeImageFromCamera } from "../../../lib/treatmentGuide/uploadDocument";

/**
 * Smile photo capture entry — guidance first, then camera or gallery.
 */
export default function DentalCameraScreen() {
  const router = useRouter();
  const { t } = useLanguage();

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        leaveToPatientHome(router);
        return true;
      });
      return () => sub.remove();
    }, [router]),
  );

  const onPhotoReady = useCallback(
    (imageUri: string) => {
      const uri = String(imageUri || "").trim();
      if (!uri) return;
      goToAnalysis(router, { imageUri: uri }, { replace: true });
    },
    [router],
  );

  const openCamera = useCallback(async () => {
    const picked = await pickIntakeImageFromCamera();
    if (picked?.uri) onPhotoReady(picked.uri);
  }, [onPhotoReady]);

  const openGallery = useCallback(async () => {
    const picked = await pickIntakeImageFromLibrary();
    if (picked?.uri) onPhotoReady(picked.uri);
  }, [onPhotoReady]);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => leaveToPatientHome(router)}
          hitSlop={12}
          accessibilityLabel={t("common.back")}
        >
          <Ionicons name="chevron-back" size={26} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("smilePhotoGuide.screenTitle")}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <SmilePhotoCaptureMotivation />
        <SmilePhotoCaptureGuidance />

        <TouchableOpacity style={styles.primaryBtn} onPress={() => void openCamera()} activeOpacity={0.88}>
          <Ionicons name="camera" size={20} color="#fff" />
          <Text style={styles.primaryBtnText}>{t("treatmentGuide.photoStart.takePhoto")}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => void openGallery()} activeOpacity={0.88}>
          <Ionicons name="images-outline" size={20} color="#2563eb" />
          <Text style={styles.secondaryBtnText}>{t("treatmentGuide.photoStart.uploadPhoto")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#0f172a" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 28 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  secondaryBtnText: { color: "#1d4ed8", fontSize: 14, fontWeight: "700" },
});
