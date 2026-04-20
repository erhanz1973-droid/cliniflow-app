import React, { useCallback, useEffect, useRef } from "react";
import {
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  BackHandler,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useLanguage } from "../../lib/language-context";
import { goToAnalysis } from "../../lib/dentalPhotoNavigation";
import { leaveToPatientHome } from "../../lib/safePatientNavigation";

/**
 * Camera → Analysis (never opens Messages).
 * Opens system camera shortly after mount (same UX as former openCamera on Messages).
 */
export default function DentalCameraScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const launchedRef = useRef(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      leaveToPatientHome(router);
      return true;
    });
    return () => sub.remove();
  }, [router]);

  const onPhotoCaptured = useCallback(
    (imageUri: string) => {
      const uri = String(imageUri || "").trim();
      if (!uri) return;
      goToAnalysis(router, { imageUri: uri }, { replace: true });
    },
    [router]
  );

  const openCamera = useCallback(async () => {
    const camPerm = await ImagePicker.requestCameraPermissionsAsync();
    if (!camPerm.granted) {
      Alert.alert(
        t("messages.permissionRequired"),
        t("messages.cameraPermission") || "Kamera erişimine izin verin."
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
    });
    if (!result.canceled && result.assets[0]?.uri) {
      onPhotoCaptured(result.assets[0].uri);
    } else {
      leaveToPatientHome(router);
    }
  }, [onPhotoCaptured, router, t]);

  useEffect(() => {
    if (launchedRef.current) return;
    launchedRef.current = true;
    const tmr = setTimeout(() => {
      void openCamera();
    }, 320);
    return () => clearTimeout(tmr);
  }, [openCamera]);

  return (
    <SafeAreaView style={styles.center} edges={["top", "bottom", "left", "right"]}>
      <ActivityIndicator size="large" color="#2563eb" />
      <Text style={styles.hint}>{t("messages.photoToSend")}</Text>
      <TouchableOpacity style={styles.btn} onPress={openCamera} activeOpacity={0.88}>
        <Text style={styles.btnText}>{t("messages.intraoral.capture")}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    padding: 24,
    gap: 16,
  },
  hint: { fontSize: 14, color: "#64748b", textAlign: "center" },
  btn: {
    marginTop: 8,
    backgroundColor: "#2563eb",
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 12,
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
