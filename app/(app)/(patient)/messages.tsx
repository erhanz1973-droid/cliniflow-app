import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Socket } from "socket.io-client";
import { useRouter, useLocalSearchParams, useNavigation, useFocusEffect } from "expo-router";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image,
  Linking,
  Modal,
  ScrollView,
  ActionSheetIOS,
  type ListRenderItemInfo,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import {
  ensureCameraAccess,
  ensureMediaLibraryAccessForPicker,
  launchImageLibraryPlayStoreSafe,
} from "../../../lib/mediaPicker";
import * as FileSystem from "expo-file-system/legacy";
import * as DocumentPicker from "expo-document-picker";
import { safeGetItem, safeRemoveItem, safeSetItem } from "../../../lib/asyncStorageSafe";
import { useAuth } from "../../../lib/auth";
import { API_BASE } from "../../../lib/api";
import { onIntraoralPhotoReady } from "../../../lib/photoCallbacks";
import { useDateLocale } from "../../../lib/date-locale";
import { useUnreadMessages } from "../../../lib/useUnreadMessages";
import { useLanguage } from "../../../lib/language-context";
import { useDeviceGuidanceOptional } from "../../../lib/deviceGuidanceContext";
import { isLowStorageLikeError } from "../../../lib/lowStorageError";
import { trackEvent } from "../../../lib/analytics/trackEvent";
import { useSelectedChatClinic } from "../../../lib/useSelectedChatClinic";
import { runSmileSimulationWithImageUrl } from "../../../lib/smileSimulation";
import { QUOTE_REQUEST_PREFILL_IMAGE_KEY } from "../../../lib/quotePrefill";
import { setLastCapturedImage } from "../../../lib/lastCapturedImage";
import { analyzePhoto, type AnalyzePhotoResult } from "../../../lib/dentalAnalysisPipeline";
import { goToAnalysis } from "../../../lib/dentalPhotoNavigation";
import { goToChat, openFilePicker } from "../../../lib/chatFlow";
import { goToAiCoordinator } from "../../../lib/aiCoordinator";
import { goToTreatmentGuide } from "../../../lib/treatmentGuideNavigation";
import { saveToFiles } from "../../../lib/saveToFiles";
import { sendMessage } from "../../../lib/sendMessage";
import {
  trackMetaContactClinicOnce,
  trackMetaPhotoUpload,
} from "../../../lib/metaAppEvents";
import { loadClinicInquiryDraftForQuote } from "../../../lib/clinicInquiryDraftStorage";
import {
  setGlobalChatOpen,
  setGlobalOfferChatOpen,
} from "../../../hooks/chatSessionGlobal";
import { useSupabaseMessages } from "../../../hooks/useSupabaseMessages";
import { appendMappedChatMessage, mergeSbMessages, mergeIncomingRows } from "../../../hooks/chatMessageUtils";
import { careTeamLabel, doctorLabel, isClinicAiActor } from "../../../lib/chatSenderLabels";
import {
  subscribePrimaryChatRealtime,
  waitOnceSocketConnected,
} from "../../../lib/chatRealtime";
import {
  resetAppIconBadgeCount,
  postPatientChatAckOpen,
} from "../../../lib/chatAckOpen";
import ToothColorSelector, {
  type ToothColorPreset,
} from "../../../components/ToothColorSelector";
const UPLOAD_CONSENT_KEY = "@clinifly:upload_consent_accepted";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClinicRecommendation = {
  id: string;
  name: string;
  specialty: string;
  city?: string | null;
  rating?: number | null;
  distance?: string | null;   // e.g. "2.3 km" or "800 m" — null when location unavailable
};

type MissingToothOption = {
  title: string;
  explanation: string;
  price: string;
};

/** Rule + vision dental gap classification (not a diagnosis) */
type DentalConditionPayload = {
  condition: "missing_tooth" | "misalignment" | "diastema" | string;
  confidence: "low" | "medium" | "high" | string;
  labelTr: string;
};

/** Non-diagnostic UX when backend heuristic detects missing tooth from AI text */
type MissingToothGuidance = {
  headline: string;
  singleMissing: boolean;
  options: MissingToothOption[];
  disclaimer: string;
  /** Hybrid detector confidence (insight / rule / vision) */
  confidence?: "low" | "medium" | "high";
  sources?: { insight: boolean; ruleGap: boolean; vision: boolean };
};

type AiResult = {
  insights: string[];
  confidence?: "low" | "medium" | "high";
  summary?: string;
  recommendation?: string;
  /** @deprecated use summary */
  overallNote?: string;
  disclaimer: string;
  originalImageUrl?: string;
  simulatedImageUrl?: string;
  clinics?: ClinicRecommendation[];
  /** Heuristic issues from backend (TR), post–AI analysis */
  issues?: string[];
  /** Suggested treatments (TR) */
  treatments?: string[];
  /** Indicative price strings by category key, e.g. { whitening: "150-400$" } */
  priceEstimate?: Record<string, string>;
  /** Implant / bridge guidance when missing tooth heuristic matches (not a diagnosis) */
  missingTooth?: MissingToothGuidance;
  /** Flat flags from API (same as inferring from missingTooth) */
  missingToothDetected?: boolean;
  missingToothConfidence?: "low" | "medium" | "high" | null;
  /** Gap / alignment classification with Turkish label */
  dentalCondition?: DentalConditionPayload;
};

type Attachment = {
  name: string; size?: number; url: string;
  mimeType: string; fileType: "image" | "pdf" | string;
  aiResult?: AiResult;
};

type Message = {
  id: string; from: "PATIENT" | "CLINIC";
  text?: string; type: string;
  attachment?: Attachment;
  createdAt: number;
  thread_id?: string;
  /** Inbound clinic lane (from_role / sender metadata) — optional for sender label */
  inboundKind?: "doctor" | "admin" | "clinic";
  senderName?: string;
  /** true for locally-generated loading bubbles (not persisted) */
  _local?: boolean;
  /** optimistic send — cleared when server row arrives via fetch/socket */
  pending?: boolean;
};

/** FlatList row — precomputed day header so renderItem stays a stable callback. */
type PatientChatListRow = {
  msg: Message;
  showDay: boolean;
};

function patientChatListKey(row: PatientChatListRow): string {
  const id = String(row.msg.id ?? "").trim();
  if (id !== "") return id;
  return `fb-${row.msg.createdAt}-${row.msg.type}-${row.msg.from}`;
}

type PendingAttachment = {
  localUri: string;
  fileId: string | null;
  url: string | null;
  mimeType?: string;
  label?: string;
  isPdf?: boolean;
};

const PRICE_LABEL_TR: Record<string, string> = {
  whitening: "Beyazlatma",
  cleaning: "Temizlik (scaling)",
  orthodontics: "Ortodonti",
  filling: "Dolgu",
  veneer: "Veneer / lamina",
  gum: "Diş eti bakımı",
  implant: "İmplant",
  bridge: "Köprü",
  consultation: "Muayene",
  general: "Genel",
};

function priceEstimateLabel(key: string): string {
  return PRICE_LABEL_TR[key] || key.replace(/_/g, " ");
}

// ─── Intraoral photo steps ────────────────────────────────────────────────────

const PHOTO_STEP_KEYS = [
  { key: "upper", icon: "⬆️" },
  { key: "lower", icon: "⬇️" },
  { key: "front", icon: "😁" },
  { key: "left",  icon: "◀️" },
  { key: "right", icon: "▶️" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ts: number, locale: string) {
  return new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(ts: number, locale: string) {
  return new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

function isSameDay(aTs: number, bTs: number): boolean {
  const a = new Date(aTs);
  const b = new Date(bTs);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Backend GET /api/patient/me/messages → leadAssignment (patient_chat_threads + doctor name) */
type LeadAssignmentInfo = {
  clinicId?: string | null;
  /** patient_chat_threads.id — realtime room chat:{threadId} */
  threadId?: string | null;
  assignedDoctorId?: string | null;
  doctorName?: string | null;
  assignedDoctor?: { id?: string; name?: string | null } | null;
  assignedAt?: string | null;
  /** false after clinic enrollment (same thread; assignee preserved) */
  threadIsLead?: boolean;
};

function leadAssignmentDoctorDisplayName(la: LeadAssignmentInfo | null): string {
  const raw =
    la?.assignedDoctor && typeof la.assignedDoctor.name === "string"
      ? la.assignedDoctor.name
      : la?.doctorName;
  if (raw == null) return "";
  return String(raw)
    .trim()
    .replace(/^dr\.?\s*/i, "")
    .trim();
}

function inboundBubbleLabel(msg: Message, t: (k: string) => string): string {
  if (msg.inboundKind === "admin") return t("messages.senderAdmin");
  if (
    isClinicAiActor({
      senderRole: msg.inboundKind,
      senderName: msg.senderName,
    }) ||
    msg.inboundKind === "clinic"
  ) {
    return careTeamLabel(t);
  }
  if (msg.inboundKind === "doctor") {
    const sn = String(msg.senderName || "").trim();
    return sn || doctorLabel(t);
  }
  return careTeamLabel(t);
}

/** Socket.IO `new_message` — legacy row shape aligned with GET /messages */
function socketLegacyToPatientMessage(raw: Record<string, unknown>): Message | null {
  const id = String(raw.id || "").trim();
  if (!id) return null;
  const fr = String(raw.from || "").toUpperCase();
  const from: Message["from"] = fr === "PATIENT" ? "PATIENT" : "CLINIC";
  let createdAt = Date.now();
  if (typeof raw.createdAt === "number") createdAt = raw.createdAt as number;
  const tidRaw = raw.thread_id ?? raw.threadId;
  const thread_id =
    tidRaw != null && String(tidRaw).trim() !== "" ? String(tidRaw).trim() : undefined;
  // Normalize: message_text / message (DB) → text (Socket.IO/Railway legacy)
  const text = String(raw.message_text ?? raw.text ?? raw.message ?? "");
  if (__DEV__) console.log('[socketLegacyToPatientMessage] FINAL TEXT:', JSON.stringify(text));
  return {
    id,
    from,
    text,
    type: String(raw.type || "text"),
    attachment: raw.attachment as Message["attachment"],
    createdAt,
    ...(thread_id ? { thread_id } : {}),
  };
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const { user } = useAuth();
  const { t, currentLanguage } = useLanguage();
  const deviceGuidance = useDeviceGuidanceOptional();
  const locale = useDateLocale();
  const router = useRouter();
  const navigation = useNavigation();
  const routeParams = useLocalSearchParams<{
    clinicId?: string;
    clinic_id?: string;
    clinicCode?: string;
    offerPrefillImage?: string;
    prefillComposer?: string;
    prefillText?: string;
    prefillInquiry?: string;
  }>();
  const { selectedClinic, ready: selectedClinicReady } = useSelectedChatClinic(user, {
    clinicId: routeParams.clinicId,
    clinic_id: routeParams.clinic_id,
    clinicCode: routeParams.clinicCode,
  });
  /** Active thread: deep link → JWT → persisted/lead selected clinic (`useSelectedChatClinic`). */
  const chatClinicId = useMemo(
    () =>
      String(
        routeParams.clinicId ||
          routeParams.clinic_id ||
          user?.clinicId ||
          (selectedClinic?.id || '') ||
          ''
      ).trim(),
    [
      routeParams.clinicId,
      routeParams.clinic_id,
      user?.clinicId,
      selectedClinic?.id,
    ]
  );

  const [messages, setMessages]                   = useState<Message[]>([]);
  const [localMessages, setLocalMessages]         = useState<Message[]>([]);
  const [loading, setLoading]                     = useState(true);
  const [text, setText]                           = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const composerSeededRef                         = useRef(false);
  const [sending, setSending]                     = useState(false);
  const [uploading, setUploading]                 = useState(false);
  const [intraoralVisible, setIntraoralVisible]   = useState(false);
  const [intraoralStep, setIntraoralStep]         = useState(0);
  const [intraoralPhotos, setIntraoralPhotos]     = useState<Record<string, any>>({});

  const flatRef           = useRef<FlatList>(null);
  const chatSocketRef     = useRef<Socket | null>(null);
  const lastCountRef      = useRef(0);
  /** In-app ding when foreground + new inbound clinic/staff rows (poll). */
  const seenServerMessageIdsRef = useRef<Set<string>>(new Set());
  const chatInboundIdsPrimedRef = useRef(false);
  const sendingRef = useRef(false);
  /** Tracks last seen assigned doctor id so assignment changes can show a new one-time banner. */
  const prevAidForBannerRef = useRef<string | null>(null);
  /** After first eligible banner show in this screen session, skip re-evaluating visibility (avoids hiding after AsyncStorage is set). */
  const assignBannerEverShownRef = useRef(false);
  const [leadAssignment, setLeadAssignment] = useState<LeadAssignmentInfo | null>(null);
  const [showDoctorBanner, setShowDoctorBanner] = useState(false);
  const [chatRealtimeConnected, setChatRealtimeConnected] = useState(false);

  const patientId = String(user?.patientId || "").trim();
  const token      = user?.token;
  // hasClinic: true if JWT has clinicId OR if a clinic was selected/persisted (e.g. via offer flow)
  const hasClinic  = !!user?.clinicId || (selectedClinicReady && !!selectedClinic?.id);
  const { markRead } = useUnreadMessages(patientId || undefined, token || undefined);

  // Register intraoral camera bridge — always calls the latest processPhotoWithAI via ref
  useEffect(() => {
    onIntraoralPhotoReady((uri, name, mimeType, photoType) => {
      processPhotoRef.current?.(uri, name, mimeType, photoType);
    });
  }, []);

  // Default composer text once (UX: higher reply / offer intent)
  useEffect(() => {
    if (composerSeededRef.current) return;
    composerSeededRef.current = true;
    setText(t("messages.defaultComposerText"));
  }, [t]);

  // Deep link: prefill image + clinic inquiry draft (text + all uploaded documents)
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const raw =
        typeof routeParams.offerPrefillImage === "string"
          ? routeParams.offerPrefillImage.trim()
          : "";
      if (raw) {
        setLastCapturedImage(raw);
        setPendingAttachments((prev) => [
          ...prev,
          {
            localUri: raw,
            fileId: null,
            url: /^https?:\/\//i.test(raw) ? raw : null,
          },
        ]);
      }

      const pt =
        typeof routeParams.prefillText === "string"
          ? routeParams.prefillText.trim()
          : "";
      if (routeParams.prefillComposer === "1" && !pt) {
        setText(t("messages.defaultComposerText"));
      } else if (pt) {
        setText(pt);
      }

      const loadInquiry =
        routeParams.prefillInquiry === "1" || routeParams.prefillComposer === "1";
      if (loadInquiry) {
        const stored = await loadClinicInquiryDraftForQuote();
        if (cancelled) return;
        if (stored?.text?.trim() && !pt) {
          setText(stored.text.trim());
        }
        if (stored?.attachments?.length) {
          const pendingFromInquiry = stored.attachments
            .filter((a) => /^https?:\/\//i.test(String(a.url || "")))
            .map((a) => ({
              localUri: String(a.thumbnailUrl || a.url),
              fileId:
                a.id.startsWith("session_") || a.id.startsWith("legacy_") ? null : a.id,
              url: String(a.url),
              mimeType: a.mimeType,
              label: a.label,
              isPdf: a.kind === "pdf",
            }));
          if (pendingFromInquiry.length > 0) {
            setPendingAttachments((prev) => {
              const seen = new Set(prev.map((p) => String(p.url || p.localUri).split("?")[0]));
              const merged = [...prev];
              for (const p of pendingFromInquiry) {
                const key = String(p.url || p.localUri).split("?")[0];
                if (seen.has(key)) continue;
                seen.add(key);
                merged.push(p);
              }
              return merged;
            });
          }
        } else if (stored?.photoUrls?.length) {
          setPendingAttachments((prev) => {
            const seen = new Set(prev.map((p) => String(p.url || "").split("?")[0]));
            const merged = [...prev];
            for (const url of stored.photoUrls!) {
              const key = url.split("?")[0];
              if (seen.has(key)) continue;
              seen.add(key);
              merged.push({ localUri: url, fileId: null, url });
            }
            return merged;
          });
        }
      }

      if (raw || pt || routeParams.prefillComposer === "1" || routeParams.prefillInquiry === "1") {
        navigation.setParams({
          offerPrefillImage: undefined,
          prefillComposer: undefined,
          prefillText: undefined,
          prefillInquiry: undefined,
        } as any);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    routeParams.offerPrefillImage,
    routeParams.prefillComposer,
    routeParams.prefillText,
    routeParams.prefillInquiry,
    navigation,
    t,
  ]);

  // Ref so pickImage() / processPhotoWithAI() are always latest inside effects/bridges
  const pickImageRef       = useRef<(() => Promise<void>) | undefined>(undefined);
  const processPhotoRef    = useRef<typeof processPhotoWithAI | undefined>(undefined);

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  }), [token]);

  // ── Supabase: TEK KAYNAK (yapılandırılmışsa Railway GET + Socket.IO atlanır) ───────────
  const { messages: sbMessages, ready: sbReady, configured: sbConfigured, timedOut: sbTimedOut } =
    useSupabaseMessages({ patientId, clinicId: chatClinicId });

  // Supabase mesajları state'e additif olarak sync et — local/pending satırlarını koru
  // ✅ Mevcut objeleri ASLA mutate etme, sadece yeni id'leri push et
  useEffect(() => {
    if (!sbConfigured || !sbReady) return;
    const sbMsgs = sbMessages as unknown as Message[];
    setMessages(prev => {
      const next = mergeSbMessages(prev, sbMsgs, m => !!(m._local || m.pending));
      // _local/pending optimistic mesajını kaldır — Supabase aynı text+from+zaman için gerçek ID'yi taşıdı.
      // Zaman kısıtı: sadece opt oluşturulduktan SONRA (veya 5 sn öncesinde) gelen mesajlar eşleşir.
      return next
        .filter(m => {
          if (!(m._local || m.pending)) return true;
          // tmp-${Date.now()} formatından timestamp çıkar
          const optTs = m.id.startsWith('tmp-') ? Number(m.id.slice(4)) : m.createdAt;
          const hasReal = sbMsgs.some(sb => {
            if (sb.text !== m.text || sb.from !== m.from) return false;
            const sbTs = (sb as unknown as { createdAt: number }).createdAt;
            return sbTs >= optTs - 5_000;
          });
          if (__DEV__ && hasReal) console.log('[messages] ✅ pending removed, real arrived:', m.text);
          return !hasReal;
        })
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(-50);
    });
  }, [sbMessages, sbReady, sbConfigured]);

  // Supabase hazır olunca loading kapat
  useEffect(() => {
    if (sbConfigured && sbReady) setLoading(false);
  }, [sbConfigured, sbReady]);

  // Supabase bağlanamadı (timedOut) → Railway fallback tetikle
  useEffect(() => {
    if (sbConfigured && sbTimedOut && token) {
      if (__DEV__) console.log('[messages] ⚡ Supabase timedOut — Railway fallback');
      void fetchMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sbTimedOut]);

  // ── All messages merged (backend + local) ────────────────────────────────
  // Local ai_result messages are suppressed once the server version arrives
  // (matched by originalImageUrl base path) to avoid duplicates.
  const _serverAiKeys = new Set(
    messages
      .filter(m => m.attachment?.aiResult?.originalImageUrl)
      .map(m => m.attachment!.aiResult!.originalImageUrl!.split("?")[0])
  );
  const _filteredLocal = localMessages.filter(m => {
    if (!m._local || m.type !== "ai_result") return true;
    const k = (m.attachment?.aiResult?.originalImageUrl ?? "").split("?")[0];
    return !k || !_serverAiKeys.has(k); // hide local when server version exists
  });
  const allMessages = [...messages, ..._filteredLocal].sort(
    (a, b) => a.createdAt - b.createdAt
  );

  // `FlatList inverted`: first data row renders at bottom (near composer) → newest first (DESC).
  const chatListData = useMemo<PatientChatListRow[]>(() => {
    const sortedDesc = [...allMessages].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const out: PatientChatListRow[] = [];
    for (let i = 0; i < sortedDesc.length; i++) {
      const item = sortedDesc[i]!;
      const prevItem = i > 0 ? sortedDesc[i - 1]! : null;
      const showDay =
        !prevItem || !isSameDay(prevItem.createdAt, item.createdAt);
      out.push({ msg: item, showDay });
    }
    return out;
  }, [allMessages]);

  const renderPatientChatItem = useCallback(
    ({ item }: ListRenderItemInfo<PatientChatListRow>) => (
      <MessageItem message={item.msg} showDay={item.showDay} />
    ),
    [],
  );

  const patientChatKeyExtractor = useCallback(
    (row: PatientChatListRow) => patientChatListKey(row),
    [],
  );

  const careDoctorDisplay = useMemo(
    () => leadAssignmentDoctorDisplayName(leadAssignment),
    [leadAssignment],
  );
  const enrolledSharedCare = leadAssignment?.threadIsLead === false;

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async (silent = false) => {
    if (!token) { if (!silent) setLoading(false); return; }

    if (sbConfigured && !sbReady && !sbTimedOut) {
      // Supabase yapılandırıldı, henüz bağlanmadı — bekle (sbTimedOut → Railway fallback)
      return;
    }
    if (sbConfigured && sbTimedOut && __DEV__) {
      console.log('[messages] Supabase timeout — Railway devralıyor');
    }

    try {
      const q =
        chatClinicId && String(chatClinicId).trim()
          ? `?clinic_id=${encodeURIComponent(String(chatClinicId).trim())}`
          : "";
      const res = await fetch(
        `${API_BASE}/api/patient/me/messages${q}`,
        { headers: authHeaders() }
      );
      const json = await res.json().catch(() => ({}));
      const msgs: Message[] = Array.isArray(json.messages)
        ? json.messages.sort((a: Message, b: Message) => a.createdAt - b.createdAt)
        : [];

      const laRaw = json.leadAssignment;
      const la: LeadAssignmentInfo | null =
        laRaw && typeof laRaw === "object" ? (laRaw as LeadAssignmentInfo) : null;
      setLeadAssignment(la);

      const nextAid = la?.assignedDoctorId != null ? String(la.assignedDoctorId).trim() : null;

      if (prevAidForBannerRef.current !== nextAid) {
        prevAidForBannerRef.current = nextAid;
        assignBannerEverShownRef.current = false;
      }

      const clinicKey =
        (chatClinicId && String(chatClinicId).trim()) ||
        (la?.clinicId != null ? String(la.clinicId).trim() : "");
      const bannerKey =
        patientId && clinicKey && nextAid
          ? `@cliniflow:doctor_assign_intro_v2:${patientId}:${clinicKey}:${nextAid}`
          : null;

      let skipHint = false;
      if (bannerKey) {
        try {
          skipHint = (await safeGetItem(bannerKey)) === "1";
        } catch {
          skipHint = false;
        }
      }

      const doctorLabel = leadAssignmentDoctorDisplayName(la);
      const eligibleForBanner =
        !!nextAid &&
        !!doctorLabel &&
        !skipHint &&
        la?.threadIsLead !== false;

      // Railway fetch — merge; fill empty Supabase row text from API-mapped bodies
      setMessages((prev) => {
        const byId = new Map<string, Message>();
        for (const m of prev) {
          const id = String(m.id || "").trim();
          if (id) byId.set(id, m);
        }
        for (const api of msgs) {
          const id = String(api.id || "").trim();
          if (!id) continue;
          const existing = byId.get(id);
          const apiText = String(api.text || "").trim();
          if (existing) {
            if (!String(existing.text || "").trim() && apiText) {
              byId.set(id, { ...existing, text: apiText, type: api.type || existing.type });
            }
          } else {
            byId.set(id, api);
          }
        }
        const merged = [...byId.values()].sort((a, b) => a.createdAt - b.createdAt).slice(-50);
        return mergeIncomingRows(prev, merged, (m) => m as Message, {
          sortKey: "createdAt",
          limit: 50,
        });
      });

      for (const m of msgs) {
        const mid = String((m as { id?: string }).id || "").trim();
        if (mid) seenServerMessageIdsRef.current.add(mid);
      }
      chatInboundIdsPrimedRef.current = true;

      if (!nextAid || !doctorLabel) {
        assignBannerEverShownRef.current = false;
        setShowDoctorBanner(false);
      } else if (!assignBannerEverShownRef.current) {
        if (eligibleForBanner) {
          assignBannerEverShownRef.current = true;
          setShowDoctorBanner(true);
          if (bannerKey) {
            await safeSetItem(bannerKey, "1");
          }
        } else {
          setShowDoctorBanner(false);
        }
      }

      if (msgs.length > lastCountRef.current) {
        lastCountRef.current = msgs.length;
        setTimeout(
          () => flatRef.current?.scrollToOffset({ offset: 0, animated: true }),
          100,
        );
      }
    } catch {}
    finally { if (!silent) setLoading(false); }
  }, [token, authHeaders, chatClinicId, patientId, sbConfigured, sbReady, sbTimedOut]);

  /** Supabase realtime + API hydration (fills empty CLINIC bodies from server mapping). */
  useEffect(() => {
    if (!token || !sbConfigured || !sbReady || sbTimedOut) return;
    void fetchMessages(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, patientId, chatClinicId, sbReady, sbConfigured, sbTimedOut]);

  /** Prefer leadAssignment from GET; fall back to first message row (API may hydrate thread before assignment object). */
  const resolvedThreadId = useMemo(() => {
    const la =
      leadAssignment?.threadId != null ? String(leadAssignment.threadId).trim() : "";
    const firstWithThread = messages.find((m) => {
      const t =
        (m as Message).thread_id ?? (m as { threadId?: string }).threadId;
      return t != null && String(t).trim() !== "";
    });
    const fromMsg =
      firstWithThread != null
        ? String(
            (firstWithThread as Message).thread_id ??
              (firstWithThread as { threadId?: string }).threadId ??
              "",
          ).trim()
        : "";
    return la || fromMsg;
  }, [leadAssignment, messages]);

  const patientClinicThreadKeyRef = useRef<string>("");
  useEffect(() => {
    const k = `${patientId}|${chatClinicId}`;
    if (patientClinicThreadKeyRef.current === k) return;
    patientClinicThreadKeyRef.current = k;
    prevAidForBannerRef.current = null;
    assignBannerEverShownRef.current = false;
    seenServerMessageIdsRef.current.clear();
    chatInboundIdsPrimedRef.current = false;
    setShowDoctorBanner(false);
    setLeadAssignment(null);
    setMessages([]);
  }, [patientId, chatClinicId]);

  /** İlk yükleme: HTTP sadece thread (token + hasta + clinic) değiştiğinde. */
  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    void fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kasıtlı: sonsuz yeniden-fetch yok
  }, [token, patientId, chatClinicId]);

  /** Socket.IO — Supabase aktif ve bağlandıysa atlanır; Supabase Realtime devralır. */
  useEffect(() => {
    // Supabase yapılandırıldı ve gerçekten bağlandı (timedOut değil) → Socket.IO gerekmez
    if (sbConfigured && !sbTimedOut) {
      setChatRealtimeConnected(true);
      return () => {};
    }

    const tokenTrim = token?.trim() ?? "";

    if (!tokenTrim) {
      setChatRealtimeConnected(false);
      return () => {};
    }

    if (loading) {
      return () => {};
    }

    if (!resolvedThreadId) {
      console.log("NO THREAD ID YET");
      setChatRealtimeConnected(false);
      return () => {};
    }

    console.log("START REALTIME SOCKET:", resolvedThreadId);

    const { unsubscribe, socket } = subscribePrimaryChatRealtime({
      token: tokenTrim,
      threadId: resolvedThreadId,
      onNewMessage: (legacy) => {
        const mapped = socketLegacyToPatientMessage(legacy);
        if (!mapped) return;
        if (__DEV__) console.log('[Socket.IO] FINAL MESSAGE OBJECT:', JSON.stringify(mapped));
        setMessages((prev) => {
          // optimistic pending'i çıkar — server versiyonu geldi
          const base =
            mapped.from === "PATIENT"
              ? prev.filter(
                  m => !(
                    (m.pending || m._local) &&
                    m.from === "PATIENT" &&
                    String(m.text || "") === String(mapped.text || "")
                  ),
                )
              : prev;
          const next = appendMappedChatMessage(base, mapped);
          return next.sort((a, b) => a.createdAt - b.createdAt).slice(-50);
        });
      },
      onConnect: () => setChatRealtimeConnected(true),
      onDisconnect: () => {
        setChatRealtimeConnected(false);
      },
    });
    chatSocketRef.current = socket;
    return () => {
      unsubscribe();
      chatSocketRef.current = null;
      setChatRealtimeConnected(false);
    };
  }, [token, resolvedThreadId, loading, sbConfigured, sbTimedOut]);

  useFocusEffect(
    useCallback(() => {
      setGlobalChatOpen(true);
      setGlobalOfferChatOpen(false);
      if (!token) {
        return () => {
          setGlobalChatOpen(false);
        };
      }
      void resetAppIconBadgeCount();
      void postPatientChatAckOpen(token);
      markRead();
      return () => {
        setGlobalChatOpen(false);
      };
    }, [token, markRead]),
  );

  // ── Send text ──────────────────────────────────────────────────────────────

  const sendText = async () => {
    const msg = text.trim();
    const hasAtt = pendingAttachments.length > 0;
    if ((!msg && !hasAtt) || sending || uploading) return;
    if (!token) return;
    if (!chatClinicId) {
      Alert.alert(t("common.error"), t("messages.chatRequiresClinic"));
      return;
    }
    sendingRef.current = true;
    setSending(true);
    const msgSnapshot = msg;
    const attSnapshot = [...pendingAttachments];
    const tempId = `tmp-${Date.now()}`;
    const optimisticRow: Message = {
      id: tempId,
      from: "PATIENT",
      text: msgSnapshot || (hasAtt ? "." : ""),
      type: "text",
      createdAt: Date.now(),
      _local: true,
      pending: true,
    };
    if (__DEV__) console.log('[send] FINAL MESSAGE OBJECT:', JSON.stringify(optimisticRow));
    setMessages((prev) => {
      const next = appendMappedChatMessage(prev, optimisticRow);
      return next.sort((a, b) => a.createdAt - b.createdAt).slice(-50);
    });
    setText("");
    setPendingAttachments([]);
    try {
      const s = chatSocketRef.current;
      if (s && !s.connected) {
        await waitOnceSocketConnected(s);
      }
      const fileIds = attSnapshot
        .map((a) => a.fileId)
        .filter((id): id is string => Boolean(id && String(id).trim()));
      const attachmentUrls = attSnapshot
        .map((a) => a.url)
        .filter((u): u is string => Boolean(u && /^https?:\/\//i.test(String(u))));
      const res = await sendMessage({
        token,
        clinicId: chatClinicId,
        clinicCode: selectedClinic?.clinic_code,
        text: msgSnapshot || (hasAtt ? "." : ""),
        attachments: fileIds,
        attachmentUrls,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setText(msgSnapshot);
        setPendingAttachments(attSnapshot);
        if ((err as { error?: string }).error === "CHAT_LOCKED") {
          Alert.alert(t("messages.lockedTitle"), t("messages.lockedMsg"));
        } else {
          Alert.alert(t("common.error"), t("messages.sendFailed"));
        }
        return;
      }
      if (patientId && chatClinicId) {
        void trackMetaContactClinicOnce(patientId, chatClinicId);
      }
    } catch {
      setText(msgSnapshot);
      setPendingAttachments(attSnapshot);
      Alert.alert(t("common.error"), t("messages.connectionError"));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  // ── Upload consent gate ────────────────────────────────────────────────────

  const checkUploadConsent = (): Promise<boolean> =>
    new Promise(async (resolve) => {
      const accepted = await safeGetItem(UPLOAD_CONSENT_KEY);
      if (accepted === "1") { resolve(true); return; }
      Alert.alert(
        t("upload.consentTitle"),
        t("upload.consentMessage"),
        [
          { text: t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
          {
            text: t("upload.consentConfirm"),
            onPress: async () => {
              await safeSetItem(UPLOAD_CONSENT_KEY, "1");
              resolve(true);
            },
          },
        ]
      );
    });

  // ── Upload file → returns fileUrl or null ──────────────────────────────────

  const uploadFile = async (
    uri: string,
    name: string,
    mimeType: string
  ): Promise<string | null> => {
    // ── Pre-flight: read file size ───────────────────────────────────
    let sizeKB = 0;
    let fileSizeBytes = 0;
    try {
      const info = await FileSystem.getInfoAsync(uri, { size: true } as Parameters<typeof FileSystem.getInfoAsync>[1]);
      const size = info.exists && "size" in info ? (info as any).size as number : 0;
      fileSizeBytes = typeof size === "number" ? size : 0;
      sizeKB = Math.round(size / 1024);
      if (size === 0) {
        console.error("[UPLOAD ERROR] File is 0 bytes, aborting upload:", uri);
        Alert.alert("Hata", "Fotoğraf işlenemedi, lütfen tekrar deneyin.");
        return null;
      }
    } catch (sizeErr) {
      console.warn("[UPLOAD] Could not read file size:", (sizeErr as Error)?.message);
    }

    __DEV__ && console.log("[UPLOAD START]:", { uri, sizeKB, mimeType, name, endpoint: `${API_BASE}/api/chat/upload` });

    if (!selectedClinicReady) {
      Alert.alert(t("common.error") || "Error", "Please wait…");
      return null;
    }
    if (!selectedClinic?.id?.trim()) {
      Alert.alert(t("common.error"), t("messages.chatRequiresClinic"));
      return null;
    }

    const mt = mimeType.toLowerCase();
    const fn = name.toLowerCase();
    const isZip = mt.includes("zip") || fn.endsWith(".zip");
    const reserveBytes =
      fileSizeBytes > 0
        ? Math.min(Math.ceil(fileSizeBytes * 1.25), 200 * 1024 * 1024)
        : isZip
          ? 120 * 1024 * 1024
          : 80 * 1024 * 1024;
    const prep = await deviceGuidance?.prepareHeavyFileOp?.({ operation: "attachment_upload", reserveBytes });
    if (prep && !prep.proceed) {
      trackEvent("attachment_upload_blocked", { category: "attachment_", reason: "proactive_disk" });
      Alert.alert(t("deviceGuidance.lowStorageTitleBlocked"), t("deviceGuidance.lowStorageBodyBlocked"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("deviceGuidance.openSettings"), onPress: () => void Linking.openSettings() },
        { text: t("common.retry") ?? "Retry", onPress: () => void uploadFile(uri, name, mimeType) },
      ]);
      return null;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("files", { uri, name, type: mimeType } as any);
      formData.append("patientId", patientId);
      if (mimeType.startsWith("image/")) formData.append("isImage", "true");
      const uid = String(selectedClinic.id).trim();
      formData.append("clinicId", uid);
      formData.append("clinic_id", uid);
      if (selectedClinic.clinic_code?.trim()) {
        const code = String(selectedClinic.clinic_code).trim();
        formData.append("clinicCode", code);
        formData.append("clinic_code", code);
      }
      __DEV__ && console.log("SEND MESSAGE PAYLOAD (upload)", {
        clinic_id: selectedClinic?.id ?? null,
        userClinic: user?.clinicId ?? null,
      });

      const res = await fetch(`${API_BASE}/api/chat/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        body: formData,
      });

      __DEV__ && console.log("[UPLOAD RESPONSE STATUS]:", res.status);
      const rawText = await res.text().catch((e) => `[text() failed: ${(e as Error).message}]`);
      __DEV__ && console.log("[UPLOAD RESPONSE RAW]:", rawText.slice(0, 600));

      let json: Record<string, any> = {};
      try { json = JSON.parse(rawText); } catch { /* non-JSON response already logged */ }

      if (!res.ok) {
        trackEvent("attachment_upload_failed", {
          category: "attachment_",
          http_status: res.status,
        });
        Alert.alert(t("chat.uploadError"), json.message || json.error || t("messages.uploadFailed"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("common.retry") ?? "Retry", onPress: () => uploadFile(uri, name, mimeType) },
        ]);
        return null;
      }
      const url = json.files?.[0]?.url ?? null;
      if (url && mimeType.startsWith("image/")) {
        trackMetaPhotoUpload("messages_chat");
      }
      return url;
    } catch (uploadErr) {
      const err = uploadErr as Error;
      if (isLowStorageLikeError(err)) deviceGuidance?.reportLowStorageLikeError(err, { operation: "attachment_upload" });
      trackEvent("attachment_upload_failed", {
        category: "attachment_",
        storage_related: isLowStorageLikeError(err),
      });
      console.error("[UPLOAD ERROR FULL]:", { message: err?.message, stack: err?.stack });
      const buttons: Parameters<typeof Alert.alert>[2] = [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.retry") ?? "Retry", onPress: () => void uploadFile(uri, name, mimeType) },
      ];
      if (isLowStorageLikeError(err)) {
        buttons.push({
          text: t("deviceGuidance.openSettings"),
          onPress: () => void Linking.openSettings(),
        });
      }
      Alert.alert(t("common.error"), t("messages.uploadFailed"), buttons);
      return null;
    } finally { setUploading(false); }
  };

  // ── AI photo processing (intraoral / multi-select gallery) — uses shared pipeline ──
  const processPhotoWithAI = async (
    uri: string,
    name: string,
    mimeType: string,
    photoType = "general"
  ) => {
    void name;
    void mimeType;
    __DEV__ && console.log("[AI] Triggered for:", photoType, name);

    if (!String(patientId || "").trim() || !token) {
      Alert.alert(t("chat.sessionError"), t("chat.sessionExpired"));
      return;
    }

    const loadingId = `ai_loading_${Date.now()}`;
    const loadingMsg: Message = {
      id: loadingId,
      from: "CLINIC",
      type: "ai_loading",
      text: t("analysis.processing"),
      createdAt: Date.now() + 500,
      _local: true,
    };
    setLocalMessages(prev => [...prev, loadingMsg]);
    setTimeout(() => flatRef.current?.scrollToOffset({ offset: 0, animated: true }), 150);

    try {
      console.log("AI LANG:", currentLanguage);
      const result = await analyzePhoto({
        imageUri: uri,
        patientId,
        token,
        photoType,
        lang: currentLanguage,
      });

      if (!result.ok) {
        const err = result as Extract<AnalyzePhotoResult, { ok: false }>;
        if (err.phase === "session") {
          Alert.alert(t("chat.sessionError"), t("chat.sessionExpired"));
        } else if (err.phase === "upload") {
          const msg =
            err.message === "empty_file"
              ? t("messages.uploadFailed")
              : err.message === "timeout"
                ? (t("messages.connectionError") || "Timeout")
                : err.message || t("messages.uploadFailed");
          Alert.alert(t("common.error"), msg);
        } else if (err.phase === "parse") {
          Alert.alert(t("common.error"), t("messages.connectionError") || "Invalid response");
        } else if (err.aiData?.error === "image_too_large") {
          Alert.alert(
            t("messages.uploadError") || "Hata",
            String(err.aiData.message || "")
          );
        } else {
          Alert.alert(
            t("common.error"),
            String(err.message || t("messages.connectionError") || "Analiz başarısız.")
          );
        }
        return;
      }

      const aiData = result.aiData;
      const fileUrl = result.fileUrl;
      setLastCapturedImage(fileUrl);
      __DEV__ && console.log(
        "[AI] Analysis complete for:",
        photoType,
        "| ok:",
        aiData.ok,
        "| insights:",
        aiData.insights?.length ?? 0
      );

      const localAiMsgId = `ai_result_local_${Date.now()}`;
      const localAiMsg: Message = {
        id: localAiMsgId,
        from: "CLINIC",
        type: "ai_result",
        text: "",
        createdAt: Date.now() + 500,
        _local: true,
        attachment: {
          name: "",
          url: fileUrl,
          mimeType: "image/jpeg",
          fileType: "image",
          aiResult: {
            insights: aiData.insights ?? [],
            confidence: aiData.confidence ?? "medium",
            summary: aiData.summary ?? "",
            recommendation: aiData.recommendation ?? "",
            disclaimer: aiData.disclaimer ?? "",
            originalImageUrl: fileUrl,
            clinics: aiData.clinics ?? [],
            issues: Array.isArray(aiData.issues) ? aiData.issues : [],
            treatments: Array.isArray(aiData.treatments) ? aiData.treatments : [],
            priceEstimate:
              aiData.priceEstimate && typeof aiData.priceEstimate === "object"
                ? aiData.priceEstimate
                : {},
            missingTooth:
              aiData.missingTooth &&
              typeof aiData.missingTooth === "object" &&
              Array.isArray((aiData.missingTooth as MissingToothGuidance).options)
                ? (aiData.missingTooth as MissingToothGuidance)
                : undefined,
            missingToothDetected:
              typeof aiData.missingToothDetected === "boolean"
                ? aiData.missingToothDetected
                : !!(
                    aiData.missingTooth &&
                    typeof aiData.missingTooth === "object" &&
                    Array.isArray((aiData.missingTooth as MissingToothGuidance).options)
                  ),
            missingToothConfidence:
              (aiData.missingToothConfidence as AiResult["missingToothConfidence"]) ??
              (aiData.missingTooth as MissingToothGuidance | undefined)?.confidence ??
              null,
            dentalCondition:
              aiData.dentalCondition &&
              typeof aiData.dentalCondition === "object" &&
              typeof (aiData.dentalCondition as DentalConditionPayload).labelTr === "string"
                ? (aiData.dentalCondition as DentalConditionPayload)
                : undefined,
          },
        },
      };
      setLocalMessages(prev => [...prev, localAiMsg]);
      setTimeout(() => flatRef.current?.scrollToOffset({ offset: 0, animated: true }), 100);
    } finally {
      setLocalMessages(prev => prev.filter(m => m.id !== loadingId));
    }
  };

  // ── Pickers ────────────────────────────────────────────────────────────────

  const pickImage = async () => {
    if (!await checkUploadConsent()) return;
    try {
    if (!(await ensureMediaLibraryAccessForPicker({
      deniedTitle: t("messages.permissionRequired"),
      deniedMessage: t("messages.galleryPermission"),
    }))) {
      return;
    }
    const result = await launchImageLibraryPlayStoreSafe({
      allowsMultipleSelection: Platform.OS === "ios",
      selectionLimit: Platform.OS === "ios" ? 5 : 1,
    });
    if (!result.canceled && result.assets.length > 0) {
      if (result.assets.length === 1) {
        const a = result.assets[0];
        setLastCapturedImage(a.uri);
        goToAnalysis(router, { imageUri: a.uri }, { replace: true });
        return;
      }
      for (const a of result.assets) {
        setLastCapturedImage(a.uri);
        processPhotoWithAI(
          a.uri,
          a.fileName || `photo_${Date.now()}.jpg`,
          a.mimeType || "image/jpeg"
        );
        await new Promise(r => setTimeout(r, 200));
      }
    }
    } catch (e) {
      console.error("[pickImage]", e);
      Alert.alert(t("common.error"), "Galeri açılamadı. İzinleri kontrol edip tekrar deneyin.");
    }
  };

  // ── Camera capture for AI (used by auto-trigger and attach menu) ──────────

  const capturePhotoForAI = async () => {
    if (!await checkUploadConsent()) return;
    try {
    if (!(await ensureCameraAccess({
      deniedTitle: t("messages.permissionRequired"),
      deniedMessage: t("messages.cameraPermission") || "Kamera erişimine izin verin.",
    }))) {
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      // No quality param — compressImage() handles all encoding
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      setLastCapturedImage(a.uri);
      goToAnalysis(router, { imageUri: a.uri }, { replace: true });
    }
    } catch (e) {
      console.error("[capturePhotoForAI]", e);
      Alert.alert(t("common.error"), "Kamera açılamadı. Lütfen tekrar deneyin.");
    }
  };

  // Keep refs current so effects/bridges always call the latest versions
  pickImageRef.current    = capturePhotoForAI;
  processPhotoRef.current = processPhotoWithAI;

  const pickDocument = async () => {
    if (!await checkUploadConsent()) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets[0]) {
        const a = result.assets[0];
        await uploadFile(a.uri, a.name, a.mimeType || "application/octet-stream");
      }
    } catch (e) {
      if (isLowStorageLikeError(e)) deviceGuidance?.reportLowStorageLikeError(e, { operation: "document_pick" });
      console.warn("[pickDocument]", (e as Error)?.message);
    }
  };

  /** Gallery → Files (or chat upload) → composer attachment */
  const attachComposerFromGallery = async () => {
    if (!chatClinicId) {
      Alert.alert(t("common.error"), t("messages.chatRequiresClinic"));
      return;
    }
    if (!token || !patientId) return;
    if (!(await checkUploadConsent())) return;
    const picked = await openFilePicker({ type: "image" });
    if (!picked) return;
    const saved = await saveToFiles({
      token,
      patientId,
      uri: picked.uri,
      name: picked.name,
      mimeType: picked.mimeType,
      clinicId: chatClinicId,
      clinicCode: selectedClinic?.clinic_code,
    });
    if (!saved.url && !saved.fileId) {
      Alert.alert(t("common.error"), t("messages.attachmentSaveFailed"));
      return;
    }
    setPendingAttachments((prev) => [
      ...prev,
      { localUri: picked.uri, fileId: saved.fileId, url: saved.url },
    ]);
  };

  const openGuidedCamera = () => {
    router.push({ pathname: "/intraoral-camera" as any, params: { patientId } });
  };

  const showAttachMenu = () => {
    const CAMERA_LABEL  = t("chat.takePhoto")     || "📷 Fotoğraf Çek";
    const GALLERY_LABEL = t("chat.selectImage")   || "🖼️ Galeriden Seç";
    const FILE_LABEL    = t("chat.selectFile")    || "📄 Dosya Seç";
    const INTRA_LABEL   = t("chat.intraoralPhoto")|| "🦷 Ağız İçi Fotoğraf";

    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t("common.cancel"), CAMERA_LABEL, GALLERY_LABEL, FILE_LABEL, INTRA_LABEL],
          cancelButtonIndex: 0,
        },
        (i) => {
          if (i === 1) capturePhotoForAI();
          else if (i === 2) {
            if (chatClinicId) void attachComposerFromGallery();
            else void pickImage();
          }
          else if (i === 3) pickDocument();
          else if (i === 4) openGuidedCamera();
        }
      );
    } else {
      Alert.alert(t("messages.addFile"), t("messages.selectSource"), [
        { text: CAMERA_LABEL,  onPress: capturePhotoForAI },
        {
          text: GALLERY_LABEL,
          onPress: () => {
            if (chatClinicId) void attachComposerFromGallery();
            else void pickImage();
          },
        },
        { text: FILE_LABEL,    onPress: pickDocument },
        { text: INTRA_LABEL,   onPress: openGuidedCamera },
        { text: t("common.cancel"), style: "cancel" },
      ]);
    }
  };

  // ── Intraoral ─────────────────────────────────────────────────────────────

  const captureIntraoralStep = async () => {
    if (!await checkUploadConsent()) return;
    if (!(await ensureCameraAccess({
      deniedTitle: t("messages.permissionRequired"),
      deniedMessage: t("messages.cameraPermission"),
    }))) {
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"] });
    if (!result.canceled && result.assets[0]) {
      const key = PHOTO_STEP_KEYS[intraoralStep]?.key;
      if (key) setIntraoralPhotos(prev => ({ ...prev, [key]: result.assets[0] }));
    }
  };

  const submitIntraoralPhotos = async () => {
    const entries = Object.entries(intraoralPhotos);
    if (entries.length === 0) { Alert.alert(t("common.error"), t("messages.intraoral.noPhotoError")); return; }
    setIntraoralVisible(false);

    __DEV__ && console.log("[AI] Submitting", entries.length, "intraoral photo(s)");

    // Fire each photo through the full AI pipeline independently (non-blocking).
    // processPhotoWithAI handles: compress → upload → loading bubble → AI → refresh.
    // A small stagger keeps loading bubbles appearing in capture order.
    for (let i = 0; i < entries.length; i++) {
      const [key, asset] = entries[i];
      const rawUri  = (asset as any).uri as string;
      const rawMime = ((asset as any).mimeType as string | undefined) ?? "image/jpeg";
      const name    = `intraoral_${key}_${Date.now()}.jpg`;

      // Fire-and-forget — do not await so photos process in parallel
      processPhotoWithAI(rawUri, name, rawMime, key);

      if (i < entries.length - 1) {
        // Stagger successive bubbles by 250 ms so they appear in order
        await new Promise(r => setTimeout(r, 250));
      }
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <View style={s.headerTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.headerTitle}>{t("messages.title")}</Text>
              <Text style={s.headerSub}>{t("messages.subtitle")}</Text>
            </View>
            <TouchableOpacity
              style={s.aiAssistChip}
              onPress={() => {
                const cid = String(chatClinicId || user?.clinicId || "").trim();
                goToAiCoordinator(router, cid ? { clinicId: cid } : undefined);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t("aiCoordinator.title")}
            >
              <Text style={s.aiAssistChipText}>✨ {t("aiCoordinator.short")}</Text>
            </TouchableOpacity>
          </View>
          {hasClinic && !!careDoctorDisplay ? (
            <View style={s.careStrip}>
              <Text style={s.careStripPrimary}>
                {t("messages.primaryMessagingDoctor").replace("{name}", careDoctorDisplay)}
              </Text>
              {enrolledSharedCare ? (
                <Text style={s.careStripSub}>{t("messages.clinicTeamParticipating")}</Text>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Message list */}
        <View style={{ flex: 1 }}>
          {showDoctorBanner && leadAssignmentDoctorDisplayName(leadAssignment) ? (
            <View style={s.doctorAssignBanner} accessibilityRole="text">
              <Text style={s.doctorAssignBannerText}>
                {t("messages.doctorAssignedBanner").replace(
                  "{doctorName}",
                  leadAssignmentDoctorDisplayName(leadAssignment)
                )}
              </Text>
            </View>
          ) : null}
          <FlatList
            ref={flatRef}
            style={{ flex: 1 }}
            data={chatListData}
            keyExtractor={patientChatKeyExtractor}
            contentContainerStyle={{ padding: 12, paddingBottom: 8, flexGrow: 1 }}
            showsVerticalScrollIndicator={false}
            inverted
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            renderItem={renderPatientChatItem}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            ListEmptyComponent={
              hasClinic ? (
                <View style={s.empty}>
                  <Text style={s.emptyIcon}>💬</Text>
                  <Text style={s.emptyTitle}>{t("chat.noMessages")}</Text>
                  <Text style={s.emptySub}>{t("messages.emptySub")}</Text>
                </View>
              ) : null
            }
          />
        </View>

        {/* No-clinic empty state — replaces input bar */}
        {!hasClinic && allMessages.length === 0 && (
          <View style={s.noClinicState}>
            <Text style={s.noClinicIcon}>🦷</Text>
            <Text style={s.noClinicTitle}>{t("messages.noClinicTitle")}</Text>
            <Text style={s.noClinicSub}>{t("messages.noClinicSub")}</Text>
            <TouchableOpacity
              style={s.noClinicPrimary}
              activeOpacity={0.85}
              onPress={() => goToTreatmentGuide(router)}
            >
              <Text style={s.noClinicPrimaryTxt}>{`✨ ${t("home.ctaTreatmentGuide")}`}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.noClinicSecondary}
              activeOpacity={0.85}
              onPress={async () => {
                await safeRemoveItem(QUOTE_REQUEST_PREFILL_IMAGE_KEY);
                router.push("/clinic-onboarding" as any);
              }}
            >
              <Text style={s.noClinicSecondaryTxt}>🏥 {t("find_clinic")}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Upload indicator */}
        {uploading && (
          <View style={s.uploadBanner}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={s.uploadBannerText}>{t("messages.uploading")}</Text>
          </View>
        )}

        {!chatClinicId && allMessages.length > 0 ? (
          <View style={s.chatHintBanner}>
            <Text style={s.chatHintText}>{t("messages.openChatFromClinicCard")}</Text>
          </View>
        ) : null}

        {/* Composer: requires active clinic thread (deep link / tab with clinicId) */}
        {(hasClinic || allMessages.length > 0 || chatClinicId) && chatClinicId ? (
          <View style={s.inputBarOuter}>
            {pendingAttachments.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.previewScroll}
                contentContainerStyle={s.previewScrollContent}
              >
                {pendingAttachments.map((att, idx) => (
                  <View key={`${att.localUri}-${idx}`} style={s.previewChip}>
                    {att.isPdf || String(att.mimeType || "").includes("pdf") ? (
                      <View style={s.previewChipDoc}>
                        <Text style={s.previewChipDocIcon}>📄</Text>
                        <Text style={s.previewChipDocName} numberOfLines={2}>
                          {att.label || "PDF"}
                        </Text>
                      </View>
                    ) : (
                      <Image
                        source={{ uri: att.localUri }}
                        style={s.previewChipImg}
                        resizeMode="cover"
                      />
                    )}
                    <TouchableOpacity
                      style={s.previewChipRemove}
                      onPress={() =>
                        setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))
                      }
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Text style={s.previewChipRemoveTxt}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            ) : null}
            <View style={s.inputBar}>
              <TouchableOpacity
                style={s.attachBtn}
                onPress={showAttachMenu}
                disabled={uploading || sending}
                activeOpacity={0.7}
              >
                <Text style={s.attachIcon}>📎</Text>
              </TouchableOpacity>
              <TextInput
                style={s.input}
                placeholder={t("chat.typeMessage")}
                placeholderTextColor="#9ca3af"
                value={text}
                onChangeText={setText}
                multiline
                maxLength={2000}
              />
              <TouchableOpacity
                style={[
                  s.sendBtn,
                  (!text.trim() && pendingAttachments.length === 0) ||
                  sending ||
                  uploading
                    ? s.sendBtnOff
                    : null,
                ]}
                onPress={sendText}
                disabled={
                  (!text.trim() && pendingAttachments.length === 0) ||
                  sending ||
                  uploading
                }
                activeOpacity={0.8}
              >
                {sending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={s.sendIcon}>➤</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>

      {/* Intraoral Modal */}
      <IntraoralModal
        visible={intraoralVisible}
        step={intraoralStep}
        photos={intraoralPhotos}
        onClose={() => setIntraoralVisible(false)}
        onCapture={captureIntraoralStep}
        onNext={() => setIntraoralStep(p => Math.min(p + 1, PHOTO_STEP_KEYS.length - 1))}
        onPrev={() => setIntraoralStep(p => Math.max(p - 1, 0))}
        onSubmit={submitIntraoralPhotos}
      />
    </KeyboardAvoidingView>
  );
}

// ─── ClinicCard ───────────────────────────────────────────────────────────────

function ClinicCard({ clinic }: { clinic: ClinicRecommendation }) {
  const router = useRouter();
  const PREFILL = "AI analiz sonucuma göre sizinle görüşmek istiyorum.";

  return (
    <View style={cl.card}>
      <View style={cl.cardBody}>
        <View style={cl.cardInfo}>
          <Text style={cl.clinicName} numberOfLines={1}>{clinic.name}</Text>
          <View style={cl.tagRow}>
            <View style={cl.specialtyTag}>
              <Text style={cl.specialtyText}>{clinic.specialty}</Text>
            </View>
            {clinic.distance ? (
              <View style={cl.distanceBadge}>
                <Text style={cl.distanceText}>📍 {clinic.distance}</Text>
              </View>
            ) : clinic.city ? (
              <Text style={cl.cityText}>📍 {clinic.city}</Text>
            ) : null}
          </View>
          {clinic.rating != null && (
            <Text style={cl.ratingText}>⭐ {clinic.rating.toFixed(1)}</Text>
          )}
        </View>
        <TouchableOpacity
          style={cl.ctaBtn}
          activeOpacity={0.8}
          onPress={() =>
            goToChat(router, { clinicId: clinic.id, prefillText: PREFILL })
          }
        >
          <Text style={cl.ctaBtnText}>Mesaj Gönder</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── AiLoadingBubble ──────────────────────────────────────────────────────────

function AiLoadingBubble() {
  const { t } = useLanguage();
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? "." : d + ".");
    }, 500);
    return () => clearInterval(interval);
  }, []);
  return (
    <View style={[s.bubbleWrap, s.bubbleLeft]}>
      <Text style={s.bubbleFrom}>AI</Text>
      <View style={[s.bubble, s.bubbleClinic, ai.loadingBubble]}>
        <View style={ai.loadingRow}>
          <ActivityIndicator size="small" color="#6366f1" />
          <Text style={ai.loadingText}>{t("analysis.processing")}{dots}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── AiResultBubble ───────────────────────────────────────────────────────────

const CONFIDENCE_COLOR: Record<string, string> = {
  low: "#f59e0b", medium: "#3b82f6", high: "#10b981",
};

// ── Clinic Selector Modal ─────────────────────────────────────────────────────

function ClinicSelectorModal({
  clinics,
  onSelect,
  onClose,
}: {
  clinics: ClinicRecommendation[];
  onSelect: (clinic: ClinicRecommendation) => void;
  onClose: () => void;
}) {
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <TouchableOpacity style={cm.overlay} activeOpacity={1} onPress={onClose} />
      <View style={cm.sheet}>
        <View style={cm.handle} />
        <Text style={cm.title}>Klinik Seç</Text>
        <Text style={cm.subtitle}>AI analizini hangi kliniğe gönderelim?</Text>

        {clinics.map((clinic) => (
          <TouchableOpacity
            key={clinic.id}
            style={cm.row}
            activeOpacity={0.75}
            onPress={() => onSelect(clinic)}
          >
            <View style={cm.rowInfo}>
              <Text style={cm.rowName} numberOfLines={1}>{clinic.name}</Text>
              <View style={cm.rowMeta}>
                {!!clinic.specialty && (
                  <Text style={cm.rowSpecialty}>{clinic.specialty}</Text>
                )}
                {!!clinic.distance && (
                  <Text style={cm.rowDistance}>📍 {clinic.distance}</Text>
                )}
              </View>
            </View>
            <View style={cm.selectBtn}>
              <Text style={cm.selectBtnText}>Seç</Text>
            </View>
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={cm.cancelBtn} onPress={onClose}>
          <Text style={cm.cancelText}>Vazgeç</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ── AI result UX helpers (clinical tone + pricing) ───────────────────────────

const DEFAULT_TREATMENT_SUGGESTIONS: { icon: string; label: string }[] = [
  { icon: "🦷", label: "Diş taşı temizliği (detartraj)" },
  { icon: "✨", label: "Diş beyazlatma (opsiyonel)" },
  { icon: "↔️", label: "Ortodontik değerlendirme (çapraşıklık için)" },
];

function parseUsdRange(s: string): { lo: number; hi: number } | null {
  const m = String(s).replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return { lo: parseFloat(m[1]), hi: parseFloat(m[2]) };
}

/** Aggregates backend per-category $ ranges into one band for display. */
function aggregatePriceEstimateLabel(pe: Record<string, string> | undefined): string | null {
  if (!pe || Object.keys(pe).length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let any = false;
  for (const v of Object.values(pe)) {
    const r = parseUsdRange(v);
    if (r) {
      any = true;
      min = Math.min(min, r.lo);
      max = Math.max(max, r.hi);
    }
  }
  if (!any || !Number.isFinite(min) || !Number.isFinite(max)) return null;
  return `${Math.round(min)} – ${Math.round(max)} USD`;
}

/** Softer hedge → more assertive clinical phrasing for on-screen readout. */
function strengthenInsightForUi(line: string): string {
  let t = line.trim();
  if (!t) return t;
  t = t.replace(/\s+olarak\s+görünüyor\.?$/i, " tespit edildi.");
  t = t.replace(/\s+görünüyor\.?$/i, " tespit edildi.");
  t = t.replace(/\s+gibi\s+görünüyor\.?$/i, " gözlemlenmiştir.");
  t = t.replace(/\s+gibi\s+görünüyor\b/gi, " gözlemlenmiştir");
  if (!/[.!?…]$/.test(t)) t += ".";
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// ── Main bubble ───────────────────────────────────────────────────────────────

function AiResultBubble({ msg }: { msg: Message }) {
  const result = msg.attachment?.aiResult;
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();

  const imgUrl = result?.originalImageUrl ?? "";
  const msgKey = msg.id;

  const [showClinicModal, setShowClinicModal] = useState(false);

  const [toothColorPreset, setToothColorPreset] = useState<ToothColorPreset>("natural");
  const [simulatedSmileUrl, setSimulatedSmileUrl] = useState<string | null>(
    result?.simulatedImageUrl ?? null
  );
  /** Sunucudan hazır görsel varsa veya kullanıcı “başlat” dediyse true — otomatik istek yok. */
  const [smileSimStarted, setSmileSimStarted] = useState(() => !!result?.simulatedImageUrl);
  const [smileSimRetryNonce, setSmileSimRetryNonce] = useState(0);
  const [smileSimLoading, setSmileSimLoading] = useState(false);
  const [smileSimError, setSmileSimError] = useState<string | null>(null);
  const smileSimRequestSeq = useRef(0);
  /** Sunucu zaten simulatedImageUrl verdiyse ilk effect turunda tekrar POST atma. */
  const smileSimSkipFetchOnce = useRef(!!result?.simulatedImageUrl);

  useEffect(() => {
    if (!result?.originalImageUrl || !user?.patientId || !smileSimStarted) return;
    if (smileSimSkipFetchOnce.current) {
      smileSimSkipFetchOnce.current = false;
      return;
    }
    const seq = ++smileSimRequestSeq.current;
    setSmileSimLoading(true);
    setSmileSimError(null);
    runSmileSimulationWithImageUrl(
      result.originalImageUrl,
      toothColorPreset,
      user.patientId,
      "full"
    )
      .then((r) => {
        if (seq !== smileSimRequestSeq.current) return;
        setSmileSimLoading(false);
        if (r.ok && r.simulatedImageUrl) {
          setSimulatedSmileUrl(r.simulatedImageUrl);
          __DEV__ && console.log("[SIM] Applying URL:", (r.simulatedImageUrl || "").slice(0, 80));
        } else {
          setSmileSimError(r.error || "simulation_failed");
        }
      })
      .catch((e) => {
        if (seq !== smileSimRequestSeq.current) return;
        setSmileSimLoading(false);
        setSmileSimError(String((e as Error)?.message || e));
      });
  }, [
    result?.originalImageUrl,
    user?.patientId,
    toothColorPreset,
    msgKey,
    smileSimStarted,
    smileSimRetryNonce,
  ]);

  if (!result) return null;

  const resolveUrl = (url: string) =>
    url.startsWith("http") ? url : `${API_BASE}${url}`;

  const conf = result.confidence ?? "medium";
  const visibleInsights = (result.insights ?? []).slice(0, 3);
  const clinicalInsights = visibleInsights.map(strengthenInsightForUi);
  const priceBand = aggregatePriceEstimateLabel(result.priceEstimate);
  const treatmentRows =
    (result.treatments ?? []).length > 0
      ? (result.treatments ?? []).map((label, i) => ({
          icon: ["🦷", "✨", "↔️", "🩺", "💎"][i % 5],
          label,
        }))
      : DEFAULT_TREATMENT_SUGGESTIONS;
  const showBackendIssues =
    clinicalInsights.length === 0 && (result.issues ?? []).length > 0;

  // Prefill message sent to clinic
  const prefillMessage = [
    "Merhaba! AI diş analizi yaptırdım.",
    ...(visibleInsights.length > 0 ? [`Bulgular: ${visibleInsights[0]}`] : []),
    "Sizinle görüşmek istiyorum.",
  ].join(" ");

  const handleSendToClinic = () => {
    if (result.clinics && result.clinics.length > 0) {
      setShowClinicModal(true);
    } else {
      const cid = user?.clinicId ? String(user.clinicId).trim() : "";
      if (cid) {
        goToChat(router, { clinicId: cid, prefillText: prefillMessage });
      } else {
        Alert.alert(t("common.error"), t("messages.chatRequiresClinic"));
      }
    }
  };

  const handleSelectClinic = (clinic: ClinicRecommendation) => {
    setShowClinicModal(false);
    goToChat(router, { clinicId: clinic.id, prefillText: prefillMessage });
  };

  /** Teklif / klinik akışına giderken analiz veya simülasyon görselini quote-request için sakla. */
  const openTreatmentGuide = useCallback(() => {
    const cid = user?.clinicId ? String(user.clinicId).trim() : "";
    goToTreatmentGuide(router, cid ? { clinicId: cid } : undefined);
  }, [router, user?.clinicId]);

  return (
    <View style={[s.bubbleWrap, s.bubbleLeft]}>
      <Text style={s.bubbleFrom}>AI</Text>
      <View style={[s.bubble, s.bubbleClinic, ai.card]}>

        {/* ── Header ── */}
        <View style={ai.header}>
          <Text style={ai.headerTitle}>{t("treatmentGuide.bubbleTitle")}</Text>
          {result.confidence && (
            <View style={[ai.confidenceBadge, { backgroundColor: CONFIDENCE_COLOR[conf] + "22" }]}>
              <Text style={[ai.confidenceText, { color: CONFIDENCE_COLOR[conf] }]}>
                {conf === "high" ? "Yüksek güven" : conf === "medium" ? "Orta güven" : "Düşük güven"}
              </Text>
            </View>
          )}
        </View>

        {/* ── 1. Yalnızca analiz edilen fotoğraf (orijinal) ── */}
        {result.originalImageUrl ? (
          <View>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => Linking.openURL(resolveUrl(result.originalImageUrl!))}
            >
              <Image
                source={{ uri: resolveUrl(result.originalImageUrl!) }}
                style={ai.image}
                resizeMode="cover"
                onLoad={() => __DEV__ && console.log("[IMG] AI original loaded:", resolveUrl(result.originalImageUrl!).slice(0, 60))}
                onError={(e) => console.warn("[IMG] AI original FAILED:", resolveUrl(result.originalImageUrl!).slice(0, 60), e.nativeEvent.error)}
              />
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Gülüş simülasyonu — backend Stage 1 structure + Stage 2 COLOR_PRESETS */}
        {result.originalImageUrl ? (
          <View style={ai.optionalToneSection}>
            <Text style={ai.optionalToneTitle}>Gülüş simülasyonu</Text>
            {!smileSimStarted ? (
              <>
                <Text style={ai.optionalToneHint}>
                  İsterseniz bu fotoğraf için gülüş görünümü hazırlanır; ağ isteği yalnızca siz başlattığınızda çalışır.
                </Text>
                <TouchableOpacity
                  style={ai.smileSimStartBtn}
                  onPress={() => setSmileSimStarted(true)}
                  disabled={!user?.patientId}
                  activeOpacity={0.88}
                >
                  <Text style={ai.smileSimStartBtnText}>Simülasyonu başlat</Text>
                </TouchableOpacity>
                {!user?.patientId ? (
                  <Text style={{ fontSize: 11, color: "#9ca3af" }}>Giriş yapmanız gerekir.</Text>
                ) : null}
              </>
            ) : (
              <>
                <Text style={ai.optionalToneHint}>
                  Ton değiştirince aynı fotoğraf için yeniden işlenir; yalnızca diş maskesi renklendirilir.
                </Text>
                <ToothColorSelector
                  selected={toothColorPreset}
                  onChange={setToothColorPreset}
                  isLoading={smileSimLoading}
                  disabled={!user?.patientId || smileSimLoading}
                />
                {smileSimError ? (
                  <View>
                    <Text style={{ fontSize: 12, color: "#b91c1c" }}>{smileSimError}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        setSmileSimLoading(false);
                        setSmileSimError(null);
                        setSmileSimRetryNonce((n) => n + 1);
                      }}
                      style={{ marginTop: 8, alignSelf: "flex-start" }}
                    >
                      <Text style={{ fontSize: 13, color: "#4f46e5", fontWeight: "600" }}>Tekrar dene</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {simulatedSmileUrl ? (
                  <View style={ai.beforeAfterRow}>
                    <View style={ai.beforeAfterItem}>
                      <Text style={ai.beforeAfterLabel}>Önce</Text>
                      <Image
                        source={{ uri: resolveUrl(result.originalImageUrl!) }}
                        style={ai.halfImage}
                        resizeMode="cover"
                        onLoad={() =>
                          __DEV__ && console.log("[SLIDER] Before image loaded:", resolveUrl(result.originalImageUrl!).slice(0, 60))
                        }
                      />
                    </View>
                    <View style={ai.beforeAfterItem}>
                      <Text style={ai.beforeAfterLabel}>Sonra</Text>
                      <Image
                        source={{ uri: resolveUrl(simulatedSmileUrl) }}
                        style={ai.halfImage}
                        resizeMode="cover"
                        onLoad={() =>
                          __DEV__ && console.log("[SLIDER] After image loaded:", resolveUrl(simulatedSmileUrl).slice(0, 60))
                        }
                      />
                    </View>
                  </View>
                ) : smileSimLoading ? (
                  <View style={{ paddingVertical: 8, alignItems: "center" }}>
                    <ActivityIndicator color="#4CAF50" />
                    <Text style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>Simülasyon hazırlanıyor…</Text>
                  </View>
                ) : null}
              </>
            )}
          </View>
        ) : null}

        {/* ── 2. AI Dental Analysis ── */}
        <View style={ai.analysisCard}>
          <Text style={ai.analysisSectionTitle}>AI Dental Analysis</Text>
          {clinicalInsights.length > 0 ? (
            <View style={ai.analysisList}>
              {clinicalInsights.map((line, i) => (
                <View key={i} style={ai.analysisRow}>
                  <Text style={ai.analysisIndex}>{i + 1}.</Text>
                  <Text style={ai.analysisLine}>{line}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={ai.analysisPlaceholder}>
              Kişisel tedavi planınızı oluşturmak için devam edin.
            </Text>
          )}
          <Text style={ai.analysisDisclaimer}>
            Bu analiz AI tarafından oluşturulmuştur ve kesin teşhis değildir.
          </Text>
        </View>

        {/* ── 3. Klinik özet blokları (koşullu) ── */}
        <View style={ai.treatmentBox}>
          {result.dentalCondition && !result.missingTooth && (
            <View style={ai.dentalConditionBanner}>
              <Text style={ai.dentalConditionText}>{result.dentalCondition.labelTr}</Text>
            </View>
          )}

          {result.missingTooth && (
            <View style={ai.missingToothBlock}>
              <Text style={ai.missingToothHeadline}>{result.missingTooth.headline}</Text>
              {result.missingTooth.options.map((opt, i) => (
                <View key={`mt-${i}`} style={[ai.missingToothOption, i > 0 && ai.missingToothOptionSep]}>
                  <Text style={ai.missingToothOptionTitle}>{opt.title}</Text>
                  <Text style={ai.missingToothOptionExpl}>{opt.explanation}</Text>
                  <Text style={ai.missingToothOptionPrice}>{opt.price}</Text>
                </View>
              ))}
              <Text style={ai.missingToothPlanDisclaimer}>{result.missingTooth.disclaimer}</Text>
            </View>
          )}

          {showBackendIssues && (
            <>
              <Text style={ai.treatmentSubLabel}>Özet bulgular</Text>
              {(result.issues ?? []).map((line, i) => (
                <View key={`iss-${i}`} style={ai.treatmentRow}>
                  <Text style={ai.treatmentBullet}>•</Text>
                  <Text style={ai.treatmentItem}>{line}</Text>
                </View>
              ))}
            </>
          )}

          {/* ── Önerilen Tedaviler ── */}
          <Text style={[ai.treatmentSectionTitle, { marginTop: result.missingTooth || result.dentalCondition || showBackendIssues ? 12 : 0 }]}>
            Önerilen Tedaviler
          </Text>
          <View style={ai.treatmentSuggestList}>
            {treatmentRows.map((row, i) => (
              <View key={`tr-${i}`} style={ai.treatmentSuggestRow}>
                <Text style={ai.treatmentSuggestIcon}>{row.icon}</Text>
                <Text style={ai.treatmentSuggestLabel}>{row.label}</Text>
              </View>
            ))}
          </View>

          {/* ── Yaklaşık fiyat ── */}
          <View style={ai.priceCard}>
            <Text style={ai.priceCardTitle}>Yaklaşık Fiyat Aralığı</Text>
            {priceBand ? (
              <Text style={ai.priceCardValue}>{priceBand}</Text>
            ) : result.priceEstimate && Object.keys(result.priceEstimate).length > 0 ? (
              <>
                {Object.entries(result.priceEstimate).map(([k, v]) => (
                  <View key={k} style={ai.priceDetailRow}>
                    <Text style={ai.priceDetailCat}>{priceEstimateLabel(k)}</Text>
                    <Text style={ai.priceDetailVal}>{String(v)}</Text>
                  </View>
                ))}
              </>
            ) : (
              <Text style={ai.priceCardHint}>
                Kişiselleştirilmiş aralık için detaylı plan oluşturun.
              </Text>
            )}
          </View>

          {/* ── CTA — Treatment Guide (non-tourism) ── */}
          <TouchableOpacity
            style={ai.ctaPrimary}
            onPress={openTreatmentGuide}
            activeOpacity={0.88}
          >
            <Text style={ai.ctaPrimaryText}>{t("treatmentGuide.openFromMessages")}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={ai.ctaSecondary}
            onPress={() => {
              const cid =
                result.clinics?.[0]?.id ||
                (user?.clinicId ? String(user.clinicId) : "");
              if (!String(cid).trim()) {
                openTreatmentGuide();
                return;
              }
              goToChat(router, {
                clinicId: String(cid),
                prefillText: t("messages.defaultComposerText"),
              });
            }}
            activeOpacity={0.88}
          >
            <Text style={ai.ctaSecondaryText}>{t("treatmentGuide.messageClinicShort")}</Text>
          </TouchableOpacity>

          {result.clinics && result.clinics.length > 0 ? (
            <TouchableOpacity style={ai.linkRow} onPress={handleSendToClinic} activeOpacity={0.7}>
              <Text style={ai.linkRowText}>{t("treatmentGuide.shareResultToClinic")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        <Text style={s.bubbleTime}>{fmtTime(msg.createdAt, "tr-TR")}</Text>
      </View>

      {/* ── Clinic picker modal ── */}
      {showClinicModal && result.clinics && result.clinics.length > 0 && (
        <ClinicSelectorModal
          clinics={result.clinics}
          onSelect={handleSelectClinic}
          onClose={() => setShowClinicModal(false)}
        />
      )}
    </View>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

const MessageBubble = React.memo(function MessageBubble({ msg }: { msg: Message }) {
  const locale = useDateLocale();
  const { t } = useLanguage();

  if (__DEV__) {
    console.log('[MessageBubble] RENDER id:', msg.id, '| text:', JSON.stringify(msg.text), '| from:', msg.from);
    if (!msg.text && !msg.attachment) {
      console.warn('🚨 TEXT LOST:', JSON.stringify(msg));
    }
  }

  // Local loading bubble
  if (msg.type === "ai_loading") return <AiLoadingBubble />;

  // AI result bubble (from backend, type = 'ai_result')
  if (msg.type === "ai_result" || msg.attachment?.aiResult) return <AiResultBubble msg={msg} />;

  const isPatient = msg.from === "PATIENT";
  const att = msg.attachment;
  const isImage = att?.fileType === "image" || att?.mimeType?.startsWith("image/");
  const isPdf   = att?.fileType === "pdf"   || att?.mimeType === "application/pdf";

  return (
    <View style={[s.bubbleWrap, isPatient ? s.bubbleRight : s.bubbleLeft]}>
      {!isPatient && <Text style={s.bubbleFrom}>{inboundBubbleLabel(msg, t)}</Text>}
      <View style={[s.bubble, isPatient ? s.bubblePatient : s.bubbleClinic]}>
        {/* text || attachment: her ikisi de yoksa bile bubble boş olmaz (sadece timestamp) */}
        {(msg.text != null && msg.text !== '') && (
          <Text style={[s.bubbleText, isPatient && s.bubbleTextWhite]}>
            {msg.text}
          </Text>
        )}
        {isImage && att?.url ? (
          <TouchableOpacity
            onPress={() => Linking.openURL(
              att.url.startsWith("http") ? att.url : `${API_BASE}${att.url}`
            )}
            activeOpacity={0.85}
          >
            <Image
              source={{ uri: att.url.startsWith("http") ? att.url : `${API_BASE}${att.url}` }}
              style={s.attImage}
              resizeMode="cover"
              onLoad={() => __DEV__ && console.log("[IMG] chat attachment loaded")}
              onError={(e) => console.warn("[IMG] chat attachment FAILED:", att.url.slice(0, 60), e.nativeEvent.error)}
            />
            {att.name && (
              <Text style={[s.attName, isPatient && { color: "rgba(255,255,255,0.7)" }]}
                numberOfLines={1}>{att.name}</Text>
            )}
          </TouchableOpacity>
        ) : null}
        {isPdf && att ? (
          <TouchableOpacity
            style={s.pdfRow}
            onPress={() => Linking.openURL(att.url.startsWith("http") ? att.url : `${API_BASE}${att.url}`)}
            activeOpacity={0.85}
          >
            <Text style={s.pdfEmoji}>📄</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.pdfName, isPatient && { color: "#dbeafe" }]} numberOfLines={2}>
                {att.name || t("chat.file")}
              </Text>
              {att.size ? (
                <Text style={[s.pdfSize, isPatient && { color: "rgba(255,255,255,0.5)" }]}>
                  {(att.size / 1024).toFixed(0)} KB
                </Text>
              ) : null}
            </View>
            <Text style={[s.pdfOpen, isPatient && { color: "#93c5fd" }]}>{t("messages.open")}</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={[s.bubbleTime, isPatient && s.bubbleTimeWhite]}>
          {fmtTime(msg.createdAt, locale)}
        </Text>
      </View>
    </View>
  );
// React.memo wrapper — only re-renders when msg reference changes.
// setMessages() with our partial update returns the same object for
// unchanged messages, so those bubbles are skipped entirely.
}, (prev, next) => prev.msg === next.msg);

// ─── FlatList row (memo): day divider + MessageBubble — renderItem useCallback([], []) ───

const MessageItem = React.memo(
  function MessageItem({
    message,
    showDay,
  }: {
    message: Message;
    showDay: boolean;
  }) {
    const locale = useDateLocale();
    return (
      <>
        {showDay ? (
          <View style={s.dayRow}>
            <View style={s.dayLine} />
            <Text style={s.dayLabel}>{fmtDay(message.createdAt, locale)}</Text>
            <View style={s.dayLine} />
          </View>
        ) : null}
        <MessageBubble msg={message} />
      </>
    );
  },
  (prev, next) =>
    prev.message === next.message && prev.showDay === next.showDay,
);

// ─── IntraoralModal ───────────────────────────────────────────────────────────

function IntraoralModal({ visible, step, photos, onClose, onCapture, onNext, onPrev, onSubmit }: any) {
  const { t } = useLanguage();
  const currentKey = PHOTO_STEP_KEYS[step];
  const photo      = photos[currentKey?.key];
  const doneCount  = Object.keys(photos).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={im.container}>
        {/* Header */}
        <View style={im.header}>
          <TouchableOpacity onPress={onClose} style={im.closeBtn}>
            <Text style={im.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={im.title}>{t("messages.intraoral.title")}</Text>
          <Text style={im.badge}>{doneCount}/{PHOTO_STEP_KEYS.length}</Text>
        </View>

        {/* Progress dots */}
        <View style={im.dots}>
          {PHOTO_STEP_KEYS.map((st, i) => (
            <View
              key={st.key}
              style={[
                im.dot,
                i === step && im.dotActive,
                photos[st.key] && im.dotDone,
              ]}
            >
              <Text style={[im.dotText, i === step && im.dotTextActive]}>
                {photos[st.key] ? "✓" : String(i + 1)}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView contentContainerStyle={im.body} showsVerticalScrollIndicator={false}>
          <Text style={im.stepIcon}>{currentKey?.icon}</Text>
          <Text style={im.stepLabel}>{t(`messages.intraoral.${currentKey?.key}.label`)}</Text>
          <Text style={im.stepInstruction}>{t(`messages.intraoral.${currentKey?.key}.instruction`)}</Text>

          {photo ? (
            <Image source={{ uri: photo.uri }} style={im.preview} resizeMode="cover" />
          ) : (
            <View style={im.placeholder}>
              <Text style={im.placeholderIcon}>📷</Text>
              <Text style={im.placeholderText}>{t("messages.intraoral.noPhoto")}</Text>
            </View>
          )}

          <TouchableOpacity style={im.cameraBtn} onPress={onCapture} activeOpacity={0.85}>
            <Text style={im.cameraBtnText}>
              {photo ? t("messages.intraoral.retake") : t("messages.intraoral.capture")}
            </Text>
          </TouchableOpacity>

          <View style={im.navRow}>
            <TouchableOpacity
              style={[im.navBtn, step === 0 && im.navBtnOff]}
              onPress={onPrev}
              disabled={step === 0}
              activeOpacity={0.8}
            >
              <Text style={im.navBtnText}>{t("messages.intraoral.prev")}</Text>
            </TouchableOpacity>

            {step < PHOTO_STEP_KEYS.length - 1 ? (
              <TouchableOpacity style={im.navBtn} onPress={onNext} activeOpacity={0.8}>
                <Text style={im.navBtnText}>{t("messages.intraoral.next")}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[im.navBtn, im.submitBtn, doneCount === 0 && im.navBtnOff]}
                onPress={onSubmit}
                disabled={doneCount === 0}
                activeOpacity={0.85}
              >
                <Text style={[im.navBtnText, im.submitBtnText]}>
                  {t("messages.intraoral.submit").replace("{count}", String(doneCount))}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={im.hint}>{t("messages.intraoral.hint")}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  center:    { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f3f4f6" },

  header: {
    backgroundColor: "#fff", paddingHorizontal: 20,
    paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  aiAssistChip: {
    backgroundColor: "#ecfdf5",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    marginTop: 2,
  },
  aiAssistChipText: { fontSize: 12, fontWeight: "700", color: "#047857" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#111827" },
  headerSub:   { fontSize: 12, color: "#6b7280", marginTop: 2 },
  careStrip: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e2e8f0",
  },
  careStripPrimary: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0f172a",
    lineHeight: 20,
  },
  careStripSub: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748b",
    lineHeight: 17,
  },

  dayRow:  { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 12 },
  dayLine: { flex: 1, height: 1, backgroundColor: "#e5e7eb" },
  dayLabel:{ fontSize: 11, fontWeight: "600", color: "#9ca3af", flexShrink: 0 },

  bubbleWrap:    { marginBottom: 6 },
  bubbleLeft:    { alignItems: "flex-start" },
  bubbleRight:   { alignItems: "flex-end" },
  bubbleFrom:    { fontSize: 10, color: "#9ca3af", marginBottom: 3, marginLeft: 4 },
  bubble:        { maxWidth: "82%", borderRadius: 16, padding: 10, paddingHorizontal: 14 },
  bubblePatient: { backgroundColor: "#2563eb", borderBottomRightRadius: 4 },
  bubbleClinic:  {
    backgroundColor: "#fff", borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: "#e5e7eb",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  bubbleText:      { fontSize: 14, color: "#111827", lineHeight: 21 },
  bubbleTextWhite: { color: "#fff" },
  bubbleTime:      { fontSize: 10, color: "#9ca3af", marginTop: 5, textAlign: "right" },
  bubbleTimeWhite: { color: "rgba(255,255,255,0.55)" },

  attImage: { width: 210, height: 155, borderRadius: 8, marginTop: 6 },
  attName:  { fontSize: 10, color: "#9ca3af", marginTop: 3 },

  pdfRow:  { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4, marginTop: 4 },
  pdfEmoji:{ fontSize: 22 },
  pdfName: { fontSize: 13, color: "#374151", flex: 1 },
  pdfSize: { fontSize: 10, color: "#9ca3af", marginTop: 1 },
  pdfOpen: { fontSize: 12, color: "#2563eb", fontWeight: "700" },

  uploadBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#2563eb", paddingVertical: 8, paddingHorizontal: 16,
  },
  uploadBannerText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  inputBarOuter: {
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  composerPhotoRow: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  composerPhotoLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  composerPhotoLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#475569",
  },
  composerPhotoDismiss: {
    fontSize: 16,
    color: "#94a3b8",
    fontWeight: "600",
  },
  composerPhotoThumb: {
    width: "100%",
    height: 96,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
  },
  chatHintBanner: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "#fffbeb",
    borderTopWidth: 1,
    borderTopColor: "#fde68a",
  },
  chatHintText: { fontSize: 12, color: "#92400e", lineHeight: 17, textAlign: "center" },
  doctorAssignBanner: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 10,
    backgroundColor: "#f0f9ff",
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#bae6fd",
  },
  doctorAssignBannerText: {
    fontSize: 13,
    color: "#0c4a6e",
    lineHeight: 18,
    textAlign: "center",
  },
  previewScroll: { maxHeight: 92, marginBottom: 4 },
  previewScrollContent: {
    paddingHorizontal: 10,
    alignItems: "center",
    flexDirection: "row",
  },
  previewChip: {
    width: 72,
    height: 72,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#e2e8f0",
    marginRight: 8,
  },
  previewChipImg: { width: "100%", height: "100%" },
  previewChipDoc: {
    width: "100%",
    height: "100%",
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
  },
  previewChipDocIcon: { fontSize: 22, marginBottom: 4 },
  previewChipDocName: { fontSize: 9, color: "#475569", textAlign: "center" },
  previewChipRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 10,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  previewChipRemoveTxt: { color: "#fff", fontSize: 11, fontWeight: "700" },
  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  attachBtn:  { padding: 8, justifyContent: "center", alignItems: "center" },
  attachIcon: { fontSize: 22 },
  input: {
    flex: 1, backgroundColor: "#f3f4f6", borderRadius: 22,
    paddingHorizontal: 14, paddingVertical: 9, fontSize: 14,
    color: "#111827", maxHeight: 100, minHeight: 38,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#2563eb",
    justifyContent: "center", alignItems: "center",
  },
  sendBtnOff: { backgroundColor: "#bfdbfe" },
  sendIcon:   { color: "#fff", fontSize: 16 },

  empty:      { alignItems: "center", paddingTop: 72 },
  emptyIcon:  { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#374151", marginBottom: 6 },
  emptySub:   { fontSize: 13, color: "#9ca3af", textAlign: "center", paddingHorizontal: 36, lineHeight: 20 },

  // No-clinic empty state
  noClinicState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 40,
  },
  noClinicIcon:  { fontSize: 64, marginBottom: 20 },
  noClinicTitle: {
    fontSize: 20, fontWeight: "800", color: "#111827",
    textAlign: "center", marginBottom: 12,
  },
  noClinicSub: {
    fontSize: 14, color: "#6b7280", textAlign: "center",
    lineHeight: 22, marginBottom: 36, paddingHorizontal: 8,
  },
  noClinicPrimary: {
    backgroundColor: "#2563eb",
    borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32,
    width: "100%", alignItems: "center", marginBottom: 12,
  },
  noClinicPrimaryTxt: {
    color: "#fff", fontSize: 16, fontWeight: "700",
  },
  noClinicSecondary: {
    backgroundColor: "#f0fdf4",
    borderRadius: 14, paddingVertical: 15, paddingHorizontal: 32,
    width: "100%", alignItems: "center",
    borderWidth: 1.5, borderColor: "#86efac",
  },
  noClinicSecondaryTxt: {
    color: "#15803d", fontSize: 16, fontWeight: "700",
  },
});

// ─── AI bubble styles ─────────────────────────────────────────────────────────

const ai = StyleSheet.create({
  loadingBubble: { paddingVertical: 12 },
  loadingRow:    { flexDirection: "row", alignItems: "center", gap: 10 },
  loadingText:   { fontSize: 13, color: "#6366f1", fontWeight: "600" },

  card: { width: "95%", maxWidth: 480, padding: 14, gap: 12 },

  header:      { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  headerIcon:  { fontSize: 16 },
  headerTitle: { fontSize: 16, fontWeight: "800", color: "#14532d", letterSpacing: -0.2 },

  analysisCard: {
    backgroundColor: "#f8faf8",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#d1fae5",
    gap: 10,
  },
  analysisSectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#166534",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  analysisList: { gap: 10 },
  analysisRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  analysisIndex: {
    fontSize: 13,
    fontWeight: "800",
    color: "#059669",
    minWidth: 18,
    marginTop: 1,
  },
  analysisLine: {
    flex: 1,
    fontSize: 14,
    color: "#1f2937",
    lineHeight: 21,
    fontWeight: "500",
  },
  analysisPlaceholder: {
    fontSize: 14,
    color: "#4b5563",
    lineHeight: 21,
    fontStyle: "italic",
  },
  analysisDisclaimer: {
    fontSize: 11,
    color: "#6b7280",
    lineHeight: 16,
    marginTop: 4,
  },

  treatmentSectionTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#15803d",
    marginBottom: 8,
  },
  treatmentSuggestList: { gap: 10 },
  treatmentSuggestRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#d1fae5",
  },
  treatmentSuggestIcon: { fontSize: 20, marginTop: 1 },
  treatmentSuggestLabel: {
    flex: 1,
    fontSize: 14,
    color: "#1f2937",
    fontWeight: "600",
    lineHeight: 20,
  },

  priceCard: {
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    gap: 8,
  },
  priceCardTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#166534",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  priceCardValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#14532d",
    letterSpacing: -0.5,
  },
  priceCardHint: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 19,
  },
  priceDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  priceDetailCat: { fontSize: 13, color: "#374151", flex: 1, fontWeight: "500" },
  priceDetailVal: { fontSize: 13, color: "#15803d", fontWeight: "700" },

  ctaPrimary: {
    backgroundColor: "#15803d",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 16,
    shadowColor: "#14532d",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  ctaPrimaryText: { color: "#fff", fontSize: 16, fontWeight: "800" },

  ctaSecondary: {
    backgroundColor: "#0f766e",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 10,
    minHeight: 48,
    justifyContent: "center",
  },
  ctaSecondaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },

  linkRow: { alignItems: "center", paddingVertical: 10, marginTop: 4 },
  linkRowText: {
    fontSize: 13,
    color: "#4f46e5",
    fontWeight: "600",
    textDecorationLine: "underline",
  },

  optionalToneSection: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#fafafa",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  optionalToneTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  optionalToneHint: {
    fontSize: 11,
    color: "#9ca3af",
    lineHeight: 16,
  },
  smileSimStartBtn: {
    marginTop: 10,
    alignSelf: "stretch",
    backgroundColor: "#15803d",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: "center",
  },
  smileSimStartBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },

  image: {
    width: "100%", height: 200, borderRadius: 10,
    marginVertical: 4, backgroundColor: "#f3f4f6",
  },

  insightsBlock: { gap: 6, marginTop: 4 },
  insightRow:    { flexDirection: "row", gap: 6 },
  bullet:        { fontSize: 14, color: "#6366f1", fontWeight: "800", marginTop: 1 },
  insightText:   { flex: 1, fontSize: 13, color: "#374151", lineHeight: 20 },

  // Confidence badge
  confidenceBadge: {
    marginLeft: "auto", borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  confidenceText: { fontSize: 10, fontWeight: "700" },

  // Before / After layout
  beforeAfterRow: { flexDirection: "row", gap: 8, marginVertical: 4 },
  beforeAfterItem: { flex: 1, gap: 4 },
  beforeAfterLabel: {
    fontSize: 11, fontWeight: "700", color: "#6b7280",
    textAlign: "center", textTransform: "uppercase", letterSpacing: 0.5,
  },
  halfImage: { width: "100%", height: 130, borderRadius: 8, backgroundColor: "#f3f4f6" },

  // Key message block (conversion hook) — kept for potential future use
  keyMsgBox: {
    backgroundColor: "#f5f3ff", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 2,
  },
  keyMsgText: { fontSize: 13, color: "#4338ca", lineHeight: 20, fontWeight: "600" },

  // Recommended treatment section
  treatmentBox: {
    backgroundColor: "#f0fdf4", borderRadius: 12,
    padding: 12, gap: 8,
    borderWidth: 1, borderColor: "#bbf7d0",
  },
  treatmentTitle: {
    fontSize: 15, fontWeight: "800", color: "#15803d", marginBottom: 4,
  },
  dentalConditionBanner: {
    backgroundColor: "#ecfeff",
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#a5f3fc",
  },
  dentalConditionText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#0e7490",
    lineHeight: 19,
  },
  missingToothBlock: {
    backgroundColor: "#eff6ff",
    borderRadius: 10,
    padding: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    gap: 8,
  },
  missingToothHeadline: {
    fontSize: 14,
    fontWeight: "800",
    color: "#1e40af",
  },
  missingToothOption: {
    paddingVertical: 4,
    gap: 4,
  },
  missingToothOptionSep: {
    borderTopWidth: 1,
    borderTopColor: "#dbeafe",
    paddingTop: 10,
    marginTop: 2,
  },
  missingToothOptionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#1e3a8a",
  },
  missingToothOptionExpl: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 17,
  },
  missingToothOptionPrice: {
    fontSize: 12,
    fontWeight: "600",
    color: "#64748b",
  },
  missingToothPlanDisclaimer: {
    fontSize: 11,
    color: "#64748b",
    fontStyle: "italic",
    lineHeight: 16,
    marginTop: 2,
  },
  treatmentSubLabel: {
    fontSize: 12, fontWeight: "700", color: "#166534", marginBottom: 4,
  },
  treatmentDisclaimer: {
    fontSize: 11, color: "#6b7280", fontStyle: "italic",
    lineHeight: 16, marginTop: 10,
  },
  treatmentQuoteCta: {
    backgroundColor: "#059669", borderRadius: 10,
    paddingVertical: 12, alignItems: "center", marginTop: 10,
  },
  treatmentQuoteCtaText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  offerLeadBtn: {
    backgroundColor: "#0d9488",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 10,
    minHeight: 44,
    justifyContent: "center",
  },
  offerLeadBtnSent: { backgroundColor: "#6b7280" },
  offerLeadBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  offerLeadSuccess: {
    fontSize: 12,
    color: "#059669",
    fontWeight: "600",
    textAlign: "center",
    marginTop: 6,
  },
  treatmentRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
  },
  treatmentBullet: { fontSize: 14, color: "#22c55e", fontWeight: "800" },
  treatmentItem:   { flex: 1, fontSize: 13, color: "#374151", fontWeight: "600" },
  treatmentPrice:  { fontSize: 12, color: "#6b7280", fontWeight: "500" },

  // Primary CTA button
  primaryBtn: {
    backgroundColor: "#4f46e5", borderRadius: 12,
    paddingVertical: 13, alignItems: "center", marginTop: 4,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  // Secondary CTA (text link style)
  secondaryBtn: { alignItems: "center", paddingVertical: 8 },
  secondaryBtnText: {
    fontSize: 13, color: "#6366f1", fontWeight: "600",
    textDecorationLine: "underline",
  },

  // Inline disclaimer (replaces yellowed box)
  disclaimerInline: {
    fontSize: 10, color: "#9ca3af", fontStyle: "italic",
    textAlign: "center", lineHeight: 15,
  },
});

const cl = StyleSheet.create({
  section: {
    borderTopWidth: 1, borderTopColor: "#e5e7eb",
    paddingTop: 10, marginTop: 4, gap: 8,
  },
  sectionTitle: {
    fontSize: 12, fontWeight: "700", color: "#374151",
    textTransform: "uppercase", letterSpacing: 0.4,
  },

  card: {
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 10,
    backgroundColor: "#fafafa", overflow: "hidden",
  },
  cardBody: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 10, paddingVertical: 10, gap: 8,
  },
  cardInfo:    { flex: 1, gap: 3 },
  clinicName:  { fontSize: 13, fontWeight: "700", color: "#111827" },

  tagRow:      { flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" },
  specialtyTag: {
    backgroundColor: "#eff6ff", borderRadius: 20,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  specialtyText: { fontSize: 10, fontWeight: "600", color: "#2563eb" },
  cityText:      { fontSize: 11, color: "#6b7280" },
  distanceBadge: {
    backgroundColor: "#f0fdf4", borderRadius: 20,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  distanceText:  { fontSize: 10, fontWeight: "600", color: "#15803d" },
  ratingText:    { fontSize: 11, color: "#92400e", fontWeight: "600" },

  ctaBtn: {
    backgroundColor: "#2563eb", borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    alignItems: "center",
  },
  ctaBtnText: { fontSize: 12, fontWeight: "700", color: "#fff" },

  safetyNote: {
    fontSize: 10, color: "#9ca3af", fontStyle: "italic", textAlign: "center",
  },
});

// ─── Clinic Selector Modal styles ────────────────────────────────────────────
const cm = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12, gap: 4,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: "#d1d5db", alignSelf: "center", marginBottom: 12,
  },
  title:    { fontSize: 17, fontWeight: "800", color: "#111827", marginBottom: 2 },
  subtitle: { fontSize: 13, color: "#6b7280", marginBottom: 10 },

  row: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 11, gap: 10,
    backgroundColor: "#fafafa", marginBottom: 8,
  },
  rowInfo:      { flex: 1, gap: 3 },
  rowName:      { fontSize: 14, fontWeight: "700", color: "#111827" },
  rowMeta:      { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  rowSpecialty: { fontSize: 11, color: "#2563eb", fontWeight: "600" },
  rowDistance:  { fontSize: 11, color: "#15803d", fontWeight: "600" },

  selectBtn: {
    backgroundColor: "#4f46e5", borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  selectBtnText: { fontSize: 13, fontWeight: "700", color: "#fff" },

  cancelBtn: {
    alignItems: "center", paddingVertical: 12, marginTop: 4,
  },
  cancelText: { fontSize: 14, color: "#9ca3af" },
});

const im = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
  },
  closeBtn:  { padding: 4 },
  closeText: { fontSize: 18, color: "#6b7280" },
  title:     { fontSize: 17, fontWeight: "800", color: "#111827" },
  badge:     { fontSize: 13, fontWeight: "700", color: "#2563eb" },

  dots: { flexDirection: "row", justifyContent: "center", gap: 8, paddingVertical: 16 },
  dot: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: "#f3f4f6",
    borderWidth: 1.5, borderColor: "#e5e7eb",
    justifyContent: "center", alignItems: "center",
  },
  dotActive:     { backgroundColor: "#eff6ff", borderColor: "#2563eb" },
  dotDone:       { backgroundColor: "#d1fae5", borderColor: "#10b981" },
  dotText:       { fontSize: 12, fontWeight: "700", color: "#9ca3af" },
  dotTextActive: { color: "#2563eb" },

  body:        { padding: 20, alignItems: "center", gap: 14, paddingBottom: 40 },
  stepIcon:    { fontSize: 52 },
  stepLabel:   { fontSize: 22, fontWeight: "800", color: "#111827" },
  stepInstruction: { fontSize: 14, color: "#6b7280", textAlign: "center", lineHeight: 22 },

  preview: { width: "100%", height: 230, borderRadius: 14, marginTop: 4 },
  placeholder: {
    width: "100%", height: 230, borderRadius: 14, backgroundColor: "#f8fafc",
    borderWidth: 2, borderColor: "#e5e7eb", borderStyle: "dashed",
    justifyContent: "center", alignItems: "center", gap: 8,
  },
  placeholderIcon: { fontSize: 40 },
  placeholderText: { fontSize: 14, color: "#9ca3af" },

  cameraBtn:     { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
  cameraBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  navRow: { flexDirection: "row", gap: 12, width: "100%" },
  navBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: "center",
    backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb",
  },
  navBtnOff:     { opacity: 0.35 },
  navBtnText:    { fontSize: 14, fontWeight: "600", color: "#374151" },
  submitBtn:     { backgroundColor: "#065f46", borderColor: "#10b981" },
  submitBtnText: { color: "#fff" },

  hint: { fontSize: 11, color: "#9ca3af", textAlign: "center", lineHeight: 17 },
});
