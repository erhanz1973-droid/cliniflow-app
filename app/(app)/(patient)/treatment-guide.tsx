import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../../lib/language-context";
import { useAuth } from "../../../lib/auth";
import { setLastCapturedImage, useLastCapturedImage } from "../../../lib/lastCapturedImage";
import { analyzePhoto, type AnalyzePhotoResult } from "../../../lib/dentalAnalysisPipeline";
import { getLocalizedDentalAnalysis } from "../../../lib/dentalAnalysisView";
import { goToDentalCamera } from "../../../lib/dentalPhotoNavigation";
import { leaveToPatientHome } from "../../../lib/safePatientNavigation";
import { createAiCoordinatorSessionId } from "../../../lib/aiCoordinator";
import { AiCoordinatorChatView } from "../../../components/aiCoordinator/AiCoordinatorChatView";
import { GoalChips } from "../../../components/treatmentGuide/GoalChips";
import { IntakeWorkflowPanel } from "../../../components/treatmentGuide/IntakeWorkflowPanel";
import { UploadGuidance } from "../../../components/treatmentGuide/UploadGuidance";
import {
  chipIdsToTags,
  tagsToChipIds,
  type TreatmentGoalChipId,
} from "../../../lib/treatmentGuide/chips";
import { savePatientReportedTags } from "../../../lib/treatmentGuide/intakeApi";
import { useTreatmentGuideIntake } from "../../../lib/treatmentGuide/useTreatmentGuideIntake";

export default function TreatmentGuideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, currentLanguage } = useLanguage();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ imageUri?: string; clinicId?: string; clinic_id?: string }>();
  const storeUri = useLastCapturedImage();
  const sessionIdRef = useRef(createAiCoordinatorSessionId());
  const chatSectionRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const chipSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patientId = String(user?.patientId || user?.id || "").trim();
  const token = user?.token;

  const clinicId = useMemo(() => {
    const fromRoute = String(params.clinicId || params.clinic_id || "").trim();
    if (fromRoute) return fromRoute;
    return String(user?.clinicId || "").trim() || null;
  }, [params.clinicId, params.clinic_id, user?.clinicId]);

  const sessionId = sessionIdRef.current;

  const { intake, loading: intakeLoading, applyIntakeState, refresh: refreshIntake } =
    useTreatmentGuideIntake({ sessionId, clinicId });

  const imageUri = useMemo(() => {
    const p = typeof params.imageUri === "string" ? params.imageUri.trim() : "";
    return p || String(storeUri || "").trim();
  }, [params.imageUri, storeUri]);

  const [phase, setPhase] = useState<"idle" | "loading" | "done" | "error" | "skipped">("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [analysisPayload, setAnalysisPayload] = useState<Record<string, unknown> | null>(null);
  const [patientNarrative, setPatientNarrative] = useState("");
  const [selectedChipIds, setSelectedChipIds] = useState<TreatmentGoalChipId[]>([]);
  const [savingGoals, setSavingGoals] = useState(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);

  const flags = intake.operationalIntakeFlags;
  const serverTags = flags?.patientReportedTags || intake.leadData.patientReportedTags || [];

  useEffect(() => {
    setSelectedChipIds(tagsToChipIds(serverTags));
  }, [serverTags.join("|")]);

  const localized = useMemo(
    () => getLocalizedDentalAnalysis(analysisPayload, currentLanguage),
    [analysisPayload, currentLanguage],
  );

  const allTranslationsMap = useMemo(() => {
    if (!analysisPayload) return null;
    const v =
      analysisPayload.allTranslations ??
      (analysisPayload as { _allTranslations?: Record<string, unknown> })._allTranslations;
    return v && typeof v === "object" ? v : null;
  }, [analysisPayload]);

  const normAppLang = useMemo(() => {
    const s = String(currentLanguage || "en")
      .toLowerCase()
      .replace(/_/g, "-");
    return (s.split("-")[0] || "en").trim() || "en";
  }, [currentLanguage]);

  const showTranslatedBadge = useMemo(() => {
    if (normAppLang === "en" || !allTranslationsMap) return false;
    return !!allTranslationsMap[normAppLang];
  }, [allTranslationsMap, normAppLang]);

  const persistGoalChips = useCallback(
    async (chipIds: TreatmentGoalChipId[]) => {
      const tags = chipIdsToTags(chipIds);
      if (!tags.length) return;
      setSavingGoals(true);
      setGoalsError(null);
      try {
        const next = await savePatientReportedTags({
          sessionId,
          clinicId,
          patientId: patientId || null,
          patientReportedTags: tags,
          priorLeadData: intake.leadData,
        });
        applyIntakeState(next);
      } catch (e: unknown) {
        setGoalsError(e instanceof Error ? e.message : t("messages.connectionError"));
      } finally {
        setSavingGoals(false);
      }
    },
    [sessionId, clinicId, patientId, intake.leadData, applyIntakeState, t],
  );

  const handleToggleGoal = useCallback(
    (id: TreatmentGoalChipId) => {
      setSelectedChipIds((prev) => {
        const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
        if (chipSaveTimerRef.current) clearTimeout(chipSaveTimerRef.current);
        if (chipIdsToTags(next).length) {
          chipSaveTimerRef.current = setTimeout(() => {
            void persistGoalChips(next);
          }, 500);
        }
        return next;
      });
    },
    [persistGoalChips],
  );

  useEffect(() => {
    return () => {
      if (chipSaveTimerRef.current) clearTimeout(chipSaveTimerRef.current);
    };
  }, []);

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
      setPhase("skipped");
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
    setAnalysisPayload(null);

    (async () => {
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
        setAnalysisPayload({ ...result.aiData });
        setPhase("done");
        void refreshIntake();
      } else {
        const err = result as Extract<AnalyzePhotoResult, { ok: false }>;
        setPhase("error");
        setErrorText(
          err.phase === "session"
            ? t("chat.sessionExpired")
            : err.message || t("messages.connectionError") || "Error",
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageUri, patientId, token, t, currentLanguage, refreshIntake]);

  const scrollToChat = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  const goToFiles = useCallback(() => {
    router.push("/(patient)/files" as never);
  }, [router]);

  const goToMessages = useCallback(() => {
    const cid = clinicId || String(user?.clinicId || "").trim();
    if (cid) {
      router.push({
        pathname: "/(patient)/messages",
        params: { clinicId: cid },
      } as never);
    } else {
      router.push("/(patient)/messages" as never);
    }
  }, [router, clinicId, user?.clinicId]);

  const addPhoto = useCallback(() => {
    goToDentalCamera(router);
  }, [router]);

  const handleIntakeUpdate = useCallback(
    (next: Parameters<typeof applyIntakeState>[0]) => {
      applyIntakeState(next);
    },
    [applyIntakeState],
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => leaveToPatientHome(router)}
          style={styles.backBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <Ionicons name="chevron-back" size={24} color="#0f172a" />
        </TouchableOpacity>
        <View style={styles.topBarCenter}>
          <Text style={styles.pageTitle}>{t("treatmentGuide.title")}</Text>
          <Text style={styles.pageSub}>{t("treatmentGuide.subtitle")}</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.disclaimerCard}>
          <Text style={styles.disclaimerText}>{t("treatmentGuide.clinicalDisclaimer")}</Text>
        </View>

        <IntakeWorkflowPanel
          loading={intakeLoading}
          intakeJourney={intake.intakeJourney}
          flags={flags}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("treatmentGuide.section.goals")}</Text>
          <Text style={styles.sectionHint}>{t("treatmentGuide.section.goalsHint")}</Text>
          <GoalChips
            selectedIds={selectedChipIds}
            onToggle={handleToggleGoal}
            saving={savingGoals}
          />
          {goalsError ? <Text style={styles.errorText}>{goalsError}</Text> : null}
          <TextInput
            style={[styles.narrativeInput, { marginTop: 14 }]}
            value={patientNarrative}
            onChangeText={setPatientNarrative}
            placeholder={t("treatmentGuide.narrativePlaceholder")}
            placeholderTextColor="#94a3b8"
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />
        </View>

        <View style={styles.section}>
          <UploadGuidance flags={flags} onOpenFiles={goToFiles} />
        </View>

        {(imageUri || phase !== "skipped") && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("treatmentGuide.section.analysis")}</Text>
            <Text style={styles.sectionHint}>{t("treatmentGuide.section.analysisHint")}</Text>

            {imageUri ? (
              <View style={styles.previewCard}>
                <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" />
              </View>
            ) : (
              <Text style={styles.optionalHint}>{t("treatmentGuide.photoOptional")}</Text>
            )}

            {phase === "loading" && (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.loadingText}>{t("analysis.processing")}</Text>
              </View>
            )}

            {phase === "error" && errorText ? (
              <Text style={styles.errorText}>{errorText}</Text>
            ) : null}

            {phase === "done" && (
              <View style={styles.resultCard}>
                <View style={styles.resultTitleRow}>
                  <Text style={styles.resultTitle}>{t("treatmentGuide.analysisResultTitle")}</Text>
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
                  <Text style={styles.placeholder}>
                    {localized.summary || t("treatmentGuide.analysisEmpty")}
                  </Text>
                )}
                <Text style={styles.microDisclaimer}>{t("analysis.disclaimer")}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.linkBtn} onPress={addPhoto} activeOpacity={0.85}>
              <Text style={styles.linkBtnText}>
                {imageUri ? t("treatmentGuide.retakePhoto") : t("treatmentGuide.addPhoto")}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.section} ref={chatSectionRef}>
          <AiCoordinatorChatView
            embedded
            contextMode="treatment_guide"
            clinicId={clinicId}
            patientId={patientId || null}
            sessionId={sessionId}
            initialDraft={patientNarrative.trim()}
            priorLeadData={intake.leadData}
            onIntakeUpdate={handleIntakeUpdate}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("treatmentGuide.section.nextSteps")}</Text>
          <Text style={styles.sectionHint}>{t("treatmentGuide.section.nextStepsHint")}</Text>

          <TouchableOpacity style={styles.primaryBtn} onPress={scrollToChat} activeOpacity={0.88}>
            <Text style={styles.primaryBtnText}>{t("treatmentGuide.next.continueChat")}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={goToMessages} activeOpacity={0.88}>
            <Text style={styles.secondaryBtnText}>{t("treatmentGuide.next.messageClinic")}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={goToFiles} activeOpacity={0.88}>
            <Text style={styles.secondaryBtnText}>{t("treatmentGuide.next.uploadDocs")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#f8fafc" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  topBarCenter: { flex: 1, alignItems: "center" },
  pageTitle: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  pageSub: { fontSize: 12, color: "#64748b", marginTop: 2, textAlign: "center", paddingHorizontal: 8 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 18, paddingTop: 16 },
  disclaimerCard: {
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  disclaimerText: { fontSize: 13, color: "#1e3a8a", lineHeight: 19, fontWeight: "500" },
  intakeLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    paddingVertical: 8,
  },
  intakeLoadingText: { fontSize: 13, color: "#64748b", fontWeight: "600" },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: "#0f172a", marginBottom: 6 },
  sectionHint: { fontSize: 13, color: "#64748b", lineHeight: 19, marginBottom: 12 },
  optionalHint: { fontSize: 13, color: "#64748b", marginBottom: 10, fontStyle: "italic" },
  previewCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  preview: { width: "100%", aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: "#e2e8f0" },
  loadingBox: { alignItems: "center", paddingVertical: 16, gap: 10 },
  loadingText: { fontSize: 14, color: "#475569", fontWeight: "600" },
  errorText: { color: "#b91c1c", fontSize: 14, marginBottom: 10, lineHeight: 20 },
  resultCard: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  resultTitleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8, marginBottom: 10 },
  resultTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a", flex: 1 },
  translatedBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: "#e0e7ff" },
  translatedBadgeText: { fontSize: 11, fontWeight: "700", color: "#3730a3" },
  insightLine: { fontSize: 14, color: "#334155", marginBottom: 6, lineHeight: 20 },
  placeholder: { fontSize: 14, color: "#64748b", marginBottom: 6 },
  microDisclaimer: { fontSize: 11, color: "#94a3b8", marginTop: 10, lineHeight: 16 },
  narrativeInput: {
    minHeight: 88,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0f172a",
    lineHeight: 22,
  },
  linkBtn: { paddingVertical: 8, alignSelf: "flex-start" },
  linkBtnText: { fontSize: 14, fontWeight: "600", color: "#2563eb" },
  primaryBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  secondaryBtnText: { color: "#334155", fontSize: 15, fontWeight: "600" },
});
