import React, { useCallback, useMemo } from "react";
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
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "expo-router";
import { useLanguage } from "../../../lib/language-context";
import { returnFromSmileCapture } from "../../../lib/dentalPhotoNavigation";
import { leaveToPatientHome } from "../../../lib/safePatientNavigation";
import { SmilePhotoCaptureGuidance } from "../../../components/smile/SmilePhotoCaptureGuidance";
import { SmilePhotoCaptureMotivation } from "../../../components/smile/SmilePhotoCaptureMotivation";
import {
  pickIntakeImageFromLibrary,
  pickIntakeImageFromCamera,
} from "../../../lib/treatmentGuide/uploadDocument";
import {
  DEFAULT_SMILE_PHOTO_CAPTURE_MODE,
  smilePhotoCaptureLabelKeys,
  type SmilePhotoCaptureMode,
} from "../../../lib/smilePhotoCapture";
import { useSmilePhotoPair } from "../../../lib/smilePhotoPair";

/**
 * Smile photo capture — step 1 (smile) or step 2 (teeth close-up).
 */
export default function DentalCameraScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { smileUri, teethUri } = useSmilePhotoPair();

  const mode: SmilePhotoCaptureMode = useMemo(() => {
    const m = String(params.mode || "").trim();
    return m === "closeup_teeth" ? "closeup_teeth" : DEFAULT_SMILE_PHOTO_CAPTURE_MODE;
  }, [params.mode]);

  const labels = useMemo(() => smilePhotoCaptureLabelKeys(mode), [mode]);
  const screenTitle = t(labels.captureTitle);

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
      returnFromSmileCapture(router, {
        mode,
        uri,
        smileUri,
        teethUri,
      });
    },
    [router, mode, smileUri, teethUri],
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
        <Text style={styles.headerTitle}>{screenTitle}</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.stepHeader}>
          <Text style={styles.stepLabel}>{t(labels.stepTitle)}</Text>
          <Text style={styles.stepPurpose}>{t(labels.purpose)}</Text>
        </View>

        {mode === "smile" ? <SmilePhotoCaptureMotivation /> : null}
        <SmilePhotoCaptureGuidance mode={mode} />

        <TouchableOpacity style={styles.primaryBtn} onPress={() => void openCamera()} activeOpacity={0.88}>
          <Ionicons name="camera" size={20} color="#fff" />
          <Text style={styles.primaryBtnText}>{t(labels.takePhoto)}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={() => void openGallery()} activeOpacity={0.88}>
          <Ionicons name="images-outline" size={20} color="#2563eb" />
          <Text style={styles.secondaryBtnText}>{t(labels.uploadPhoto)}</Text>
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
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#0f172a", flex: 1, textAlign: "center" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 28 },
  stepHeader: { gap: 6, marginBottom: 2 },
  stepLabel: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  stepPurpose: { fontSize: 14, color: "#64748b", lineHeight: 20 },
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
