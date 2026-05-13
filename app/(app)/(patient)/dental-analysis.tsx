import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Alert,
  BackHandler,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useLanguage } from "../../../lib/language-context";
import { useAuth } from "../../../lib/auth";
import {
  setLastCapturedImage,
  useLastCapturedImage,
} from "../../../lib/lastCapturedImage";
import { analyzePhoto, type AnalyzePhotoResult } from "../../../lib/dentalAnalysisPipeline";
import { goToDentalCamera } from "../../../lib/dentalPhotoNavigation";
import { goToClinicSelect } from "../../../lib/offerRequestFlow";
import { leaveToPatientHome } from "../../../lib/safePatientNavigation";

type AllTranslationsMap = Record<string, { insights?: unknown[]; summary?: string; recommendation?: string }> | null;

function getLocalizedView(
  analysis: Record<string, unknown> | null,
  lang: string
): { insights: string[]; summary: string; recommendation: string } {
  if (!analysis) {
    return { insights: [], summary: "", recommendation: "" };
  }

  const key = String(lang || "en")
    .toLowerCase()
    .replace(/_/g, "-")
    .split("-")[0];

  const at =
    analysis.allTranslations ?? (analysis as { _allTranslations?: AllTranslationsMap })._allTranslations;

  const block = (at as Record<string, unknown> | null | undefined)?.[key] as
    | { insights?: unknown[]; summary?: string; recommendation?: string }
    | undefined;

  console.log("SELECTED BLOCK:", key, block);

  if (block) {
    return {
      insights: Array.isArray(block.insights) ? block.insights.map((x) => String(x)) : [],
      summary: String(block.summary ?? ""),
      recommendation: String(block.recommendation ?? ""),
    };
  }

  return {
    insights: Array.isArray(analysis.insights) ? (analysis.insights as unknown[]).map((x) => String(x)) : [],
    summary: String(analysis.summary ?? ""),
    recommendation: String(analysis.recommendation ?? ""),
  };
}

export default function DentalAnalysisScreen() {
  const router = useRouter();
  const { t, currentLanguage } = useLanguage();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ imageUri?: string }>();
  const storeUri = useLastCapturedImage();
  const patientId = String(user?.patientId || "").trim();
  const token = user?.token;

  const imageUri = useMemo(() => {
    const p = typeof params.imageUri === "string" ? params.imageUri.trim() : "";
    return p || String(storeUri || "").trim();
  }, [params.imageUri, storeUri]);

  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [analysisPayload, setAnalysisPayload] = useState<Record<string, unknown> | null>(null);

  const normAppLang = useMemo(() => {
    const s = String(currentLanguage || "en")
      .toLowerCase()
      .replace(/_/g, "-");
    return (s.split("-")[0] || "en").trim() || "en";
  }, [currentLanguage]);

  const localized = useMemo(
    () => getLocalizedView(analysisPayload, currentLanguage),
    [analysisPayload, currentLanguage, normAppLang]
  );

  const allTranslationsMap = useMemo(() => {
    if (!analysisPayload) return null;
    const v = (analysisPayload.allTranslations ??
      (analysisPayload as { _allTranslations?: AllTranslationsMap })._allTranslations) as AllTranslationsMap;
    return v && typeof v === "object" ? v : null;
  }, [analysisPayload]);

  const showTranslatedBadge = useMemo(() => {
    if (normAppLang === "en" || !allTranslationsMap) return false;
    return !!allTranslationsMap[normAppLang];
  }, [allTranslationsMap, normAppLang]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      leaveToPatientHome(router);
      return true;
    });
    return () => sub.remove();
  }, [router]);

  useEffect(() => {
    if (typeof params.imageUri === "string" && params.imageUri.trim()) {
      setLastCapturedImage(params.imageUri.trim());
    }
  }, [params.imageUri]);

  useEffect(() => {
    if (!imageUri) {
      goToDentalCamera(router);
      return;
    }
    if (!token || !patientId) {
      setPhase("error");
      setErrorText(t("chat.sessionExpired"));
      return;
    }

    let cancelled = false;
    setPhase("loading");
    setErrorText(null);
    setFileUrl(null);
    setAnalysisPayload(null);

    (async () => {
      console.log("AI LANG:", currentLanguage);
      const result = await analyzePhoto({
        imageUri,
        patientId,
        token,
        photoType: "general",
        lang: currentLanguage,
      });
      if (cancelled) return;
      if (result.ok) {
        setLastCapturedImage(result.fileUrl);
        setFileUrl(result.fileUrl);
        setAnalysisPayload({ ...result.aiData });
        setPhase("done");
      } else {
        const err = result as Extract<AnalyzePhotoResult, { ok: false }>;
        setPhase("error");
        if (err.phase === "session") {
          setErrorText(t("chat.sessionExpired"));
        } else if (err.message === "timeout" || err.message === "empty_file") {
          setErrorText(t("messages.connectionError") || err.message);
        } else {
          setErrorText(err.message || t("messages.connectionError") || "Error");
        }
        if (err.aiData?.error === "image_too_large") {
          Alert.alert(
            t("messages.uploadError") || "Hata",
            String(err.aiData.message || "")
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageUri, patientId, token, t, currentLanguage]);

  useEffect(() => {
    if (phase !== "done" || !analysisPayload) return;
    console.log("LANG:", currentLanguage);
    console.log("ALL:", analysisPayload.allTranslations ?? (analysisPayload as { _allTranslations?: unknown })._allTranslations);
  }, [phase, analysisPayload, currentLanguage]);

  const sendToClinics = () => {
    const img = fileUrl || imageUri;
    if (!img || !analysisPayload) return;
    const analysis = {
      ...analysisPayload,
      insights: localized.insights,
      summary: localized.summary,
      recommendation: localized.recommendation,
    };
    void goToClinicSelect(router, { image: img, analysis });
  };

  if (!imageUri) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{t("dentalAnalysis.title")}</Text>
      <Text style={styles.sub}>{t("dentalAnalysis.subtitle")}</Text>

      <View style={styles.previewCard}>
        <Text style={styles.photoLabel}>{t("messages.photoToSend")}</Text>
        <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
      </View>

      {phase === "loading" && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>{t("analysis.processing")}</Text>
        </View>
      )}

      {phase === "error" && errorText && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorText}</Text>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => goToDentalCamera(router)}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryBtnText}>{t("dentalAnalysis.retake")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {phase === "done" && (
        <View style={styles.resultCard}>
          <View style={styles.resultTitleRow}>
            <Text style={styles.resultTitle}>{t("analysis.resultTitle")}</Text>
            {showTranslatedBadge && (
              <View
                style={styles.translatedBadge}
                accessibilityLabel={t("analysis.translatedBadge")}
                accessibilityHint={t("analysis.translatedHint")}
              >
                <Text style={styles.translatedBadgeText}>{t("analysis.translatedBadge")}</Text>
              </View>
            )}
          </View>
          {localized.insights.length > 0 ? (
            localized.insights.map((line, i) => (
              <Text key={i} style={styles.insightLine}>
                {i + 1}. {line}
              </Text>
            ))
          ) : (
            <Text style={styles.placeholder}>
              {localized.summary || t("messages.emptySub")}
            </Text>
          )}
          {String(localized.recommendation || "").trim() ? (
            <Text style={styles.recommendation}>{localized.recommendation}</Text>
          ) : null}
          <Text style={styles.disclaimer}>
            {allTranslationsMap
              ? t("analysis.disclaimer")
              : typeof analysisPayload?.disclaimer === "string" && String(analysisPayload.disclaimer).trim()
                ? String(analysisPayload.disclaimer)
                : t("analysis.disclaimer")}
          </Text>

          <TouchableOpacity style={styles.primaryBtn} onPress={sendToClinics} activeOpacity={0.88}>
            <Text style={styles.primaryBtnText}>
              {t("messages.requestOffersFromClinics")}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => goToDentalCamera(router)}
        activeOpacity={0.85}
      >
        <Text style={styles.secondaryBtnText}>{t("dentalAnalysis.retake")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#f8fafc" },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 6,
  },
  sub: {
    fontSize: 14,
    color: "#64748b",
    marginBottom: 20,
    lineHeight: 20,
  },
  previewCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  photoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  preview: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 12,
  },
  loadingText: { fontSize: 15, color: "#475569", fontWeight: "600" },
  errorBox: { marginBottom: 16 },
  errorText: { color: "#b91c1c", fontSize: 14, marginBottom: 12, lineHeight: 20 },
  resultCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  resultTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  resultTitle: { fontSize: 17, fontWeight: "800", color: "#0f172a", flex: 1, minWidth: 120 },
  translatedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: "#e0e7ff",
  },
  translatedBadgeText: { fontSize: 11, fontWeight: "700", color: "#3730a3" },
  insightLine: { fontSize: 14, color: "#334155", marginBottom: 8, lineHeight: 20 },
  placeholder: { fontSize: 14, color: "#64748b", marginBottom: 8 },
  recommendation: { fontSize: 14, color: "#1e40af", marginTop: 10, marginBottom: 4, lineHeight: 20, fontWeight: "600" },
  disclaimer: { fontSize: 11, color: "#94a3b8", marginTop: 12, marginBottom: 16, lineHeight: 16 },
  primaryBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryBtn: {
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#64748b", fontSize: 15, fontWeight: "600" },
});
