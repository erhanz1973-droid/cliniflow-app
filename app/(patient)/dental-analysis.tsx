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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useLanguage } from "../../lib/language-context";
import { useAuth } from "../../lib/auth";
import {
  setLastCapturedImage,
  useLastCapturedImage,
} from "../../lib/lastCapturedImage";
import { analyzePhoto } from "../../lib/dentalAnalysisPipeline";
import { goToDentalCamera } from "../../lib/dentalPhotoNavigation";
import { goToClinicSelect } from "../../lib/offerRequestFlow";

export default function DentalAnalysisScreen() {
  const router = useRouter();
  const { t } = useLanguage();
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
  const [insights, setInsights] = useState<string[]>([]);
  const [summary, setSummary] = useState<string>("");
  const [analysisPayload, setAnalysisPayload] = useState<Record<string, unknown> | null>(null);

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
    setInsights([]);
    setSummary("");
    setAnalysisPayload(null);

    (async () => {
      const result = await analyzePhoto({
        imageUri,
        patientId,
        token,
        photoType: "general",
      });
      if (cancelled) return;
      if (result.ok) {
        setLastCapturedImage(result.fileUrl);
        setFileUrl(result.fileUrl);
        setAnalysisPayload({ ...result.aiData });
        const ins = Array.isArray(result.aiData.insights) ? result.aiData.insights : [];
        setInsights(ins.map((x: unknown) => String(x)));
        setSummary(String(result.aiData.summary || result.aiData.recommendation || ""));
        setPhase("done");
      } else {
        setPhase("error");
        if (result.phase === "session") {
          setErrorText(t("chat.sessionExpired"));
        } else if (result.message === "timeout" || result.message === "empty_file") {
          setErrorText(t("messages.connectionError") || result.message);
        } else {
          setErrorText(result.message || t("messages.connectionError") || "Error");
        }
        if (result.aiData?.error === "image_too_large") {
          Alert.alert(
            t("messages.uploadError") || "Hata",
            String(result.aiData.message || "")
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageUri, patientId, token, t]);

  const sendToClinics = () => {
    const img = fileUrl || imageUri;
    if (!img || !analysisPayload) return;
    void goToClinicSelect(router, { image: img, analysis: analysisPayload });
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
          <Text style={styles.loadingText}>Fotoğraf analiz ediliyor…</Text>
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
          <Text style={styles.resultTitle}>AI Dental Analysis</Text>
          {insights.length > 0 ? (
            insights.map((line, i) => (
              <Text key={i} style={styles.insightLine}>
                {i + 1}. {line}
              </Text>
            ))
          ) : (
            <Text style={styles.placeholder}>
              {summary || t("messages.emptySub")}
            </Text>
          )}
          <Text style={styles.disclaimer}>
            Bu analiz AI tarafından oluşturulmuştur ve kesin teşhis değildir.
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
  resultTitle: { fontSize: 17, fontWeight: "800", color: "#0f172a", marginBottom: 12 },
  insightLine: { fontSize: 14, color: "#334155", marginBottom: 8, lineHeight: 20 },
  placeholder: { fontSize: 14, color: "#64748b", marginBottom: 8 },
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
