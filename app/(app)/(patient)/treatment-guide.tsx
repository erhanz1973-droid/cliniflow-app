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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../../lib/language-context";
import { useAuth } from "../../../lib/auth";
import { setLastCapturedImage } from "../../../lib/lastCapturedImage";
import {
  analyzeDualSmilePhotos,
  compressImageForAi,
  type AnalyzePhotoResult,
} from "../../../lib/dentalAnalysisPipeline";
import { getLocalizedDentalAnalysis } from "../../../lib/dentalAnalysisView";
import {
  normalizeAnalyzeApiPayload,
  hasVisibleAnalysisContent,
} from "../../../lib/dentalAnalysisNormalize";
import { goToDentalCamera } from "../../../lib/dentalPhotoNavigation";
import { setSmilePhotoPair, useSmilePhotoPair } from "../../../lib/smilePhotoPair";
import { SmilePhotoStepCard } from "../../../components/smile/SmilePhotoStepCard";
import { SmilePhotoCaptureMotivation } from "../../../components/smile/SmilePhotoCaptureMotivation";
import { pickIntakeImageFromLibrary } from "../../../lib/treatmentGuide/uploadDocument";
import { GuideFlowSection } from "../../../components/treatmentGuide/GuideFlowSection";
import { IntakeProgressSummary } from "../../../components/treatmentGuide/IntakeProgressSummary";
import { leaveToPatientHome } from "../../../lib/safePatientNavigation";
import { getStableTreatmentGuideSessionId } from "../../../lib/treatmentGuide/stableSession";
import { GoalChips } from "../../../components/treatmentGuide/GoalChips";
import { UploadGuidance } from "../../../components/treatmentGuide/UploadGuidance";
import { ClinicNetworkHint } from "../../../components/treatmentGuide/ClinicNetworkHint";
import { ClinicInquiryDraftPanel } from "../../../components/treatmentGuide/ClinicInquiryDraftPanel";
import { saveClinicInquiryDraftForQuote } from "../../../lib/clinicInquiryDraftStorage";
import {
  collectInquiryAttachments,
  filterIncludedInquiryAttachments,
  type InquiryAttachment,
} from "../../../lib/treatmentGuide/collectInquiryAttachments";
import { saveTreatmentGuideWorkspace } from "../../../lib/treatmentGuide/workspaceApi";
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
import { SmileClinicRecommendations } from "../../../components/SmileClinicRecommendations";
import { extractSmileScoreFromPayload } from "../../../lib/smileScore";
import { recordSmileAnalysis } from "../../../lib/recordSmileAnalysis";
import { parseClinicsFromAnalysisPayload } from "../../../lib/smileClinicMapping";
import {
  sha256LocalFileUri,
  normalizeContentHash,
  combineContentHashes,
} from "../../../lib/treatmentGuide/imageContentHash";
import {
  loadLastGuideImage,
  saveLastGuideImage,
} from "../../../lib/treatmentGuide/workflowState";

export default function TreatmentGuideScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, currentLanguage } = useLanguage();
  const { user } = useAuth();
  const params = useLocalSearchParams<{
    imageUri?: string;
    smileUri?: string;
    teethUri?: string;
    clinicId?: string;
    clinic_id?: string;
  }>();
  const storePair = useSmilePhotoPair();
  const [sessionId, setSessionId] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const chipSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyzedFingerprintRef = useRef<string | null>(null);
  const analyzedContentHashRef = useRef<string | null>(null);
  const localImageFingerprintRef = useRef<string | null>(null);
  const analysisInFlightRef = useRef(false);
  const analyzeFetchFailedRef = useRef(false);
  const workspaceHydratedRef = useRef(false);
  const narrativeRestoredRef = useRef(false);
  const inquiryRestoredRef = useRef(false);
  const [guidanceSavedAt, setGuidanceSavedAt] = useState<string | null>(null);
  const [showClinicPrep, setShowClinicPrep] = useState(false);

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
  const [restoredTeethDisplayUri, setRestoredTeethDisplayUri] = useState<string | null>(null);
  const [retakeTarget, setRetakeTarget] = useState<"smile" | "teeth" | "both" | null>(null);

  useEffect(() => {
    const smileParam =
      (typeof params.smileUri === "string" ? params.smileUri.trim() : "") ||
      (typeof params.imageUri === "string" ? params.imageUri.trim() : "");
    const teethParam = typeof params.teethUri === "string" ? params.teethUri.trim() : "";
    if (smileParam || teethParam) {
      setSmilePhotoPair({
        smileUri: smileParam || storePair.smileUri,
        teethUri: teethParam || storePair.teethUri,
      });
    }
  }, [params.smileUri, params.teethUri, params.imageUri]);

  const smilePhotoUri = useMemo(() => {
    const p =
      (typeof params.smileUri === "string" ? params.smileUri.trim() : "") ||
      (typeof params.imageUri === "string" ? params.imageUri.trim() : "");
    return p || String(storePair.smileUri || "").trim() || String(restoredDisplayUri || "").trim();
  }, [params.smileUri, params.imageUri, storePair.smileUri, restoredDisplayUri]);

  const teethPhotoUri = useMemo(() => {
    const p = typeof params.teethUri === "string" ? params.teethUri.trim() : "";
    return p || String(storePair.teethUri || "").trim() || String(restoredTeethDisplayUri || "").trim();
  }, [params.teethUri, storePair.teethUri, restoredTeethDisplayUri]);

  const displayImageUri = smilePhotoUri;
  const displayTeethUri = teethPhotoUri;

  const imageUri = smilePhotoUri;

  const imageFingerprint = useMemo(() => normalizeImageFingerprint(imageUri), [imageUri]);

  const [phase, setPhase] = useState<
    "idle" | "restoring" | "uploading" | "analyzing" | "done" | "error" | "skipped"
  >("idle");
  const [errorText, setErrorText] = useState<string | null>(null);
  const [remoteTeethHttpUrl, setRemoteTeethHttpUrl] = useState<string | null>(null);
  const [analysisPayload, setAnalysisPayload] = useState<Record<string, unknown> | null>(null);
  const [patientNarrative, setPatientNarrative] = useState("");
  const [selectedChipIds, setSelectedChipIds] = useState<TreatmentGoalChipId[]>([]);
  const [savingGoals, setSavingGoals] = useState(false);
  const [goalsError, setGoalsError] = useState<string | null>(null);
  const [inquiryDraftText, setInquiryDraftText] = useState("");
  const [excludedInquiryAttachmentIds, setExcludedInquiryAttachmentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const includedInquiryAttachmentsRef = useRef<InquiryAttachment[]>([]);

  const flags = intake.operationalIntakeFlags;
  const serverTags = flags?.patientReportedTags || intake.leadData.patientReportedTags || [];

  useEffect(() => {
    setSelectedChipIds(tagsToChipIds(serverTags));
  }, [serverTags.join("|")]);

  const localized = useMemo(
    () => getLocalizedDentalAnalysis(analysisPayload, currentLanguage),
    [analysisPayload, currentLanguage],
  );

  const hasSavedGuidance = useMemo(
    () => hasVisibleAnalysisContent(analysisPayload),
    [analysisPayload],
  );

  const photoUiPhase = useMemo((): PhotoAnalysisUiPhase => {
    if (phase === "error") return "failed";
    if (phase === "done") return "analyzed";
    if (phase === "skipped") return displayImageUri && displayTeethUri ? "uploaded" : "idle";
    if (phase === "idle" && displayImageUri && displayTeethUri && analysisPayload) return "analyzed";
    if (phase === "idle" && displayImageUri && displayTeethUri) return "uploaded";
    return phase;
  }, [phase, displayImageUri, displayTeethUri, analysisPayload]);

  const analysisClinics = useMemo(
    () => parseClinicsFromAnalysisPayload(analysisPayload),
    [analysisPayload],
  );

  const smileScoreData = useMemo(
    () => extractSmileScoreFromPayload(analysisPayload, localized),
    [analysisPayload, localized],
  );

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
    workspaceHydratedRef.current = false;
    narrativeRestoredRef.current = false;
    inquiryRestoredRef.current = false;
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
      opts?: { savedAt?: string | null; skipWorkspaceSave?: boolean },
    ) => {
      const norm = normalizeAnalyzeApiPayload(aiData);
      if (!hasVisibleAnalysisContent(norm)) return;

      const stableFingerprint = normalizeImageFingerprint(fileUrl);
      analyzedFingerprintRef.current = stableFingerprint;
      const hash = normalizeContentHash(contentHash);
      if (hash) analyzedContentHashRef.current = hash;
      setLastCapturedImage(fileUrl);
      setRestoredDisplayUri(fileUrl);
      setAnalysisPayload(norm);
      setPhase("done");
      setErrorText(null);
      analyzeFetchFailedRef.current = false;

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

      const analyzedAt = opts?.savedAt || new Date().toISOString();
      setGuidanceSavedAt(analyzedAt);
      void recordSmileAnalysis(patientId, norm, {
        fileUrl,
        contentHash: hash,
        analyzedAt: Date.parse(analyzedAt) || Date.now(),
      });
      if (sessionId && !opts?.skipWorkspaceSave) {
        void saveTreatmentGuideWorkspace({
          sessionId,
          photoUrl: fileUrl,
          contentHash: hash || null,
          photoSavedAt: analyzedAt,
          analysisSavedAt: analyzedAt,
          analysisSnapshot: norm,
          patientNarrative: patientNarrative.trim() || undefined,
          inquiryDraftText: inquiryDraftText.trim() || undefined,
        });
      }
    },
    [patientId, sessionId, patientNarrative, inquiryDraftText],
  );

  const restoreSavedGuidance = useCallback(
    (
      photoUrl: string,
      aiData: Record<string, unknown>,
      contentHash?: string | null,
      savedAt?: string | null,
    ): boolean => {
      if (!hasVisibleAnalysisContent(aiData)) return false;
      const fp = normalizeImageFingerprint(photoUrl);
      applyAnalysisResult(photoUrl, aiData, fp, contentHash, [], {
        savedAt: savedAt || undefined,
        skipWorkspaceSave: true,
      });
      return true;
    },
    [applyAnalysisResult],
  );

  const restoreAnalysisOnly = useCallback(
    async (fingerprint: string, contentHash?: string | null): Promise<boolean> => {
      const hash = normalizeContentHash(contentHash);
      const cached = await loadTreatmentGuideAnalysisCacheAny(patientId, {
        fingerprint,
        contentHash: hash,
      });
      if (!cached?.aiData) return false;
      const savedAt = cached.cachedAt
        ? new Date(cached.cachedAt).toISOString()
        : undefined;
      return restoreSavedGuidance(
        cached.fileUrl,
        cached.aiData,
        hash || cached.contentHash,
        savedAt,
      );
    },
    [patientId, restoreSavedGuidance],
  );

  /** Restore saved workspace from server + local cache — never auto-run analysis. */
  useEffect(() => {
    if (!patientId || !sessionId || workspaceHydratedRef.current || intakeLoading) return;

    const ws = intake.treatmentGuideWorkspace;
    let cancelled = false;
    void (async () => {
      const photoFromServer = ws?.photoUrl?.trim() || "";
      const paramUri = typeof params.imageUri === "string" ? params.imageUri.trim() : "";

      if (photoFromServer && !paramUri) {
        setRestoredDisplayUri(photoFromServer);
        setLastCapturedImage(photoFromServer);
        analyzedFingerprintRef.current = normalizeImageFingerprint(photoFromServer);
        if (ws?.contentHash) analyzedContentHashRef.current = ws.contentHash;
      }

      if (paramUri) {
        setLastCapturedImage(paramUri);
        if (!paramUri.startsWith("http")) {
          localImageFingerprintRef.current = normalizeImageFingerprint(paramUri);
        }
        const fp = normalizeImageFingerprint(paramUri);
        const hash = paramUri.startsWith("http") ? ws?.contentHash || "" : await resolveContentHash(paramUri);
        if (cancelled) return;
        if (hash) analyzedContentHashRef.current = hash;
        const cached = await loadTreatmentGuideAnalysisCacheAny(patientId, {
          fingerprint: fp,
          contentHash: hash || ws?.contentHash || null,
        });
        if (cached?.aiData) {
          restoreSavedGuidance(cached.fileUrl, cached.aiData, hash || cached.contentHash);
          return;
        }
        if (ws?.analysisSnapshot && ws.photoUrl) {
          restoreSavedGuidance(ws.photoUrl, ws.analysisSnapshot, ws.contentHash, ws.analysisSavedAt);
          return;
        }
        setPhase("idle");
        setAnalysisPayload(null);
        return;
      }

      if (ws?.analysisSnapshot) {
        const photo = photoFromServer || ws.photoUrl || "";
        if (photo) {
          restoreSavedGuidance(photo, ws.analysisSnapshot, ws.contentHash, ws.analysisSavedAt);
        }
      }

      if (!hasVisibleAnalysisContent(analysisPayload) && photoFromServer) {
        const cached = await loadTreatmentGuideAnalysisCacheAny(patientId, {
          fingerprint: normalizeImageFingerprint(photoFromServer),
          contentHash: ws?.contentHash || null,
        });
        if (cancelled) return;
        if (cached?.aiData) {
          restoreSavedGuidance(
            cached.fileUrl,
            cached.aiData,
            ws?.contentHash,
            ws?.analysisSavedAt,
          );
        } else if (!hasVisibleAnalysisContent(analysisPayload)) {
          setPhase("idle");
        }
      } else if (!hasVisibleAnalysisContent(analysisPayload)) {
        const last = await loadLastGuideImage(patientId);
        if (cancelled || !last?.displayUri) {
          setPhase("skipped");
          return;
        }
        setRestoredDisplayUri(last.displayUri);
        setLastCapturedImage(last.remoteUrl || last.displayUri);
        const cached = await loadTreatmentGuideAnalysisCacheAny(patientId, {
          fingerprint: last.fingerprint,
          contentHash: last.contentHash,
        });
        if (cached?.aiData) {
          restoreSavedGuidance(cached.fileUrl, cached.aiData, last.contentHash);
        } else if (!hasVisibleAnalysisContent(analysisPayload)) {
          setPhase("idle");
        }
      }

      if (!narrativeRestoredRef.current && ws?.patientNarrative) {
        narrativeRestoredRef.current = true;
        setPatientNarrative(ws.patientNarrative);
      }
      if (!inquiryRestoredRef.current && ws?.inquiryDraftText) {
        inquiryRestoredRef.current = true;
        setInquiryDraftText(ws.inquiryDraftText);
      }

      if (!cancelled) workspaceHydratedRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once per session load
  }, [patientId, sessionId, intakeLoading, intake.treatmentGuideWorkspace, restoreSavedGuidance]);

  /** Re-apply guidance when intake refresh returns workspace (e.g. after focus) without wiping UI. */
  useEffect(() => {
    if (!workspaceHydratedRef.current || hasSavedGuidance) return;
    const ws = intake.treatmentGuideWorkspace;
    if (!ws?.analysisSnapshot || !ws.photoUrl) return;
    restoreSavedGuidance(ws.photoUrl, ws.analysisSnapshot, ws.contentHash, ws.analysisSavedAt);
  }, [
    intake.treatmentGuideWorkspace,
    hasSavedGuidance,
    restoreSavedGuidance,
  ]);

  useEffect(() => {
    if (!sessionId || !workspaceHydratedRef.current) return;
    const tid = setTimeout(() => {
      void saveTreatmentGuideWorkspace({
        sessionId,
        patientNarrative,
        inquiryDraftText,
        photoUrl: displayImageUri?.startsWith("http") ? displayImageUri : null,
        contentHash: analyzedContentHashRef.current,
        ...(hasSavedGuidance && analysisPayload
          ? { analysisSnapshot: analysisPayload, analysisSavedAt: guidanceSavedAt }
          : {}),
      });
    }, 900);
    return () => clearTimeout(tid);
  }, [
    sessionId,
    patientNarrative,
    inquiryDraftText,
    displayImageUri,
    analysisPayload,
    guidanceSavedAt,
    hasSavedGuidance,
    analysisPayload,
  ]);

  const runPhotoAnalysis = useCallback(
    async (opts: { forceReanalyze?: boolean } = {}) => {
      if (!smilePhotoUri || !teethPhotoUri || !token || !patientId) return;
      if (analysisInFlightRef.current) return;

      const force = opts.forceReanalyze === true;
      if (!force && hasSavedGuidance) {
        setPhase("done");
        return;
      }

      const ws = intake.treatmentGuideWorkspace;
      if (!force && ws?.analysisSnapshot && ws.photoUrl) {
        if (
          restoreSavedGuidance(
            ws.photoUrl,
            ws.analysisSnapshot,
            ws.contentHash,
            ws.analysisSavedAt,
          )
        ) {
          return;
        }
      }

      analysisInFlightRef.current = true;
      setPhase(force ? "analyzing" : "uploading");
      setErrorText(null);
      setRetakeTarget(null);
      if (force) {
        setAnalysisPayload(null);
        analyzeFetchFailedRef.current = false;
      }

      try {
        const smileHash = await resolveContentHash(smilePhotoUri);
        const teethHash = await resolveContentHash(teethPhotoUri);
        const combinedFingerprint = normalizeImageFingerprint(
          `${smilePhotoUri}|${teethPhotoUri}`,
        );
        if (smileHash && teethHash) {
          analyzedContentHashRef.current = await combineContentHashes(smileHash, teethHash);
        }

        if (!force) {
          const restored = await restoreAnalysisOnly(combinedFingerprint, analyzedContentHashRef.current);
          if (restored) return;
        }

        setPhase("analyzing");
        const result = await analyzeDualSmilePhotos({
          smileUri: smilePhotoUri,
          teethUri: teethPhotoUri,
          patientId,
          token,
          sessionId,
          lang: currentLanguage,
          forceReanalyze: force,
          smileContentHash: smileHash,
          teethContentHash: teethHash,
        });

        if (result.ok) {
          analyzeFetchFailedRef.current = false;
          const teethRemote = String(result.aiData?.teethImageUrl || "").trim();
          if (/^https?:\/\//i.test(teethRemote)) setRemoteTeethHttpUrl(teethRemote);
          applyAnalysisResult(
            result.fileUrl,
            result.aiData,
            combinedFingerprint,
            analyzedContentHashRef.current,
            [localImageFingerprintRef.current].filter(Boolean) as string[],
          );
          if (!result.aiData?.reused && !result.aiData?.cached) {
            void refreshIntake();
          }
        } else {
          const err = result as Extract<AnalyzePhotoResult, { ok: false }>;
          const fetchFailed =
            err.errorCode === "image_fetch_failed" ||
            err.errorCode === "teeth_image_fetch_failed" ||
            err.errorCode === "image_fetch_timeout";
          if (fetchFailed) analyzeFetchFailedRef.current = true;
          const retake = String(err.aiData?.retakeTarget || "").trim();
          if (retake === "smile" || retake === "teeth" || retake === "both") {
            setRetakeTarget(retake);
          } else if (err.errorCode === "photo_unusable") {
            setRetakeTarget("both");
          }
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
      }
    },
    [
      smilePhotoUri,
      teethPhotoUri,
      patientId,
      token,
      currentLanguage,
      applyAnalysisResult,
      restoreAnalysisOnly,
      refreshIntake,
      resolveContentHash,
      t,
      hasSavedGuidance,
      intake.treatmentGuideWorkspace,
      restoreSavedGuidance,
    ],
  );

  const goToFiles = useCallback(() => {
    router.push("/(patient)/files" as never);
  }, [router]);

  const clinicRegionHint = useMemo(() => {
    if (hasClinic) return null;
    const cities = intake.clinicDirectory?.cities;
    if (!cities?.length) return null;
    return cities.slice(0, 4).join(", ");
  }, [hasClinic, intake.clinicDirectory?.cities]);

  const addSmilePhoto = useCallback(() => {
    goToDentalCamera(router, "smile");
  }, [router]);

  const addTeethPhoto = useCallback(() => {
    goToDentalCamera(router, "closeup_teeth");
  }, [router]);

  const uploadSmileFromLibrary = useCallback(async () => {
    const picked = await pickIntakeImageFromLibrary();
    if (!picked?.uri) return;
    const uri = picked.uri.trim();
    setSmilePhotoPair({ smileUri: uri });
    setRestoredDisplayUri(null);
    setAnalysisPayload(null);
    setGuidanceSavedAt(null);
    setPhase("idle");
    setLastCapturedImage(uri);
    router.setParams({ smileUri: uri } as never);
  }, [router]);

  const uploadTeethFromLibrary = useCallback(async () => {
    const picked = await pickIntakeImageFromLibrary();
    if (!picked?.uri) return;
    const uri = picked.uri.trim();
    setSmilePhotoPair({ teethUri: uri });
    setRestoredTeethDisplayUri(null);
    setAnalysisPayload(null);
    setGuidanceSavedAt(null);
    setPhase("idle");
    router.setParams({ teethUri: uri } as never);
  }, [router]);

  const bothPhotosReady = !!smilePhotoUri && !!teethPhotoUri;

  const isPhotoBusy =
    phase === "uploading" || phase === "analyzing" || phase === "restoring";


  const photoGuidanceSummary = useMemo(() => {
    const parts = [localized.summary, localized.recommendation].map((s) => String(s || "").trim()).filter(Boolean);
    return parts.join(" ");
  }, [localized.summary, localized.recommendation]);

  const dentalPhotoHttpUrl = useMemo(() => {
    const uri = String(displayImageUri || "").trim();
    return /^https?:\/\//i.test(uri) ? uri : undefined;
  }, [displayImageUri]);

  const teethPhotoHttpUrl = useMemo(() => {
    const fromPayload = String(analysisPayload?.teethImageUrl || "").trim();
    if (/^https?:\/\//i.test(fromPayload)) return fromPayload;
    const uri = String(remoteTeethHttpUrl || displayTeethUri || "").trim();
    return /^https?:\/\//i.test(uri) ? uri : undefined;
  }, [analysisPayload?.teethImageUrl, remoteTeethHttpUrl, displayTeethUri]);

  const buildIncludedInquiryAttachments = useCallback((): InquiryAttachment[] => {
    const all = collectInquiryAttachments({
      documents: intake.documents,
      dentalPhotoUrl: dentalPhotoHttpUrl,
      sessionPhotoUrl: dentalPhotoHttpUrl,
      t,
    });
    return filterIncludedInquiryAttachments(all, excludedInquiryAttachmentIds);
  }, [intake.documents, dentalPhotoHttpUrl, excludedInquiryAttachmentIds, t]);

  const handleToggleInquiryAttachment = useCallback((id: string) => {
    setExcludedInquiryAttachmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const persistInquiryDraft = useCallback(async () => {
    const text = inquiryDraftText.trim();
    const attachments = buildIncludedInquiryAttachments();
    if (!text && attachments.length === 0) return;
    await saveClinicInquiryDraftForQuote({
      text,
      attachments,
      savedAt: Date.now(),
    });
  }, [inquiryDraftText, buildIncludedInquiryAttachments]);

  const handleRequestOffers = useCallback(() => {
    void (async () => {
      await persistInquiryDraft();
      router.push("/clinic-onboarding" as never);
    })();
  }, [persistInquiryDraft, router]);

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
          <Text style={styles.pageSub}>
            {hasSavedGuidance
              ? t("treatmentGuide.flow.resultPageIntro")
              : t("treatmentGuide.flow.pageIntro")}
          </Text>
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
        {!hasSavedGuidance ? (
          <View style={styles.heroWrap}>
            <SmilePhotoCaptureMotivation compact />
          </View>
        ) : null}
        {!hasSavedGuidance && intake.treatmentGuideWorkspace?.photoUrl ? (
          <Text style={styles.savedWorkspaceHint}>{t("treatmentGuide.workspace.savedHint")}</Text>
        ) : null}

        {hasSavedGuidance ? (
          <View style={styles.resultFirstWrap}>
            <GuidePhotoAnalysisCard
              embedded
              resultFirst
              displayUri={displayImageUri || undefined}
              teethDisplayUri={displayTeethUri || undefined}
              phase={photoUiPhase}
              analysisPayload={analysisPayload}
              localized={localized}
              errorText={errorText}
              retakeTarget={retakeTarget}
              showTranslatedBadge={showTranslatedBadge}
              guidanceSavedAt={guidanceSavedAt}
              clinicId={clinicId || undefined}
              clinics={analysisClinics}
              photoHttpUrl={dentalPhotoHttpUrl}
              teethPhotoHttpUrl={teethPhotoHttpUrl}
              onRetry={() => {
                analyzeFetchFailedRef.current = false;
                void runPhotoAnalysis({ forceReanalyze: true });
              }}
              onRetakeSmilePhoto={addSmilePhoto}
              onRetakeTeethPhoto={addTeethPhoto}
            />
          </View>
        ) : null}

        <GuideFlowSection
          step={hasSavedGuidance ? 2 : 1}
          title={t("smileDualFlow.sectionTitle")}
          hint={
            hasSavedGuidance
              ? t("treatmentGuide.flow.photosRetakeHint")
              : t("smileDualFlow.sectionHint")
          }
        >
          <SmilePhotoStepCard
            stepNumber={1}
            mode="smile"
            photoUri={smilePhotoUri || undefined}
            onCapture={addSmilePhoto}
            onUpload={() => void uploadSmileFromLibrary()}
            onRetake={addSmilePhoto}
            disabled={isPhotoBusy}
            completed={!!smilePhotoUri}
          />
          <SmilePhotoStepCard
            stepNumber={2}
            mode="closeup_teeth"
            photoUri={teethPhotoUri || undefined}
            onCapture={addTeethPhoto}
            onUpload={() => void uploadTeethFromLibrary()}
            onRetake={addTeethPhoto}
            disabled={isPhotoBusy}
            completed={!!teethPhotoUri}
          />

          {bothPhotosReady && !hasSavedGuidance && !isPhotoBusy && phase !== "error" ? (
            <TouchableOpacity
              style={styles.analyzePrimaryBtn}
              onPress={() => {
                analyzeFetchFailedRef.current = false;
                void runPhotoAnalysis({ forceReanalyze: false });
              }}
              activeOpacity={0.88}
            >
              <Text style={styles.analyzePrimaryText}>{t("treatmentGuide.photoStart.getGuidance")}</Text>
            </TouchableOpacity>
          ) : null}

          {hasSavedGuidance && !isPhotoBusy ? (
            <TouchableOpacity
              style={styles.analyzeAgainBtn}
              onPress={() => {
                analyzeFetchFailedRef.current = false;
                void runPhotoAnalysis({ forceReanalyze: true });
              }}
              activeOpacity={0.88}
            >
              <Text style={styles.analyzeAgainText}>{t("treatmentGuide.photoStart.analyzeAgain")}</Text>
            </TouchableOpacity>
          ) : null}
        </GuideFlowSection>

        {!hasSavedGuidance ? (
          <GuideFlowSection
            step={2}
            title={t("treatmentGuide.flow.step2.title")}
            hint={t("treatmentGuide.flow.step2.hint")}
          >
            <GuidePhotoAnalysisCard
              embedded
              displayUri={displayImageUri || undefined}
              teethDisplayUri={displayTeethUri || undefined}
              phase={photoUiPhase}
              analysisPayload={analysisPayload}
              localized={localized}
              errorText={errorText}
              retakeTarget={retakeTarget}
              showTranslatedBadge={showTranslatedBadge}
              guidanceSavedAt={guidanceSavedAt}
              clinicId={clinicId || undefined}
              clinics={analysisClinics}
              photoHttpUrl={dentalPhotoHttpUrl}
              teethPhotoHttpUrl={teethPhotoHttpUrl}
              onRetry={() => {
                analyzeFetchFailedRef.current = false;
                void runPhotoAnalysis({ forceReanalyze: true });
              }}
              onRetakeSmilePhoto={addSmilePhoto}
              onRetakeTeethPhoto={addTeethPhoto}
            />
          </GuideFlowSection>
        ) : null}

        {hasSavedGuidance ? (
          <GuideFlowSection
            step={3}
            title={t("treatmentGuide.flow.step4.title")}
            hint={t("treatmentGuide.flow.step4.hint")}
            isLast={!showClinicPrep}
          >
            <TouchableOpacity
              style={styles.clinicPrepToggle}
              onPress={() => setShowClinicPrep((v) => !v)}
              activeOpacity={0.85}
            >
              <Text style={styles.clinicPrepToggleText}>
                {showClinicPrep
                  ? t("treatmentGuide.flow.hideClinicPrep")
                  : t("treatmentGuide.flow.showClinicPrep")}
              </Text>
              <Ionicons
                name={showClinicPrep ? "chevron-up" : "chevron-down"}
                size={18}
                color="#64748b"
              />
            </TouchableOpacity>

            {showClinicPrep ? (
              <View style={styles.clinicPrepBody}>
                {smileScoreData ? (
                  <View style={styles.optionalClinicBlock}>
                    <SmileClinicRecommendations
                      smileData={smileScoreData}
                      clinics={analysisClinics}
                    />
                  </View>
                ) : null}
                <Text style={styles.concernPrompt}>{t("treatmentGuide.flow.step3.prompt")}</Text>
                <GoalChips
                  selectedIds={selectedChipIds}
                  onToggle={handleToggleGoal}
                  saving={savingGoals}
                />
                {goalsError ? <Text style={styles.errorText}>{goalsError}</Text> : null}
                <TextInput
                  style={styles.narrativeInput}
                  value={patientNarrative}
                  onChangeText={(v) => {
                    narrativeRestoredRef.current = true;
                    setPatientNarrative(v);
                  }}
                  placeholder={t("treatmentGuide.narrativePlaceholder")}
                  placeholderTextColor="#94a3b8"
                  multiline
                  textAlignVertical="top"
                  maxLength={2000}
                />

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
                  patientId={patientId}
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

                <ClinicInquiryDraftPanel
                  flags={flags}
                  leadData={intake.leadData}
                  documents={intake.documents}
                  patientNarrative={patientNarrative}
                  photoGuidanceSummary={photoGuidanceSummary || undefined}
                  hasDentalPhoto={!!displayImageUri}
                  dentalPhotoUrl={dentalPhotoHttpUrl}
                  draftText={inquiryDraftText}
                  onDraftTextChange={(v) => {
                    inquiryRestoredRef.current = true;
                    setInquiryDraftText(v);
                  }}
                  excludedAttachmentIds={excludedInquiryAttachmentIds}
                  onToggleAttachmentExclude={handleToggleInquiryAttachment}
                  onIncludedAttachmentsChange={(atts) => {
                    includedInquiryAttachmentsRef.current = atts;
                  }}
                  onRequestOffers={handleRequestOffers}
                />

                <ClinicNetworkHint
                  embedded
                  flags={flags}
                  directory={intake.clinicDirectory}
                  countryHint={intake.leadData.country}
                />
              </View>
            ) : null}
          </GuideFlowSection>
        ) : (
          <>
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
                onChangeText={(v) => {
                  narrativeRestoredRef.current = true;
                  setPatientNarrative(v);
                }}
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
                patientId={patientId}
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

              <ClinicInquiryDraftPanel
                flags={flags}
                leadData={intake.leadData}
                documents={intake.documents}
                patientNarrative={patientNarrative}
                photoGuidanceSummary={photoGuidanceSummary || undefined}
                hasDentalPhoto={!!displayImageUri}
                dentalPhotoUrl={dentalPhotoHttpUrl}
                draftText={inquiryDraftText}
                onDraftTextChange={(v) => {
                  inquiryRestoredRef.current = true;
                  setInquiryDraftText(v);
                }}
                excludedAttachmentIds={excludedInquiryAttachmentIds}
                onToggleAttachmentExclude={handleToggleInquiryAttachment}
                onIncludedAttachmentsChange={(atts) => {
                  includedInquiryAttachmentsRef.current = atts;
                }}
                onRequestOffers={handleRequestOffers}
              />

              <ClinicNetworkHint
                embedded
                flags={flags}
                directory={intake.clinicDirectory}
                countryHint={intake.leadData.country}
              />
            </GuideFlowSection>
          </>
        )}
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
  heroWrap: { marginBottom: 16 },
  resultFirstWrap: { marginBottom: 24, paddingBottom: 24, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
  flowIntro: {
    fontSize: 14,
    color: "#64748b",
    lineHeight: 21,
    marginBottom: 8,
  },
  savedWorkspaceHint: {
    fontSize: 13,
    color: "#059669",
    lineHeight: 18,
    marginBottom: 20,
    fontWeight: "600",
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
  analyzePrimaryBtn: {
    marginTop: 4,
    backgroundColor: "#0f172a",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  analyzePrimaryText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  analyzeAgainBtn: {
    marginTop: 8,
    paddingVertical: 10,
    alignItems: "center",
  },
  analyzeAgainText: { fontSize: 13, fontWeight: "600", color: "#64748b" },
  optionalClinicBlock: { marginBottom: 20 },
  clinicPrepToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  clinicPrepToggleText: { fontSize: 14, fontWeight: "600", color: "#475569", flex: 1 },
  clinicPrepBody: { marginTop: 16, gap: 0 },
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
});
