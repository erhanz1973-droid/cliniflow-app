import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/language-context";
import { SmilePhotoCaptureGuidance } from "./SmilePhotoCaptureGuidance";
import {
  smilePhotoCaptureLabelKeys,
  type SmilePhotoCaptureMode,
} from "../../lib/smilePhotoCapture";

type Props = {
  stepNumber: 1 | 2;
  mode: SmilePhotoCaptureMode;
  photoUri?: string | null;
  onCapture: () => void;
  onUpload: () => void;
  onRetake?: () => void;
  disabled?: boolean;
  completed?: boolean;
};

export function SmilePhotoStepCard({
  stepNumber,
  mode,
  photoUri,
  onCapture,
  onUpload,
  onRetake,
  disabled,
  completed,
}: Props) {
  const { t } = useLanguage();
  const labels = smilePhotoCaptureLabelKeys(mode);

  return (
    <View style={[styles.card, completed && styles.cardDone]}>
      <View style={styles.headerRow}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>{stepNumber}</Text>
        </View>
        <View style={styles.headerTextCol}>
          <Text style={styles.title}>{t(labels.stepTitle)}</Text>
          <Text style={styles.captureTitle}>{t(labels.captureTitle)}</Text>
          <Text style={styles.purpose}>{t(labels.purpose)}</Text>
          {completed ? (
            <Text style={styles.doneLabel}>{t("smileDualFlow.photoAdded")}</Text>
          ) : null}
        </View>
        {completed ? (
          <Ionicons name="checkmark-circle" size={22} color="#059669" />
        ) : null}
      </View>

      {!photoUri ? (
        <>
          <SmilePhotoCaptureGuidance mode={mode} compact showModeBadge={false} />
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={onCapture}
            activeOpacity={0.88}
            disabled={disabled}
          >
            {disabled ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="camera" size={18} color="#fff" />
                <Text style={styles.primaryBtnText}>{t(labels.takePhoto)}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={onUpload}
            activeOpacity={0.88}
            disabled={disabled}
          >
            <Ionicons name="images-outline" size={18} color="#2563eb" />
            <Text style={styles.secondaryBtnText}>{t(labels.uploadPhoto)}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.previewBlock}>
          <Image source={{ uri: photoUri }} style={styles.preview} resizeMode="cover" />
          {onRetake ? (
            <TouchableOpacity style={styles.retakeBtn} onPress={onRetake} activeOpacity={0.85}>
              <Text style={styles.retakeBtnText}>{t("smileDualFlow.retake")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  cardDone: {
    borderColor: "#a7f3d0",
    backgroundColor: "#fafffe",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  headerTextCol: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: "800", color: "#0f172a" },
  captureTitle: { fontSize: 14, fontWeight: "700", color: "#334155", lineHeight: 20 },
  purpose: { fontSize: 13, color: "#64748b", lineHeight: 18 },
  doneLabel: { fontSize: 12, fontWeight: "600", color: "#059669" },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 13,
  },
  primaryBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  secondaryBtnText: { color: "#1d4ed8", fontSize: 13, fontWeight: "700" },
  previewBlock: { gap: 8 },
  preview: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
  },
  retakeBtn: { alignSelf: "flex-start", paddingVertical: 4 },
  retakeBtnText: { fontSize: 13, fontWeight: "600", color: "#2563eb" },
});
