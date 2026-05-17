import React from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from "react-native";
import { useLanguage } from "../../lib/language-context";
import { hasVisibleAnalysisContent } from "../../lib/dentalAnalysisNormalize";

export type PhotoAnalysisUiPhase =
  | "idle"
  | "uploaded"
  | "restoring"
  | "uploading"
  | "analyzing"
  | "analyzed"
  | "failed";

type LocalizedAnalysis = {
  insights: string[];
  summary: string;
  recommendation: string;
};

type Props = {
  displayUri?: string;
  phase: PhotoAnalysisUiPhase;
  analysisPayload: Record<string, unknown> | null;
  localized: LocalizedAnalysis;
  errorText?: string | null;
  showTranslatedBadge?: boolean;
  onRetry: () => void;
  onRetakePhoto?: () => void;
  guidanceSavedAt?: string | null;
  /** Step header provided by parent — guidance body only */
  embedded?: boolean;
};

export function GuidePhotoAnalysisCard({
  displayUri,
  phase,
  analysisPayload,
  localized,
  errorText,
  showTranslatedBadge,
  onRetry,
  onRetakePhoto,
  guidanceSavedAt,
  embedded,
}: Props) {
  const { t } = useLanguage();

  const isProcessing =
    phase === "restoring" || phase === "uploading" || phase === "analyzing";
  const hasResult = hasVisibleAnalysisContent(analysisPayload);
  const showResult = hasResult && !isProcessing && !showFailed;
  const showFailed = phase === "failed";
  const showWaiting =
    !embedded &&
    !!displayUri &&
    !isProcessing &&
    !showResult &&
    !showFailed &&
    (phase === "uploaded" || phase === "idle");

  if (embedded && !showResult && !showFailed && !isProcessing) {
    if (!displayUri) {
      return (
        <Text style={styles.emptyPlaceholder}>{t("treatmentGuide.flow.step2.empty")}</Text>
      );
    }
    return (
      <Text style={styles.emptyPlaceholder}>{t("treatmentGuide.analysis.awaitingGuidance")}</Text>
    );
  }

  return (
    <View style={embedded ? styles.embedded : styles.wrap}>
      {!embedded ? (
        <>
          <Text style={styles.sectionTitle}>{t("treatmentGuide.section.analysis")}</Text>
          <Text style={styles.sectionHint}>{t("treatmentGuide.section.analysisHint")}</Text>
          {displayUri ? (
            <View style={styles.previewCard}>
              <Image source={{ uri: displayUri }} style={styles.preview} resizeMode="cover" />
            </View>
          ) : null}
        </>
      ) : null}

      {isProcessing ? (
        <View style={styles.statusBox}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.statusTitle}>{t("treatmentGuide.analysis.preparing")}</Text>
          <Text style={styles.statusHint}>{t("treatmentGuide.analysis.preparingHint")}</Text>
        </View>
      ) : null}

      {showWaiting ? (
        <View style={styles.statusBox}>
          <ActivityIndicator size="small" color="#64748b" />
          <Text style={styles.statusTitle}>{t("treatmentGuide.analysis.preparing")}</Text>
        </View>
      ) : null}

      {showFailed ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>{t("treatmentGuide.analysis.failed")}</Text>
          <Text style={styles.errorBody}>{errorText || t("treatmentGuide.analysis.failedHint")}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.88}>
            <Text style={styles.retryBtnText}>{t("treatmentGuide.analysis.tryAgain")}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {showResult || (hasResult && !isProcessing && !showFailed) ? (
        <View style={styles.resultCard}>
          <View style={styles.resultTitleRow}>
            <View style={styles.resultTitleCol}>
              <Text style={styles.resultTitle}>{t("treatmentGuide.analysisResultTitle")}</Text>
              {guidanceSavedAt ? (
                <Text style={styles.savedAt}>
                  {t("treatmentGuide.analysis.savedAt", {
                    date: new Date(guidanceSavedAt).toLocaleDateString(),
                  })}
                </Text>
              ) : null}
            </View>
            {showTranslatedBadge ? (
              <View style={styles.translatedBadge}>
                <Text style={styles.translatedBadgeText}>{t("analysis.translatedBadge")}</Text>
              </View>
            ) : null}
          </View>
          {localized.insights.length > 0 ? (
            localized.insights.slice(0, 4).map((line, i) => (
              <Text key={i} style={styles.insightLine}>
                {i + 1}. {line}
              </Text>
            ))
          ) : (
            <Text style={styles.summaryText}>{localized.summary || t("treatmentGuide.analysisEmpty")}</Text>
          )}
          {localized.recommendation ? (
            <Text style={styles.nextStep}>
              {t("treatmentGuide.analysis.nextStep")}: {localized.recommendation}
            </Text>
          ) : (
            <Text style={styles.nextStep}>{t("treatmentGuide.analysis.nextStepDefault")}</Text>
          )}
          <Text style={styles.microDisclaimer}>{t("analysis.disclaimer")}</Text>
        </View>
      ) : null}

      {!embedded && onRetakePhoto ? (
        <TouchableOpacity style={styles.linkBtn} onPress={onRetakePhoto} activeOpacity={0.85}>
          <Text style={styles.linkBtnText}>{t("treatmentGuide.retakePhoto")}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  embedded: {},
  emptyPlaceholder: {
    fontSize: 14,
    color: "#94a3b8",
    lineHeight: 20,
    fontStyle: "italic",
  },
  wrap: { marginBottom: 20 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: "#0f172a", marginBottom: 6 },
  sectionHint: { fontSize: 13, color: "#64748b", lineHeight: 19, marginBottom: 12 },
  previewCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  preview: { width: "100%", aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: "#e2e8f0" },
  statusBox: { alignItems: "center", paddingVertical: 16, gap: 8 },
  statusTitle: { fontSize: 15, fontWeight: "700", color: "#334155", textAlign: "center" },
  statusHint: { fontSize: 13, color: "#64748b", textAlign: "center", lineHeight: 18, paddingHorizontal: 12 },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  errorTitle: { fontSize: 15, fontWeight: "700", color: "#b91c1c", marginBottom: 6 },
  errorBody: { fontSize: 13, color: "#7f1d1d", lineHeight: 19, marginBottom: 12 },
  retryBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#fca5a5",
  },
  retryBtnText: { fontSize: 14, fontWeight: "700", color: "#b91c1c" },
  resultCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  resultTitleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: 8, marginBottom: 10 },
  resultTitleCol: { flex: 1, minWidth: 120 },
  resultTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a" },
  savedAt: { fontSize: 12, color: "#94a3b8", marginTop: 4 },
  translatedBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: "#e0e7ff" },
  translatedBadgeText: { fontSize: 11, fontWeight: "700", color: "#3730a3" },
  insightLine: { fontSize: 14, color: "#334155", marginBottom: 6, lineHeight: 20 },
  summaryText: { fontSize: 14, color: "#334155", lineHeight: 21, marginBottom: 8 },
  nextStep: { fontSize: 13, color: "#475569", lineHeight: 19, marginTop: 8, fontWeight: "600" },
  microDisclaimer: { fontSize: 11, color: "#94a3b8", marginTop: 10, lineHeight: 16 },
  linkBtn: { paddingVertical: 8, alignSelf: "flex-start" },
  linkBtnText: { fontSize: 14, fontWeight: "600", color: "#2563eb" },
});
