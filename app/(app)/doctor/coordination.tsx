import { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";

import { DoctorCoordinationWorkspace } from "../../../components/DoctorCoordinationWorkspace";
import { useAuthSession } from "../../../lib/auth";
import { setAuthToken } from "../../../lib/api";
import { useLanguage } from "../../../lib/language-context";

export default function DoctorCoordinationScreen() {
  const router = useRouter();
  const { token } = useAuthSession();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{
    patientId?: string | string[];
    patientName?: string | string[];
  }>();

  const patientId = Array.isArray(params.patientId) ? params.patientId[0] : params.patientId;
  const patientName = Array.isArray(params.patientName) ? params.patientName[0] : params.patientName;

  useEffect(() => {
    if (token) setAuthToken(token);
  }, [token]);

  const title =
    patientName?.trim() ||
    (t("doctor.coordination.title") !== "doctor.coordination.title"
      ? t("doctor.coordination.title")
      : "Koordinasyon merkezi");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.back}>
            ← {t("common.back") !== "common.back" ? t("common.back") : "Geri"}
          </Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.topSpacer} />
      </View>
      {patientId ? (
        <View style={styles.workspace}>
          <DoctorCoordinationWorkspace patientId={patientId} />
        </View>
      ) : (
        <View style={styles.missing}>
          <Text style={styles.missingText}>
            {t("doctor.coordination.missingPatient") !== "doctor.coordination.missingPatient"
              ? t("doctor.coordination.missingPatient")
              : "Hasta kimliği bulunamadı."}
          </Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f3f4f6" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  back: { fontSize: 14, color: "#2563eb", fontWeight: "600", minWidth: 48 },
  title: { flex: 1, fontSize: 14, fontWeight: "700", color: "#111827", textAlign: "center" },
  topSpacer: { minWidth: 48 },
  workspace: { flex: 1, minHeight: 0 },
  missing: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  missingText: { fontSize: 14, color: "#6b7280", textAlign: "center" },
});
