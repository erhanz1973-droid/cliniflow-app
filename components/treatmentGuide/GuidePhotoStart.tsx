import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/language-context";

type Props = {
  hasPhoto: boolean;
  onTakePhoto: () => void;
  onUploadPhoto: () => void;
  uploading?: boolean;
  showAnalyzeAgain?: boolean;
  onAnalyzeAgain?: () => void;
  /** Section provides heading — show actions only */
  embedded?: boolean;
};

export function GuidePhotoStart({
  hasPhoto,
  onTakePhoto,
  onUploadPhoto,
  uploading,
  showAnalyzeAgain,
  onAnalyzeAgain,
  embedded,
}: Props) {
  const { t } = useLanguage();

  return (
    <View style={embedded ? styles.embedded : styles.card}>
      {!embedded ? (
        <>
          <Text style={styles.title}>{t("treatmentGuide.photoStart.title")}</Text>
          <Text style={styles.hint}>{t("treatmentGuide.photoStart.hint")}</Text>
        </>
      ) : null}

      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={onTakePhoto}
        activeOpacity={0.88}
        disabled={uploading}
      >
        {uploading ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <Ionicons name="camera" size={20} color="#fff" />
            <Text style={styles.primaryBtnText}>{t("treatmentGuide.photoStart.takePhoto")}</Text>
          </>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={onUploadPhoto}
        activeOpacity={0.88}
        disabled={uploading}
      >
        <Ionicons name="images-outline" size={20} color="#2563eb" />
        <Text style={styles.secondaryBtnText}>{t("treatmentGuide.photoStart.uploadPhoto")}</Text>
      </TouchableOpacity>

      {hasPhoto && !uploading ? (
        <Text style={styles.addedHint}>{t("treatmentGuide.photoStart.addedHint")}</Text>
      ) : hasPhoto && uploading ? (
        <Text style={styles.addedHint}>{t("treatmentGuide.analysis.preparing")}</Text>
      ) : (
        <Text style={styles.optionalNote}>{t("treatmentGuide.photoOptional")}</Text>
      )}

      {showAnalyzeAgain && onAnalyzeAgain ? (
        <TouchableOpacity
          style={styles.analyzeAgainBtn}
          onPress={onAnalyzeAgain}
          activeOpacity={0.88}
          disabled={uploading}
        >
          <Text style={styles.analyzeAgainText}>{t("treatmentGuide.photoStart.analyzeAgain")}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  embedded: {},
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0f172a", marginBottom: 6 },
  hint: { fontSize: 13, color: "#64748b", lineHeight: 19, marginBottom: 14 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 10,
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
  optionalNote: { fontSize: 12, color: "#94a3b8", marginTop: 12, lineHeight: 17, fontStyle: "italic" },
  addedHint: { fontSize: 12, color: "#059669", marginTop: 12, fontWeight: "600" },
  analyzeAgainBtn: {
    marginTop: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  analyzeAgainText: { fontSize: 13, fontWeight: "600", color: "#64748b" },
});
