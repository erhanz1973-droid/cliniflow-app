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
import { pickIntakeImageFromLibrary } from "../../../lib/treatmentGuide/uploadDocument";
import { GuidePhotoStart } from "../../../components/treatmentGuide/GuidePhotoStart";
import { leaveToPatientHome } from "../../../lib/safePatientNavigation";
import { getStableTreatmentGuideSessionId } from "../../../lib/treatmentGuide/stableSession";
import { AiCoordinatorChatView } from "../../../components/aiCoordinator/AiCoordinatorChatView";
import { GoalChips } from "../../../components/treatmentGuide/GoalChips";
import { IntakeWorkflowPanel } from "../../../components/treatmentGuide/IntakeWorkflowPanel";
import { UploadGuidance } from "../../../components/treatmentGuide/UploadGuidance";
import { ClinicNetworkHint } from "../../../components/treatmentGuide/ClinicNetworkHint";
import {
  chipIdsToTags,
  tagsToChipIds,
  type TreatmentGoalChipId,
} from "../../../lib/treatmentGuide/chips";
import { savePatientReportedTags } from "../../../lib/treatmentGuide/intakeApi";
import { useTreatmentGuideIntake } from "../../../lib/treatmentGuide/useTreatmentGuideIntake";
import { usePatientClinicMembership } from "../../../hooks/usePatientClinicMembership";
import {
  loadTreatmentGuideAnalysisCache,
  loadTreatmentGuideAnalysisCacheByHash,
  normalizeImageFingerprint,
  saveTreatmentGuideAnalysisCache,
} from "../../../lib/treatmentGuide/analysisCache";
import { sha256LocalFileUri, normalizeContentHash } from "../../../lib/treatmentGuide/imageContentHash";
import {
  loadLastGuideImage,
  saveLastGuideImage,
} from "../../../lib/treatmentGuide/workflowState";

export default function TreatmentGuideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, currentLanguage } = useLanguage();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ imageUri?: string; clinicId?: string; clinic_id?: string }>();
  const storeUri = useLastCapturedImage();
  const [sessionId, setSessionId] = useState("");
  const chatSectionRef = useRef<View>(null);
  const scrollRef = useRef<ScrollView>(null);
  const chipSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzedFingerprintRef = useRef<string | null>(null);
  const analyzedContentHashRef = useRef<string | null>(null);
  const analysisInFlightRef = useRef(false);
  const pendingNewAnalysisRef = useRef(false);
  const hydrateInFlightRef = useRef(false);

  const patientId = String(user?.patientId || user?.id || "").trim();
  const token = user?.token;

  const routeClinicId = useMemo(
    () => String(params.clinicId || params.clinic_id || "").trim() || null,
    [params.clinicId, params.clinic_id],
  );

  const { hasClinic, linkedClinicId, linkedClinicName } = usePatientClinicMembership(routeClinicId);

  const clinicId = useMemo(() => {
    if (hasClinic && linkedClinicId) return linkedClinicId;
    return routeClinicId;
  }, [hasClinic, linkedClinicId, routeClinicId]);

  const { intake, loading: intakeLoading, applyIntakeState, refresh: refreshIntake } =
    useTreatmentGuideIntake({ sessionId, clinicId });

  const [restoredDisplayUri, setRestoredDisplayUri] = useState<string | null>(null);

  const imageUri = useMemo(() => {
    const p = typeof params.imageUri === "string" ? params.imageUri.trim() : "";
    return p || String(storeUri || "").trim() || String(restoredDisplayUri || "").trim();
  }, [params.imageUri, storeUri, restoredDisplayUri]);

  const displayImageUri = imageUri;

  const imageFingerprint = useMemo(() => normalizeImageFingerprint(imageUri), [imageUri]);

  const [phase, setPhase] = useState<
    "idle" | "restoring" | "uploading" | "analyzing" | "done" | "error" | "skipped"
  >("idle");
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
    if (!patientId) return;
    let cancelled = false;
    void getStableTreatmentGuideSessionId(patientId).then((sid) => {
      if (!cancelled) setSessionId(sid);
    });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  useEffect(() => {
    if (typeof params.imageUri !== "string" || !params.imageUri.trim() || !patientId) return;
    const uri = params.imageUri.trim();
    setLastCapturedImage(uri);
    let cancelled = false;
    void (async () => {
      const fp = normalizeImageFingerprint(uri);
      const hash = uri.startsWith("http") ? "" : normalizeContentHash(await sha256LocalFileUri(uri));
      const last = await loadLastGuideImage(patientId);
      if (cancelled) return;
      const alreadyHandled =
        (last && last.fingerprint === fp) ||
        (hash && last?.contentHash === hash) ||
        (hash && (await loadTreatmentGuideAnalysisCacheByHash(patientId, hash)));
      if (alreadyHandled) {
        pendingNewAnalysisRef.current = false;
        if (hash) analyzedContentHashRef.current = hash;
        if (last?.fingerprint) analyzedFingerprintRef.current = last.fingerprint;
      } else {
        pendingNewAnalysisRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.imageUri, patientId]);

  useEffect(() => {
    if (imageUri || !patientId) return;
    let cancelled = false;
    void (async () => {
      const last = await loadLastGuideImage(patientId);
      if (cancelled || !last?.displayUri) return;
      setRestoredDisplayUri(last.displayUri);
      setLastCapturedImage(last.remoteUrl || last.displayUri);
      analyzedFingerprintRef.current = last.fingerprint;
      analyzedContentHashRef.current = last.contentHash || null;
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, imageUri]);

  const applyAnalysisResult = useCallback(
    (
      fileUrl: string,
      aiData: Record<string, unknown>,
      _fingerprint: string,
      contentHash?: string | null,
    ) => {
      const stableFingerprint = normalizeImageFingerprint(fileUrl);
      analyzedFingerprintRef.current = stableFingerprint;
      const hash = normalizeContentHash(contentHash);
      if (hash) analyzedContentHashRef.current = hash;
      setLastCapturedImage(fileUrl);
      setRestoredDisplayUri(fileUrl);
      setAnalysisPayload({ ...aiData });
      setPhase("done");
      setErrorText(null);
      void saveTreatmentGuideAnalysisCache(patientId, {
        fingerprint: stableFingerprint,
        contentHash: hash || undefined,
        fileUrl,
        aiData,
        cachedAt: Date.now(),
      });
      if (patientId && hash) {
        void saveLastGuideImage(patientId, {
          displayUri: fileUrl,
          remoteUrl: fileUrl.split("?")[0],
          contentHash: hash,
          fingerprint: stableFingerprint,
          savedAt: Date.now(),
        });
      }
    },
    [patientId],
  );

  const restoreAnalysisOnly = useCallback(
    async (fingerprint: string, contentHash?: string | null): Promise<boolean> => {
      const hash = normalizeContentHash(contentHash);
      if (hash) {
        const byHash = await loadTreatmentGuideAnalysisCacheByHash(patientId, hash);
        if (byHash?.aiData) {
          applyAnalysisResult(byHash.fileUrl, byHash.aiData, fingerprint, hash);
          return true;
        }
      }
      const local = await loadTreatmentGuideAnalysisCache(patientId, fingerprint);
      if (local?.aiData) {
        applyAnalysisResult(local.fileUrl, local.aiData, fingerprint, local.contentHash);
        return true;
      }
      return false;
    },
    [patientId, applyAnalysisResult],
  );

  const runPhotoAnalysis = useCallback(
    async (opts: { forceReanalyze?: boolean } = {}) => {
      if (!imageUri || !token || !patientId || !imageFingerprint) return;
      if (analysisInFlightRef.current) return;

      const force = opts.forceReanalyze === true;
      if (!force && analyzedFingerprintRef.current === imageFingerprint && analysisPayload) {
        setPhase("done");
        return;
      }

      analysisInFlightRef.current = true;
      setPhase(force ? "analyzing" : "uploading");
      setErrorText(null);
      if (force) {
        setAnalysisPayload(null);
        pendingNewAnalysisRef.current = true;
      }

      try {
        let contentHash = analyzedContentHashRef.current;
        if (!contentHash && !imageUri.startsWith("http")) {
          contentHash = normalizeContentHash(await sha256LocalFileUri(imageUri));
          if (contentHash) analyzedContentHashRef.current = contentHash;
        }

        if (!force) {
          const restored = await restoreAnalysisOnly(imageFingerprint, contentHash);
          if (restored) return;
        }

        setPhase("analyzing");
        const result = await analyzePhoto({
          imageUri,
          patientId,
          token,
          photoType: "general",
          lang: currentLanguage,
          forceReanalyze: force,
          contentHash,
        });

        if (result.ok) {
          applyAnalysisResult(
            result.fileUrl,
            { ...result.aiData },
            imageFingerprint,
            contentHash,
          );
          if (!result.aiData?.reused && !result.aiData?.cached) {
            void refreshIntake();
          }
        } else {
          const err = result as Extract<AnalyzePhotoResult, { ok: false }>;
          setPhase("error");
          setErrorText(
            err.phase === "session"
              ? t("chat.sessionExpired")
              : err.message || t("messages.connectionError") || "Error",
          );
        }
      } finally {
        analysisInFlightRef.current = false;
        pendingNewAnalysisRef.current = false;
      }
    },
    [
      imageUri,
      imageFingerprint,
      patientId,
      token,
      currentLanguage,
      applyAnalysisResult,
      restoreAnalysisOnly,
      refreshIntake,
      t,
      analysisPayload,
    ],
  );

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
    if (hydrateInFlightRef.current) return;

    let cancelled = false;
    void (async () => {
      hydrateInFlightRef.current = true;
      setPhase("restoring");
      try {
        if (cancelled) return;

        let contentHash = analyzedContentHashRef.current;
        if (!contentHash && !imageUri.startsWith("http")) {
          contentHash = normalizeContentHash(await sha256LocalFileUri(imageUri));
          if (contentHash) analyzedContentHashRef.current = contentHash;
        }

        if (
          contentHash &&
          analyzedContentHashRef.current === contentHash &&
          analyzedFingerprintRef.current
        ) {
          setPhase(analysisPayload ? "done" : "idle");
          return;
        }

        const restored = await restoreAnalysisOnly(imageFingerprint, contentHash);
        if (restored) return;

        if (!pendingNewAnalysisRef.current) {
          setPhase(analysisPayload ? "done" : "idle");
          return;
        }

        if (cancelled) return;
        await runPhotoAnalysis({ forceReanalyze: false });
      } finally {
        hydrateInFlightRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hydrate only on image/patient identity
  }, [imageFingerprint, patientId, token, imageUri]);

  const scrollToChat = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  const goToFiles = useCallback(() => {
    router.push("/(patient)/files" as never);
  }, [router]);

  const goToClinicConnection = useCallback(() => {
    if (hasClinic && linkedClinicId) {
      router.push({
        pathname: "/(patient)/messages",
        params: { clinicId: linkedClinicId },
      } as never);
      return;
    }
    router.push("/clinic-onboarding" as never);
  }, [router, hasClinic, linkedClinicId]);

  const clinicRegionHint = useMemo(() => {
    if (hasClinic) return null;
    const cities = intake.clinicDirectory?.cities;
    if (!cities?.length) return null;
    return cities.slice(0, 4).join(", ");
  }, [hasClinic, intake.clinicDirectory?.cities]);

  const addPhoto = useCallback(() => {
    goToDentalCamera(router);
  }, [router]);

  const uploadPhotoFromLibrary = useCallback(async () => {
    const picked = await pickIntakeImageFromLibrary();
    if (!picked?.uri) return;
    const uri = picked.uri.trim();
    analyzedFingerprintRef.current = null;
    analyzedContentHashRef.current = null;
    pendingNewAnalysisRef.current = true;
    setAnalysisPayload(null);
    setRestoredDisplayUri(null);
    setPhase("idle");
    setLastCapturedImage(uri);
    router.setParams({ imageUri: uri } as never);
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

        <GuidePhotoStart
          hasPhoto={!!displayImageUri}
          onTakePhoto={addPhoto}
          onUploadPhoto={() => void uploadPhotoFromLibrary()}
          uploading={phase === "uploading" || phase === "analyzing" || phase === "restoring"}
          showAnalyzeAgain={phase === "done" && !!displayImageUri}
          onAnalyzeAgain={() => void runPhotoAnalysis({ forceReanalyze: true })}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("treatmentGuide.section.analysis")}</Text>
          <Text style={styles.sectionHint}>{t("treatmentGuide.section.analysisHint")}</Text>

          {displayImageUri ? (
            <View style={styles.previewCard}>
              <Image source={{ uri: displayImageUri }} style={styles.preview} resizeMode="cover" />
            </View>
          ) : null}

          {(phase === "uploading" || phase === "analyzing" || phase === "restoring") && (
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
              ) : imageUri ? (
                <Text style={styles.placeholder}>
                  {localized.summary || t("treatmentGuide.analysisEmpty")}
                </Text>
              ) : null}
              {imageUri ? (
                <Text style={styles.microDisclaimer}>{t("analysis.disclaimer")}</Text>
              ) : null}
            </View>
          )}

          {!imageUri && phase === "skipped" ? (
            <Text style={styles.optionalHint}>{t("treatmentGuide.analysisAwaitingPhoto")}</Text>
          ) : null}

          {imageUri ? (
            <TouchableOpacity style={styles.linkBtn} onPress={addPhoto} activeOpacity={0.85}>
              <Text style={styles.linkBtnText}>{t("treatmentGuide.retakePhoto")}</Text>
            </TouchableOpacity>
          ) : null}
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
          <UploadGuidance
            flags={flags}
            documents={intake.documents}
            sessionId={sessionId}
            clinicId={clinicId}
            intake={intake}
            onIntakeUpdate={applyIntakeState}
            onRefresh={refreshIntake}
            onOpenFiles={goToFiles}
          />
        </View>

        <View style={styles.section} ref={chatSectionRef}>
          {sessionId ? (
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
          ) : (
            <ActivityIndicator size="small" color="#2563eb" />
          )}
        </View>

        <ClinicNetworkHint
          flags={flags}
          directory={intake.clinicDirectory}
          countryHint={intake.leadData.country}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("treatmentGuide.section.nextSteps")}</Text>
          <Text style={styles.sectionHint}>
            {hasClinic
              ? linkedClinicName
                ? t("treatmentGuide.section.nextStepsHintLinkedNamed", { name: linkedClinicName })
                : t("treatmentGuide.section.nextStepsHint")
              : t("treatmentGuide.section.nextStepsHintUnlinked")}
          </Text>
          {!hasClinic && clinicRegionHint ? (
            <Text style={styles.regionHint}>
              {t("treatmentGuide.clinicNetwork.regionAvailable", { cities: clinicRegionHint })}
            </Text>
          ) : null}

          <TouchableOpacity style={styles.primaryBtn} onPress={scrollToChat} activeOpacity={0.88}>
            <Text style={styles.primaryBtnText}>{t("treatmentGuide.next.continueChat")}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={goToClinicConnection} activeOpacity={0.88}>
            <Text style={styles.secondaryBtnText}>
              {hasClinic
                ? t("treatmentGuide.next.messageClinicLinked")
                : t("treatmentGuide.next.connectClinics")}
            </Text>
          </TouchableOpacity>
          {!hasClinic ? (
            <Text style={styles.ctaHelper}>{t("treatmentGuide.next.connectClinicsHelper")}</Text>
          ) : null}

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
  regionHint: { fontSize: 12, color: "#0369a1", lineHeight: 17, marginBottom: 12, fontWeight: "500" },
  ctaHelper: { fontSize: 12, color: "#64748b", lineHeight: 17, marginTop: -4, marginBottom: 10 },
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
