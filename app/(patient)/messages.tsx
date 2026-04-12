import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Image,
  Linking, Modal, ScrollView, ActionSheetIOS,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system";
import * as Location from "expo-location";
import * as DocumentPicker from "expo-document-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";
import { useDateLocale } from "../../lib/date-locale";
import { useUnreadMessages } from "../../lib/useUnreadMessages";
import { useLanguage } from "../../lib/language-context";

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
  /** true for locally-generated loading bubbles (not persisted) */
  _local?: boolean;
};

// ─── Clinic contact bridge ────────────────────────────────────────────────────
// Allows clinic cards (rendered outside MessagesScreen) to set the chat input.

type ContactHandler = (prefillText: string) => void;
const _contactHandlers: ContactHandler[] = [];

function onClinicContact(fn: ContactHandler): () => void {
  _contactHandlers.push(fn);
  return () => {
    const i = _contactHandlers.indexOf(fn);
    if (i > -1) _contactHandlers.splice(i, 1);
  };
}

function triggerClinicContact(msg: string) {
  _contactHandlers.forEach(fn => fn(msg));
}

// ─── Location helper ─────────────────────────────────────────────────────────

type UserLocation = { latitude: number; longitude: number } | null;

/** Requests foreground location permission and returns coords, or null if denied/error. */
async function getUserLocation(): Promise<UserLocation> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,  // ~100m — fast, battery-friendly
    });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
  } catch {
    return null;   // location unavailable — clinic recommendations still work without it
  }
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

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const locale = useDateLocale();
  const router = useRouter();

  const [messages, setMessages]                   = useState<Message[]>([]);
  const [localMessages, setLocalMessages]         = useState<Message[]>([]);
  const [loading, setLoading]                     = useState(true);
  const [text, setText]                           = useState("");
  const [sending, setSending]                     = useState(false);
  const [uploading, setUploading]                 = useState(false);
  const [intraoralVisible, setIntraoralVisible]   = useState(false);
  const [intraoralStep, setIntraoralStep]         = useState(0);
  const [intraoralPhotos, setIntraoralPhotos]     = useState<Record<string, any>>({});

  const flatRef        = useRef<FlatList>(null);
  const pollRef        = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCountRef   = useRef(0);

  const patientId = String(user?.patientId || "").trim();
  const token     = user?.token;
  const { markRead } = useUnreadMessages(patientId || undefined, token || undefined);

  // Register clinic-contact bridge: pre-fills text input and scrolls to bottom
  useEffect(() => {
    const unregister = onClinicContact((prefill) => {
      setText(prefill);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unregister;
  }, []);

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  }), [token]);

  // ── All messages merged (backend + local loading) ──────────────────────────

  const allMessages = [...messages, ...localMessages].sort(
    (a, b) => a.createdAt - b.createdAt
  );

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async (silent = false) => {
    if (!token || !patientId) { if (!silent) setLoading(false); return; }
    try {
      const res = await fetch(
        `${API_BASE}/api/patient/${encodeURIComponent(patientId)}/messages`,
        { headers: authHeaders() }
      );
      const json = await res.json().catch(() => ({}));
      const msgs: Message[] = Array.isArray(json.messages)
        ? json.messages.sort((a: Message, b: Message) => a.createdAt - b.createdAt)
        : [];
      setMessages(msgs);
      if (msgs.length > lastCountRef.current) {
        lastCountRef.current = msgs.length;
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch {}
    finally { if (!silent) setLoading(false); }
  }, [token, patientId, authHeaders]);

  useEffect(() => {
    markRead();
    fetchMessages();
    pollRef.current = setInterval(() => fetchMessages(true), 12_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMessages, markRead]);

  // ── Send text ──────────────────────────────────────────────────────────────

  const sendText = async () => {
    const msg = text.trim();
    if (!msg || sending || uploading) return;
    setSending(true);
    setText("");
    try {
      const res = await fetch(
        `${API_BASE}/api/patient/${encodeURIComponent(patientId)}/messages`,
        { method: "POST", headers: authHeaders(), body: JSON.stringify({ text: msg, type: "text" }) }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setText(msg);
        if (err.error === "CHAT_LOCKED") {
          Alert.alert(t("messages.lockedTitle"), t("messages.lockedMsg"));
        } else {
          Alert.alert(t("common.error"), t("messages.sendFailed"));
        }
      } else {
        fetchMessages(true);
      }
    } catch {
      setText(msg);
      Alert.alert(t("common.error"), t("messages.connectionError"));
    } finally { setSending(false); }
  };

  // ── Upload consent gate ────────────────────────────────────────────────────

  const checkUploadConsent = (): Promise<boolean> =>
    new Promise(async (resolve) => {
      const accepted = await AsyncStorage.getItem(UPLOAD_CONSENT_KEY).catch(() => null);
      if (accepted === "1") { resolve(true); return; }
      Alert.alert(
        t("upload.consentTitle"),
        t("upload.consentMessage"),
        [
          { text: t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
          {
            text: t("upload.consentConfirm"),
            onPress: async () => {
              await AsyncStorage.setItem(UPLOAD_CONSENT_KEY, "1").catch(() => {});
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
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("files", { uri, name, type: mimeType } as any);
      formData.append("patientId", patientId);
      if (mimeType.startsWith("image/")) formData.append("isImage", "true");

      const res = await fetch(`${API_BASE}/api/chat/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        body: formData,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        Alert.alert(t("chat.uploadError"), json.message || json.error || t("messages.uploadFailed"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("common.retry") ?? "Retry", onPress: () => uploadFile(uri, name, mimeType) },
        ]);
        return null;
      }
      await fetchMessages(true);
      // Return the first uploaded file's URL
      return json.files?.[0]?.url ?? null;
    } catch {
      Alert.alert(t("common.error"), t("messages.uploadFailed"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.retry") ?? "Retry", onPress: () => uploadFile(uri, name, mimeType) },
      ]);
      return null;
    } finally { setUploading(false); }
  };

  // ── Image compression ──────────────────────────────────────────────────────
  // Single source of truth for all image flows.
  // Options allow future callers (e.g. intraoral vs AI) to tune per-context.

  const compressImage = async (
    uri: string,
    mimeType: string,
    opts: {
      maxWidth?: number;   // default 1024 — future: front-camera may use 800
      quality?: number;    // default 0.75
    } = {}
  ): Promise<{ uri: string; mimeType: string }> => {
    // JPEG, PNG, HEIC, HEIF → all converted to JPEG for AI pipeline consistency
    const isCompressible =
      mimeType === "image/jpeg" ||
      mimeType === "image/jpg"  ||
      mimeType === "image/png"  ||
      mimeType === "image/heic" ||
      mimeType === "image/heif";
    if (!isCompressible) return { uri, mimeType };

    const { maxWidth = 1024, quality = 0.75 } = opts;
    const _t0 = Date.now();

    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: maxWidth } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
      );

      const durationMs = Date.now() - _t0;

      // ── Size check — read file size via FileSystem ──────────────────
      let sizeKB = 0;
      try {
        const info = await FileSystem.getInfoAsync(result.uri, { size: true });
        sizeKB = info.exists && "size" in info ? Math.round((info as any).size / 1024) : 0;
      } catch { /* non-fatal */ }

      console.log(`[compress] ${durationMs}ms | ${sizeKB}KB | ${maxWidth}px | q${quality}`);

      // ── Safety re-compress if still > 1 MB ─────────────────────────
      const ONE_MB_KB = 1024;
      if (sizeKB > ONE_MB_KB) {
        console.log(`[compress] ${sizeKB}KB > 1MB — re-compressing at q0.6`);
        try {
          const reResult = await ImageManipulator.manipulateAsync(
            result.uri,
            [],                           // already resized — no second resize needed
            { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG }
          );
          let reSizeKB = 0;
          try {
            const reInfo = await FileSystem.getInfoAsync(reResult.uri, { size: true });
            reSizeKB = reInfo.exists && "size" in reInfo ? Math.round((reInfo as any).size / 1024) : 0;
          } catch { /* non-fatal */ }
          console.log(`[compress] re-compress → ${reSizeKB}KB | q0.6`);
          return { uri: reResult.uri, mimeType: "image/jpeg" };
        } catch {
          // Re-compress failed — continue with first pass result
          console.warn("[compress] re-compress failed, using first-pass result");
        }
      }

      return { uri: result.uri, mimeType: "image/jpeg" };
    } catch (err) {
      // Compression failed entirely — fall back to original, never block the user
      console.warn("[compress] failed, using original:", (err as Error)?.message);
      return { uri, mimeType };
    }
  };

  // ── AI photo processing pipeline ───────────────────────────────────────────
  // photoType maps to backend PHOTO_TYPE_CONTEXT keys:
  //   'front' | 'left' | 'right' | 'upper' | 'lower' | 'general'

  const processPhotoWithAI = async (
    uri: string,
    name: string,
    mimeType: string,
    photoType = "general"
  ) => {
    console.log("[AI] Triggered for:", photoType, name);

    // Step 0 – compress (single pass; callers must NOT pre-compress)
    const compressed = await compressImage(uri, mimeType);
    const uploadUri      = compressed.uri;
    const uploadMimeType = compressed.mimeType;
    const uploadName     = uploadMimeType === "image/jpeg" && !name.endsWith(".jpg") && !name.endsWith(".jpeg")
      ? name.replace(/\.[^.]+$/, "") + ".jpg"
      : name;

    console.log("[AI] Compressed:", uploadMimeType, uploadName);

    // Step 1 – upload image (shows in chat as patient message)
    // Upload is required to get a server-side URL for the AI endpoint.
    // If it fails, we fall through without blocking the user.
    const fileUrl = await uploadFile(uploadUri, uploadName, uploadMimeType);
    if (!fileUrl) {
      console.warn("[AI] Upload failed — skipping AI for", photoType);
      return;
    }

    console.log("[AI] Uploaded:", fileUrl, "→ starting analysis");

    // Fetch location in parallel while the loading bubble is shown (non-blocking)
    const userLocation = await getUserLocation();
    if (userLocation) {
      console.log("[AI] Location acquired:", userLocation.latitude.toFixed(4), userLocation.longitude.toFixed(4));
    }

    // Step 2 – add local loading bubble
    const loadingId = `ai_loading_${Date.now()}`;
    const loadingMsg: Message = {
      id: loadingId,
      from: "CLINIC",
      type: "ai_loading",
      text: "Fotoğraf analiz ediliyor...",
      createdAt: Date.now() + 500,
      _local: true,
    };
    setLocalMessages(prev => [...prev, loadingMsg]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 150);

    // Step 3 – call AI endpoint (20 s client-side timeout)
    const aiController = new AbortController();
    const aiTimeout = setTimeout(() => aiController.abort(), 20_000);
    try {
      const aiRes = await fetch(`${API_BASE}/api/chat/ai-analyze`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ patientId, imageUrl: fileUrl, photoType, userLocation }),
        signal: aiController.signal,
      });
      clearTimeout(aiTimeout);
      if (!aiRes.ok) {
        const errBody = await aiRes.json().catch(() => ({}));
        console.warn("[AI] Endpoint error:", errBody.error, photoType);
        if (errBody.error === "image_too_large") {
          Alert.alert(
            t("messages.uploadError") || "Hata",
            errBody.message || "Görsel çok büyük, lütfen tekrar çekin."
          );
        }
        // ai_timeout / other → original image still visible in chat
      } else {
        console.log("[AI] Analysis complete for:", photoType);
      }
    } catch (e) {
      clearTimeout(aiTimeout);
      console.warn("[AI] Fetch error/abort for:", photoType, (e as Error)?.message);
      // Network error or client abort — original image still visible
    } finally {
      // Step 4 – remove loading bubble & refresh
      setLocalMessages(prev => prev.filter(m => m.id !== loadingId));
      await fetchMessages(true);
    }
  };

  // ── Pickers ────────────────────────────────────────────────────────────────

  const pickImage = async () => {
    if (!await checkUploadConsent()) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("messages.permissionRequired"), t("messages.galleryPermission"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      // No quality here — compressImage() centralises all encoding at 1024px/0.75q
      allowsMultipleSelection: true,   // ENABLE_MULTI_PHOTO_PROGRESS: each photo → own AI
      selectionLimit: 5,
    });
    if (!result.canceled && result.assets.length > 0) {
      // Process each photo independently (non-blocking: fire-and-forget per photo)
      for (const a of result.assets) {
        processPhotoWithAI(
          a.uri,
          a.fileName || `photo_${Date.now()}.jpg`,
          a.mimeType || "image/jpeg"
        );
        // Small stagger so loading bubbles appear in order
        await new Promise(r => setTimeout(r, 200));
      }
    }
  };

  const pickDocument = async () => {
    if (!await checkUploadConsent()) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      await uploadFile(a.uri, a.name, a.mimeType || "application/octet-stream");
    }
  };

  const openGuidedCamera = () => {
    router.push({ pathname: "/intraoral-camera" as any, params: { patientId } });
  };

  const showAttachMenu = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [t("common.cancel"), t("chat.selectImage"), t("chat.selectFile"), t("chat.intraoralPhoto")],
          cancelButtonIndex: 0,
        },
        (i) => {
          if (i === 1) pickImage();
          else if (i === 2) pickDocument();
          else if (i === 3) openGuidedCamera();
        }
      );
    } else {
      Alert.alert(t("messages.addFile"), t("messages.selectSource"), [
        { text: t("chat.selectImage"),    onPress: pickImage },
        { text: t("chat.selectFile"),     onPress: pickDocument },
        { text: t("chat.intraoralPhoto"), onPress: openGuidedCamera },
        { text: t("common.cancel"),       style: "cancel" },
      ]);
    }
  };

  // ── Intraoral ─────────────────────────────────────────────────────────────

  const captureIntraoralStep = async () => {
    if (!await checkUploadConsent()) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("messages.permissionRequired"), t("messages.cameraPermission"));
      return;
    }
    // No quality param — compressImage() runs at upload time in submitIntraoralPhotos
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: "images" });
    if (!result.canceled && result.assets[0]) {
      const key = PHOTO_STEP_KEYS[intraoralStep]?.key;
      if (key) setIntraoralPhotos(prev => ({ ...prev, [key]: result.assets[0] }));
    }
  };

  const submitIntraoralPhotos = async () => {
    const entries = Object.entries(intraoralPhotos);
    if (entries.length === 0) { Alert.alert(t("common.error"), t("messages.intraoral.noPhotoError")); return; }
    setIntraoralVisible(false);

    console.log("[AI] Submitting", entries.length, "intraoral photo(s)");

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
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
    >
      <View style={s.container}>
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>{t("messages.title")}</Text>
          <Text style={s.headerSub}>{t("messages.subtitle")}</Text>
        </View>

        {/* Message list */}
        <FlatList
          ref={flatRef}
          data={allMessages}
          keyExtractor={(m, i) => m.id || String(i)}
          contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const prev = allMessages[index - 1];
            const showDay = !prev || fmtDay(prev.createdAt, locale) !== fmtDay(item.createdAt, locale);
            return (
              <>
                {showDay && (
                  <View style={s.dayRow}>
                    <View style={s.dayLine} />
                    <Text style={s.dayLabel}>{fmtDay(item.createdAt, locale)}</Text>
                    <View style={s.dayLine} />
                  </View>
                )}
                <MessageBubble msg={item} />
              </>
            );
          }}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>💬</Text>
              <Text style={s.emptyTitle}>{t("chat.noMessages")}</Text>
              <Text style={s.emptySub}>{t("messages.emptySub")}</Text>
            </View>
          }
        />

        {/* Upload indicator */}
        {uploading && (
          <View style={s.uploadBanner}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={s.uploadBannerText}>{t("messages.uploading")}</Text>
          </View>
        )}

        {/* Input bar */}
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
            style={[s.sendBtn, (!text.trim() || sending || uploading) && s.sendBtnOff]}
            onPress={sendText}
            disabled={!text.trim() || sending || uploading}
            activeOpacity={0.8}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={s.sendIcon}>➤</Text>}
          </TouchableOpacity>
        </View>
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
          onPress={() => triggerClinicContact(PREFILL)}
        >
          <Text style={cl.ctaBtnText}>Mesaj Gönder</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── AiLoadingBubble ──────────────────────────────────────────────────────────

function AiLoadingBubble() {
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
          <Text style={ai.loadingText}>Fotoğraf analiz ediliyor{dots}</Text>
        </View>
      </View>
    </View>
  );
}

// ─── AiResultBubble ───────────────────────────────────────────────────────────

const CONFIDENCE_LABEL: Record<string, string> = {
  low: "Düşük güven", medium: "Orta güven", high: "Yüksek güven",
};
const CONFIDENCE_COLOR: Record<string, string> = {
  low: "#f59e0b", medium: "#3b82f6", high: "#10b981",
};

function AiResultBubble({ msg }: { msg: Message }) {
  const result = msg.attachment?.aiResult;
  if (!result) return null;

  const apiBase    = API_BASE;
  const resolveUrl = (url: string) =>
    url.startsWith("http") ? url : `${apiBase}${url}`;

  const hasSimulation = !!result.simulatedImageUrl;
  const conf          = result.confidence ?? "medium";
  const summaryText   = result.summary || result.overallNote || "";

  return (
    <View style={[s.bubbleWrap, s.bubbleLeft]}>
      <Text style={s.bubbleFrom}>AI</Text>
      <View style={[s.bubble, s.bubbleClinic, ai.card]}>

        {/* ── Header ── */}
        <View style={ai.header}>
          <Text style={ai.headerIcon}>✨</Text>
          <Text style={ai.headerTitle}>AI Önizleme</Text>
          {result.confidence && (
            <View style={[ai.confidenceBadge, { backgroundColor: CONFIDENCE_COLOR[conf] + "22" }]}>
              <Text style={[ai.confidenceText, { color: CONFIDENCE_COLOR[conf] }]}>
                {CONFIDENCE_LABEL[conf]}
              </Text>
            </View>
          )}
        </View>

        {/* ── Before / After or single image ── */}
        {hasSimulation ? (
          <View style={ai.beforeAfterRow}>
            <View style={ai.beforeAfterItem}>
              <Text style={ai.beforeAfterLabel}>Önce</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => result.originalImageUrl && Linking.openURL(resolveUrl(result.originalImageUrl))}
              >
                <Image source={{ uri: resolveUrl(result.originalImageUrl!) }} style={ai.halfImage} resizeMode="cover" />
              </TouchableOpacity>
            </View>
            <View style={ai.beforeAfterItem}>
              <Text style={ai.beforeAfterLabel}>Sonra</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => Linking.openURL(resolveUrl(result.simulatedImageUrl!))}
              >
                <Image source={{ uri: resolveUrl(result.simulatedImageUrl!) }} style={ai.halfImage} resizeMode="cover" />
              </TouchableOpacity>
            </View>
          </View>
        ) : result.originalImageUrl ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => Linking.openURL(resolveUrl(result.originalImageUrl!))}
          >
            <Image source={{ uri: resolveUrl(result.originalImageUrl!) }} style={ai.image} resizeMode="cover" />
          </TouchableOpacity>
        ) : null}

        {/* ── Insights ── */}
        {result.insights.length > 0 && (
          <View style={ai.insightsBlock}>
            {result.insights.map((insight, i) => (
              <View key={i} style={ai.insightRow}>
                <Text style={ai.bullet}>•</Text>
                <Text style={ai.insightText}>{insight}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Summary ── */}
        {!!summaryText && (
          <Text style={ai.summary}>{summaryText}</Text>
        )}

        {/* ── Recommendation ── */}
        {!!result.recommendation && (
          <View style={ai.recommendationBox}>
            <Text style={ai.recommendationLabel}>💡 Öneri</Text>
            <Text style={ai.recommendationText}>{result.recommendation}</Text>
          </View>
        )}

        {/* ── CTA ── */}
        <Text style={ai.cta}>
          Daha detaylı analiz için farklı açılardan fotoğraf ekleyebilirsiniz.
        </Text>

        {/* ── Disclaimer ── */}
        <View style={ai.disclaimerBox}>
          <Text style={ai.disclaimerText}>{result.disclaimer}</Text>
        </View>

        {/* ── Clinic recommendations ── */}
        {result.clinics && result.clinics.length > 0 && (
          <View style={cl.section}>
            <Text style={cl.sectionTitle}>Bu durumu değerlendirebilecek klinikler</Text>
            {result.clinics.map((clinic) => (
              <ClinicCard key={clinic.id} clinic={clinic} />
            ))}
            <Text style={cl.safetyNote}>
              Bu klinikler yalnızca öneri niteliğindedir.
            </Text>
          </View>
        )}

        <Text style={s.bubbleTime}>{fmtTime(msg.createdAt, "tr-TR")}</Text>
      </View>
    </View>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const locale = useDateLocale();
  const { t } = useLanguage();

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
      {!isPatient && <Text style={s.bubbleFrom}>{t("messages.clinic")}</Text>}
      <View style={[s.bubble, isPatient ? s.bubblePatient : s.bubbleClinic]}>
        {!!msg.text && (
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
}

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
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#111827" },
  headerSub:   { fontSize: 12, color: "#6b7280", marginTop: 2 },

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

  inputBar: {
    flexDirection: "row", alignItems: "flex-end", gap: 8,
    backgroundColor: "#fff", paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: "#e5e7eb",
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
});

// ─── AI bubble styles ─────────────────────────────────────────────────────────

const ai = StyleSheet.create({
  loadingBubble: { paddingVertical: 12 },
  loadingRow:    { flexDirection: "row", alignItems: "center", gap: 10 },
  loadingText:   { fontSize: 13, color: "#6366f1", fontWeight: "600" },

  card: { maxWidth: "90%", padding: 14, gap: 10 },

  header:      { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  headerIcon:  { fontSize: 16 },
  headerTitle: { fontSize: 15, fontWeight: "800", color: "#111827" },

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

  // Summary (replaces overallNote)
  summary: {
    fontSize: 13, color: "#4b5563", fontStyle: "italic",
    borderTopWidth: 1, borderTopColor: "#f3f4f6", paddingTop: 8, marginTop: 2,
  },

  // Recommendation block
  recommendationBox: {
    backgroundColor: "#eff6ff", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 8, gap: 3,
  },
  recommendationLabel: { fontSize: 11, fontWeight: "700", color: "#1d4ed8" },
  recommendationText:  { fontSize: 13, color: "#1e40af", lineHeight: 19 },

  // CTA line
  cta: {
    fontSize: 12, color: "#6366f1", fontStyle: "italic",
    borderTopWidth: 1, borderTopColor: "#f3f4f6", paddingTop: 8, marginTop: 2,
  },

  disclaimerBox: {
    backgroundColor: "#fef9c3", borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7, marginTop: 2,
  },
  disclaimerText: { fontSize: 11, color: "#854d0e", lineHeight: 16 },
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
