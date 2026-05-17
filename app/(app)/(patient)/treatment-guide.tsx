import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
  Image,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../../lib/language-context";
import { useAuth } from "../../../lib/auth";
import { setLastCapturedImage, useLastCapturedImage } from "../../../lib/lastCapturedImage";
import {
  analyzePhoto,
  compressImageForAi,
  type AnalyzePhotoResult,
} from "../../../lib/dentalAnalysisPipeline";
import { getLocalizedDentalAnalysis } from "../../../lib/dentalAnalysisView";
import { normalizeAnalyzeApiPayload } from "../../../lib/dentalAnalysisNormalize";
import { goToDentalCamera } from "../../../lib/dentalPhotoNavigation";
import { pickIntakeImageFromLibrary } from "../../../lib/treatmentGuide/uploadDocument";
import { GuidePhotoStart } from "../../../components/treatmentGuide/GuidePhotoStart";
import { GuideFlowSection } from "../../../components/treatmentGuide/GuideFlowSection";
import { IntakeProgressSummary } from "../../../components/treatmentGuide/IntakeProgressSummary";
import { leaveToPatientHome } from "../../../lib/safePatientNavigation";
import { getStableTreatmentGuideSessionId } from "../../../lib/treatmentGuide/stableSession";
import { AiCoordinatorChatView } from "../../../components/aiCoordinator/AiCoordinatorChatView";
import { GoalChips } from "../../../components/treatmentGuide/GoalChips";
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
  loadTreatmentGuideAnalysisCacheAny,
  normalizeImageFingerprint,
  saveTreatmentGuideAnalysisCache,
} from "../../../lib/treatmentGuide/analysisCache";
import { GuidePhotoAnalysisCard, type PhotoAnalysisUiPhase } from "../../../components/treatmentGuide/GuidePhotoAnalysisCard";
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
  const scrollRef = useRef<ScrollView>(null);
  const chipSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzedFingerprintRef = useRef<string | null>(null);
  const analyzedContentHashRef = useRef<string | null>(null);
  const localImageFingerprintRef = useRef<string | null>(null);
  const analysisInFlightRef = useRef(false);
  const analyzeFetchFailedRef = useRef(false);
  const pendingNewAnalysisRef = useRef(false);
  const hydrateInFlightRef = useRef(false);

  const patientId = String(user?.patientId || user?.id || "").trim();
  const token = user?.token;

  const routeClinicId = useMemo(
    () => String(params.clinicId || params.clinic_id || "").trim() || null,
    [params.clinicId, params.clinic_id],
  );

  const { hasClinic, linkedClinicId } = usePatientClinicMembership(routeClinicId);

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

  const photoUiPhase = useMemo((): PhotoAnalysisUiPhase => {
    if (phase === "error") return "failed";
    if (phase === "done") return "analyzed";
    if (phase === "skipped") return displayImageUri ? "uploaded" : "idle";
    if (phase === "idle" && displayImageUri && analysisPayload) return "analyzed";
    if (phase === "idle" && displayImageUri) return "uploaded";
    return phase;
  }, [phase, displayImageUri, analysisPayload]);

  const resolveContentHash = useCallback(async (uri: string): Promise<string> => {
    const existing = normalizeContentHash(analyzedContentHashRef.current);
    if (existing) return existing;
    if (!uri || uri.startsWith("http")) return "";
    try {
      const mime = /\.png(\?|$)/i.test(uri) ? "image/png" : "image/jpeg";
      const compressed = await compressImageForAi(uri, mime);
      return normalizeContentHash(await sha256LocalFileUri(compressed.uri));
    } catch {
      return normalizeContentHash(await sha256LocalFileUri(uri));
    }
  }, []);

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

  const applyAnalysisResult = useCallback(
    (
      fileUrl: string,
      aiData: Record<string, unknown>,
      _fingerprint: string,
      contentHash?: string | null,
      aliasFingerprints: string[] = [],
    ) => {
      const norm = normalizeAnalyzeApiPayload(aiData);
      if (!norm) return;

      const stableFingerprint = normalizeImageFingerprint(fileUrl);
      analyzedFingerprintRef.current = stableFingerprint;
      const hash = normalizeContentHash(contentHash);
      if (hash) analyzedContentHashRef.current = hash;
      setLastCapturedImage(fileUrl);
      setRestoredDisplayUri(fileUrl);
      setAnalysisPayload(norm);
      setPhase("done");
      setErrorText(null);

      const aliases = [
        localImageFingerprintRef.current,
        _fingerprint,
        ...aliasFingerprints,
      ].filter((a): a is string => !!a && a !== stableFingerprint);

      void saveTreatmentGuideAnalysisCache(
        patientId,
        {
          fingerprint: stableFingerprint,
          contentHash: hash || undefined,
          fileUrl,
          aiData: norm,
          cachedAt: Date.now(),
        },
        aliases,
      );

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
      const cached = await loadTreatmentGuideAnalysisCacheAny(patientId, {
        fingerprint,
        contentHash: hash,
      });
      if (!cached?.aiData) return false;
      const norm = normalizeAnalyzeApiPayload(cached.aiData);
      if (!norm) return false;
      applyAnalysisResult(
        cached.fileUrl,
        norm,
        fingerprint,
        hash || cached.contentHash,
        [localImageFingerprintRef.current].filter(Boolean) as string[],
      );
      return true;
    },
    [patientId, applyAnalysisResult],
  );

  useEffect(() => {
    if (typeof params.imageUri !== "string" || !params.imageUri.trim() || !patientId) return;
    const uri = params.imageUri.trim();
    setLastCapturedImage(uri);
    if (!uri.startsWith("http")) {
      localImageFingerprintRef.current = normalizeImageFingerprint(uri);
    }
    let cancelled = false;
    void (async () => {
      const fp = normalizeImageFingerprint(uri);
      const hash = uri.startsWith("http") ? "" : await resolveContentHash(uri);
      if (cancelled) return;
      if (hash) analyzedContentHashRef.current = hash;

      const cached = await loadTreatmentGuideAnalysisCacheAny(patientId, {
        fingerprint: fp,
        contentHash: hash || null,
      });

      if (cached?.aiData) {
        pendingNewAnalysisRef.current = false;
        const norm = normalizeAnalyzeApiPayload(cached.aiData);
        if (norm) {
          applyAnalysisResult(cached.fileUrl, norm, fp, hash || cached.contentHash, [
            localImageFingerprintRef.current || fp,
          ]);
        }
        return;
      }

      const last = await loadLastGuideImage(patientId);
      if (cancelled) return;
      const alreadyHandled =
        (last && last.fingerprint === fp) || (hash && last?.contentHash === hash);
      if (alreadyHandled && last) {
        pendingNewAnalysisRef.current = false;
        analyzedFingerprintRef.current = last.fingerprint;
        const again = await loadTreatmentGuideAnalysisCacheAny(patientId, {
          fingerprint: last.fingerprint,
          contentHash: last.contentHash || hash,
        });
        if (again?.aiData) {
          const norm = normalizeAnalyzeApiPayload(again.aiData);
          if (norm) {
            applyAnalysisResult(again.fileUrl, norm, last.fingerprint, last.contentHash || hash, [fp]);
          }
        }
      } else {
        pendingNewAnalysisRef.current = true;
        analyzeFetchFailedRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params.imageUri, patientId, resolveContentHash, applyAnalysisResult]);

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
      const cached = await loadTreatmentGuideAnalysisCacheAny(patientId, {
        fingerprint: last.fingerprint,
        contentHash: last.contentHash,
      });
      if (cancelled || !cached?.aiData) return;
      const norm = normalizeAnalyzeApiPayload(cached.aiData);
      if (norm) {
        pendingNewAnalysisRef.current = false;
        applyAnalysisResult(cached.fileUrl, norm, last.fingerprint, last.contentHash);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId, imageUri, applyAnalysisResult]);

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
        analyzeFetchFailedRef.current = false;
      }

      try {
        let contentHash = await resolveContentHash(imageUri);
        if (contentHash) analyzedContentHashRef.current = contentHash;

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
          analyzeFetchFailedRef.current = false;
          applyAnalysisResult(
            result.fileUrl,
            result.aiData,
            imageFingerprint,
            contentHash,
            [localImageFingerprintRef.current].filter(Boolean) as string[],
          );
          if (!result.aiData?.reused && !result.aiData?.cached) {
            void refreshIntake();
          }
        } else {
          const err = result as Extract<AnalyzePhotoResult, { ok: false }>;
          const fetchFailed =
            err.errorCode === "image_fetch_failed" ||
            err.errorCode === "image_fetch_timeout";
          if (fetchFailed) analyzeFetchFailedRef.current = true;
          setPhase("error");
          setErrorText(
            err.phase === "session"
              ? t("chat.sessionExpired")
              : fetchFailed
                ? t("treatmentGuide.analysis.photoProcessFailed")
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
      resolveContentHash,
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

        let contentHash = await resolveContentHash(imageUri);
        if (contentHash) analyzedContentHashRef.current = contentHash;

        const restored = await restoreAnalysisOnly(imageFingerprint, contentHash);
        if (restored) return;

        if (analysisPayload) {
          setPhase("done");
          return;
        }

        if (analyzeFetchFailedRef.current) {
          setPhase("error");
          setErrorText(t("treatmentGuide.analysis.photoProcessFailed"));
          return;
        }

        if (!pendingNewAnalysisRef.current) {
          setPhase("idle");
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
    localImageFingerprintRef.current = normalizeImageFingerprint(uri);
    pendingNewAnalysisRef.current = true;
    analyzeFetchFailedRef.current = false;
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

  const isPhotoBusy =
    phase === "uploading" || phase === "analyzing" || phase === "restoring";

  const chatInitialDraft = useMemo(() => patientNarrative.trim(), [patientNarrative]);

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
          <Text style={styles.pageSub}>{t("treatmentGuide.flow.pageIntro")}</Text>
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
        <Text style={styles.flowIntro}>{t("treatmentGuide.flow.intro")}</Text>

        <GuideFlowSection
          step={1}
          title={t("treatmentGuide.flow.step1.title")}
          hint={t("treatmentGuide.flow.step1.hint")}
        >
          <GuidePhotoStart
            embedded
            hasPhoto={!!displayImageUri}
            onTakePhoto={addPhoto}
            onUploadPhoto={() => void uploadPhotoFromLibrary()}
            uploading={isPhotoBusy}
            showAnalyzeAgain={phase === "done" && !!displayImageUri}
            onAnalyzeAgain={() => {
              analyzeFetchFailedRef.current = false;
              void runPhotoAnalysis({ forceReanalyze: true });
            }}
          />

          {displayImageUri ? (
            <View style={styles.photoPreviewBlock}>
              <Image source={{ uri: displayImageUri }} style={styles.preview} resizeMode="cover" />
              <TouchableOpacity style={styles.linkBtn} onPress={addPhoto} activeOpacity={0.85}>
                <Text style={styles.linkBtnText}>{t("treatmentGuide.retakePhoto")}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </GuideFlowSection>

        <GuideFlowSection
          step={2}
          title={t("treatmentGuide.flow.step2.title")}
          hint={t("treatmentGuide.flow.step2.hint")}
        >
          <GuidePhotoAnalysisCard
            embedded
            displayUri={displayImageUri || undefined}
            phase={photoUiPhase}
            analysisPayload={analysisPayload}
            localized={localized}
            errorText={errorText}
            showTranslatedBadge={showTranslatedBadge}
            onRetry={() => {
              analyzeFetchFailedRef.current = false;
              void runPhotoAnalysis({ forceReanalyze: true });
            }}
          />
        </GuideFlowSection>

        <GuideFlowSection
          step={3}
          title={t("treatmentGuide.flow.step3.title")}
          hint={t("treatmentGuide.flow.step3.hint")}
        >
          <Text style={styles.concernPrompt}>{t("treatmentGuide.flow.step3.prompt")}</Text>
          <GoalChips selectedIds={selectedChipIds} onToggle={handleToggleGoal} saving={savingGoals} />
          {goalsError ? <Text style={styles.errorText}>{goalsError}</Text> : null}
          <TextInput
            style={styles.narrativeInput}
            value={patientNarrative}
            onChangeText={setPatientNarrative}
            placeholder={t("treatmentGuide.narrativePlaceholder")}
            placeholderTextColor="#94a3b8"
            multiline
            textAlignVertical="top"
            maxLength={2000}
          />
        </GuideFlowSection>

        <GuideFlowSection
          step={4}
          title={t("treatmentGuide.flow.step4.title")}
          hint={t("treatmentGuide.flow.step4.hint")}
          isLast
        >
          <IntakeProgressSummary
            subtle
            loading={intakeLoading}
            intakeJourney={intake.intakeJourney}
            flags={flags}
          />

          <UploadGuidance
            embedded
            flags={flags}
            documents={intake.documents}
            sessionId={sessionId}
            clinicId={clinicId}
            intake={intake}
            onIntakeUpdate={applyIntakeState}
            onRefresh={refreshIntake}
            onOpenFiles={goToFiles}
          />

          {!hasClinic && clinicRegionHint ? (
            <Text style={styles.regionHint}>
              {t("treatmentGuide.clinicNetwork.regionAvailable", { cities: clinicRegionHint })}
            </Text>
          ) : null}

          <TouchableOpacity style={styles.secondaryBtn} onPress={goToClinicConnection} activeOpacity={0.88}>
            <Text style={styles.secondaryBtnText}>
              {hasClinic
                ? t("treatmentGuide.next.messageClinicLinked")
                : t("treatmentGuide.next.shareWithClinics")}
            </Text>
          </TouchableOpacity>
          {!hasClinic ? (
            <Text style={styles.ctaHelper}>{t("treatmentGuide.next.shareWithClinicsHelper")}</Text>
          ) : null}

          <View style={styles.chatBlock}>
            <Text style={styles.chatLabel}>{t("treatmentGuide.chat.title")}</Text>
            <Text style={styles.chatHint}>{t("treatmentGuide.chat.subtitle")}</Text>
            {sessionId ? (
              <AiCoordinatorChatView
                embedded
                contextMode="treatment_guide"
                clinicId={clinicId}
                patientId={patientId || null}
                sessionId={sessionId}
                initialDraft={chatInitialDraft}
                priorLeadData={intake.leadData}
                onIntakeUpdate={handleIntakeUpdate}
              />
            ) : (
              <ActivityIndicator size="small" color="#2563eb" style={styles.chatLoader} />
            )}
          </View>

          <ClinicNetworkHint
            embedded
            flags={flags}
            directory={intake.clinicDirectory}
            countryHint={intake.leadData.country}
          />
        </GuideFlowSection>
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
  scrollContent: { paddingHorizontal: 18, paddingTop: 12 },
  flowIntro: {
    fontSize: 14,
    color: "#64748b",
    lineHeight: 21,
    marginBottom: 24,
  },
  photoPreviewBlock: { marginTop: 16 },
  preview: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
    marginBottom: 8,
  },
  concernPrompt: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 20,
    marginBottom: 14,
  },
  regionHint: { fontSize: 12, color: "#64748b", lineHeight: 17, marginVertical: 12 },
  ctaHelper: { fontSize: 12, color: "#94a3b8", lineHeight: 17, marginTop: -6, marginBottom: 16 },
  errorText: { color: "#b91c1c", fontSize: 14, marginBottom: 10, lineHeight: 20 },
  narrativeInput: {
    minHeight: 88,
    marginTop: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0f172a",
    lineHeight: 22,
  },
  linkBtn: { paddingVertical: 4, alignSelf: "flex-start" },
  linkBtnText: { fontSize: 13, fontWeight: "600", color: "#2563eb" },
  secondaryBtn: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  secondaryBtnText: { color: "#334155", fontSize: 15, fontWeight: "600" },
  chatBlock: { marginTop: 20 },
  chatLabel: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  chatHint: { fontSize: 13, color: "#64748b", lineHeight: 18, marginBottom: 12 },
  chatLoader: { marginVertical: 16 },
});
