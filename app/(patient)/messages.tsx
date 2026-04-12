import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useLocalSearchParams, useNavigation } from "expo-router";
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Image,
  Linking, Modal, ScrollView, ActionSheetIOS,
  PanResponder, Animated,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as FileSystem from "expo-file-system/legacy";
import * as Location from "expo-location";
import * as DocumentPicker from "expo-document-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";
import { onIntraoralPhotoReady } from "../../lib/photoCallbacks";
import { useDateLocale } from "../../lib/date-locale";
import { useUnreadMessages } from "../../lib/useUnreadMessages";
import { useLanguage } from "../../lib/language-context";

const UPLOAD_CONSENT_KEY       = "@clinifly:upload_consent_accepted";
const PREFERRED_DESTINATION_KEY = "@clinifly:preferredDestination";

// ─── Destination options ──────────────────────────────────────────────────────

type DestinationOption = {
  id: string;          // "nearby" | ISO-2 country code used in DB
  label: string;
  flag: string;
};

const DESTINATION_OPTIONS: DestinationOption[] = [
  { id: "nearby",   label: "Yakın",     flag: "📍" },
  { id: "TR",       label: "Türkiye",   flag: "🇹🇷" },
  { id: "GE",       label: "Gürcistan", flag: "🇬🇪" },
  { id: "DE",       label: "Almanya",   flag: "🇩🇪" },
  { id: "AE",       label: "Dubai",     flag: "🇦🇪" },
  { id: "GB",       label: "İngiltere", flag: "🇬🇧" },
];

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

// ─── Smile-simulation bridge ─────────────────────────────────────────────────
// Keyed by originalImageUrl (stable, unique per AI analysis).
// processPhotoWithAI fires the simulation; AiResultBubble listens for results.
// Cache survives re-renders; subscribers are registered per mounted bubble.

type SimVariation = { id: string; label: string; url: string };

const _simCache      = new Map<string, string>();            // imageUrl → primary (balanced) url
const _simVariations = new Map<string, SimVariation[]>();    // imageUrl → all 3 variations
const _simPending    = new Set<string>();                    // currently in-flight
const _simFailed     = new Set<string>();                    // permanently failed (until manual retry)
const _simSubs       = new Map<string, Array<() => void>>();

function subscribeSimUrl(imageUrl: string, cb: () => void): () => void {
  const arr = _simSubs.get(imageUrl) ?? [];
  _simSubs.set(imageUrl, [...arr, cb]);
  return () => {
    _simSubs.set(imageUrl, (_simSubs.get(imageUrl) ?? []).filter(fn => fn !== cb));
  };
}

function _notifySimSubs(imageUrl: string) {
  _simSubs.get(imageUrl)?.forEach(fn => fn());
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
  const navigation = useNavigation();
  const { openCamera } = useLocalSearchParams<{ openCamera?: string }>();

  const [messages, setMessages]                   = useState<Message[]>([]);
  const [localMessages, setLocalMessages]         = useState<Message[]>([]);
  const [loading, setLoading]                     = useState(true);
  const [text, setText]                           = useState("");
  const [sending, setSending]                     = useState(false);
  const [uploading, setUploading]                 = useState(false);
  const [intraoralVisible, setIntraoralVisible]   = useState(false);
  const [intraoralStep, setIntraoralStep]         = useState(0);
  const [intraoralPhotos, setIntraoralPhotos]     = useState<Record<string, any>>({});
  const [preferredDestination, setPreferredDestination] = useState<string>("nearby");

  const flatRef           = useRef<FlatList>(null);
  const pollRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCountRef      = useRef(0);
  const autoCameraFiredRef = useRef(false);

  const patientId  = String(user?.patientId || "").trim();
  const token      = user?.token;
  const hasClinic  = !!user?.clinicId;
  const { markRead } = useUnreadMessages(patientId || undefined, token || undefined);

  // Register clinic-contact bridge: pre-fills text input and scrolls to bottom
  useEffect(() => {
    const unregister = onClinicContact((prefill) => {
      setText(prefill);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unregister;
  }, []);

  // Register intraoral camera bridge — always calls the latest processPhotoWithAI via ref
  useEffect(() => {
    onIntraoralPhotoReady((uri, name, mimeType, photoType) => {
      processPhotoRef.current?.(uri, name, mimeType, photoType);
    });
  }, []);

  // Load persisted destination preference
  useEffect(() => {
    AsyncStorage.getItem(PREFERRED_DESTINATION_KEY).then(val => {
      if (val) setPreferredDestination(val);
    });
  }, []);

  const selectDestination = useCallback(async (id: string) => {
    setPreferredDestination(id);
    await AsyncStorage.setItem(PREFERRED_DESTINATION_KEY, id);
  }, []);

  // Ref so pickImage() / processPhotoWithAI() are always latest inside effects/bridges
  const pickImageRef       = useRef<() => Promise<void>>();
  const processPhotoRef    = useRef<typeof processPhotoWithAI>();

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
    // ── Pre-flight: read file size ───────────────────────────────────
    let sizeKB = 0;
    try {
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      const size = info.exists && "size" in info ? (info as any).size as number : 0;
      sizeKB = Math.round(size / 1024);
      if (size === 0) {
        console.error("[UPLOAD ERROR] File is 0 bytes, aborting upload:", uri);
        Alert.alert("Hata", "Fotoğraf işlenemedi, lütfen tekrar deneyin.");
        return null;
      }
    } catch (sizeErr) {
      console.warn("[UPLOAD] Could not read file size:", (sizeErr as Error)?.message);
    }

    console.log("[UPLOAD START]:", { uri, sizeKB, mimeType, name, endpoint: `${API_BASE}/api/chat/upload` });

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

      console.log("[UPLOAD RESPONSE STATUS]:", res.status);
      const rawText = await res.text().catch((e) => `[text() failed: ${(e as Error).message}]`);
      console.log("[UPLOAD RESPONSE RAW]:", rawText.slice(0, 600));

      let json: Record<string, any> = {};
      try { json = JSON.parse(rawText); } catch { /* non-JSON response already logged */ }

      if (!res.ok) {
        Alert.alert(t("chat.uploadError"), json.message || json.error || t("messages.uploadFailed"), [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("common.retry") ?? "Retry", onPress: () => uploadFile(uri, name, mimeType) },
        ]);
        return null;
      }
      await fetchMessages(true);
      return json.files?.[0]?.url ?? null;
    } catch (uploadErr) {
      const err = uploadErr as Error;
      console.error("[UPLOAD ERROR FULL]:", { message: err?.message, stack: err?.stack });
      Alert.alert(t("common.error"), t("messages.uploadFailed"), [
        { text: t("common.cancel"), style: "cancel" },
        { text: t("common.retry") ?? "Retry", onPress: () => uploadFile(uri, name, mimeType) },
      ]);
      return null;
    } finally { setUploading(false); }
  };

  // ── AI-only upload (no clinic_id / messages DB write required) ────────────
  // Uses a dedicated backend endpoint that stores the photo in Supabase Storage
  // and returns a signed URL for the ai-analyze endpoint to fetch.
  const uploadForAI = async (
    uri: string,
    name: string,
    mimeType: string
  ): Promise<string | null> => {
    try {
      const info = await FileSystem.getInfoAsync(uri, { size: true });
      const size = info.exists && "size" in info ? (info as any).size as number : 0;
      if (size === 0) {
        console.error("[AI UPLOAD] 0-byte file, aborting:", uri);
        return null;
      }
      console.log("[AI UPLOAD START]:", { sizeKB: Math.round(size / 1024), name, mimeType });
    } catch { /* non-fatal — proceed and let server validate */ }

    const formData = new FormData();
    formData.append("file", { uri, name, type: mimeType } as any);

    try {
      const res = await fetch(`${API_BASE}/api/chat/ai-upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        body: formData,
      });
      console.log("[AI UPLOAD RESPONSE STATUS]:", res.status);
      const rawText = await res.text().catch((e) => `[text() failed: ${(e as Error).message}]`);
      console.log("[AI UPLOAD RESPONSE RAW]:", rawText.slice(0, 400));

      let json: Record<string, any> = {};
      try { json = JSON.parse(rawText); } catch { /* already logged */ }

      if (!res.ok || !json.url) {
        console.error("[AI UPLOAD] Failed:", json.error ?? json.message ?? rawText.slice(0, 200));
        return null;
      }
      console.log("[AI UPLOAD] OK →", json.url.slice(0, 80), "...");
      return json.url as string;
    } catch (err) {
      console.error("[AI UPLOAD ERROR]:", (err as Error)?.message);
      return null;
    }
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

      // ── Size check via legacy FileSystem API ────────────────────────
      const readSizeKB = async (fileUri: string): Promise<number> => {
        try {
          const info = await FileSystem.getInfoAsync(fileUri, { size: true });
          if (info.exists && "size" in info && (info as any).size > 0) {
            return Math.round((info as any).size / 1024);
          }
        } catch { /* non-fatal */ }
        return 0;
      };

      let sizeKB = await readSizeKB(result.uri);

      // On some iOS versions the manipulator temp file isn't immediately
      // stat-able; give it one retry before treating it as 0-byte.
      if (sizeKB === 0) {
        await new Promise(r => setTimeout(r, 100));
        sizeKB = await readSizeKB(result.uri);
      }

      console.log(`[compress] ${durationMs}ms | ${sizeKB}KB | ${maxWidth}px | q${quality}`);

      // ── Guard: never return a 0-byte result ─────────────────────────
      if (sizeKB === 0) {
        console.warn("[compress] 0KB result after compress — falling back to original");
        return { uri, mimeType };
      }

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
          const reSizeKB = await readSizeKB(reResult.uri);
          console.log(`[compress] re-compress → ${reSizeKB}KB | q0.6`);
          if (reSizeKB > 0) {
            return { uri: reResult.uri, mimeType: "image/jpeg" };
          }
          console.warn("[compress] re-compress produced 0KB, using first-pass result");
        } catch {
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

    // Step 1 – upload image for AI (dedicated endpoint, no clinic_id required)
    const fileUrl = await uploadForAI(uploadUri, uploadName, uploadMimeType);
    if (!fileUrl) {
      console.warn("[AI] Upload failed — skipping AI for", photoType);
      return;
    }

    console.log("[AI] Uploaded:", fileUrl.slice(0, 80), "… → starting analysis");

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
        body: JSON.stringify({
          patientId,
          imageUrl: fileUrl,
          photoType,
          userLocation,
          preferredCountry: preferredDestination !== "nearby" ? preferredDestination : null,
        }),
        signal: aiController.signal,
      });
      clearTimeout(aiTimeout);

      // Always read raw text first so we can log it regardless of status
      const rawText = await aiRes.text().catch((e) => `[text() failed: ${(e as Error).message}]`);
      console.log(`[AI STATUS] ${aiRes.status} | photoType=${photoType}`);
      console.log("[AI RESPONSE RAW]:", rawText.slice(0, 800)); // cap at 800 chars

      let aiData: Record<string, any> = {};
      try {
        aiData = JSON.parse(rawText);
      } catch (parseErr) {
        console.error("[AI PARSE ERROR] Not valid JSON:", rawText.slice(0, 400));
      }

      if (!aiRes.ok) {
        console.warn("[AI] Endpoint error:", aiData.error ?? "(no error field)", "|", aiData.message ?? "", "| photoType:", photoType);
        if (aiData.error === "image_too_large") {
          Alert.alert(
            t("messages.uploadError") || "Hata",
            aiData.message || "Görsel çok büyük, lütfen tekrar çekin."
          );
        }
        // ai_timeout / other → original image still visible in chat
      } else {
        console.log("[AI] Analysis complete for:", photoType, "| ok:", aiData.ok, "| insights:", aiData.insights?.length ?? 0);

        // ── Fire smile simulation in background (non-blocking) ──────────
        // Starts 1.5 s after AI result so the bubble appears first.
        // Results flow through the _simCache bridge to AiResultBubble.
        const simCacheKey = fileUrl.split("?")[0];
        if (aiData.ok && fileUrl && !_simCache.has(simCacheKey) && !_simPending.has(simCacheKey) && !_simFailed.has(simCacheKey)) {
          _simPending.add(simCacheKey);
          _notifySimSubs(simCacheKey); // lets bubble show loading state immediately

          setTimeout(async () => {
            let succeeded = false;
            try {
              const simRes = await fetch(`${API_BASE}/api/chat/smile-simulation`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                  patientId,
                  imageUrl: fileUrl,
                  insights: (aiData.insights as string[] | undefined)?.slice(0, 2) ?? [],
                }),
              });
              const simData: Record<string, any> = await simRes.json().catch(() => ({}));
              console.log("[SIM RESPONSE] ok:", simData.ok,
                "| simulatedImageUrl:", simData.simulatedImageUrl ? simData.simulatedImageUrl.slice(0, 60) : null,
                "| variations:", simData.variations?.length ?? 0,
                "| fallback:", simData.fallback);
              if (simData.ok && simData.simulatedImageUrl) {
                const simUrl: string = simData.simulatedImageUrl;
                const simVars: SimVariation[] = Array.isArray(simData.variations) ? simData.variations : [];

                // Strip query string so the cache key survives URL re-signing
                const cacheKey = fileUrl.split("?")[0];
                _simCache.set(cacheKey, simUrl);
                if (simVars.length > 0) _simVariations.set(cacheKey, simVars);

                console.log("[SIM] Cache key:", cacheKey.slice(0, 80));
                console.log("FINAL SIM IMAGE:", simUrl);

                succeeded = true;
                const label = simData.fallback ? 'fallback(original)' : simData.simulationProvider;
                console.log("[SIM] Done:", label, "| variations:", simVars.length);
                if (simData.debugInfo?.length) {
                  console.warn("[SIM] Fail reasons:", JSON.stringify(simData.debugInfo));
                }
              } else {
                console.warn("[SIM] No result:", JSON.stringify({
                  status: simRes.status, ok: simData.ok,
                  error: simData.error, message: simData.message,
                }));
              }
            } catch (e) {
              console.warn("[SIM] Network error:", (e as Error)?.message);
            } finally {
              const cacheKey = fileUrl.split("?")[0];
              _simPending.delete(cacheKey);
              if (!succeeded) _simFailed.add(cacheKey);
              _notifySimSubs(cacheKey);
            }
          }, 1500);
        }
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

  // ── Camera capture for AI (used by auto-trigger and attach menu) ──────────

  const capturePhotoForAI = async () => {
    if (!await checkUploadConsent()) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("messages.permissionRequired"), t("messages.cameraPermission") || "Kamera erişimine izin verin.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      // No quality param — compressImage() handles all encoding
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      processPhotoWithAI(
        a.uri,
        a.fileName || `photo_${Date.now()}.jpg`,
        a.mimeType || "image/jpeg"
      );
    }
  };

  // Keep refs current so effects/bridges always call the latest versions
  pickImageRef.current    = capturePhotoForAI;
  processPhotoRef.current = processPhotoWithAI;

  // Auto-open camera when navigated from profile with openCamera=true (fires once)
  useEffect(() => {
    if (openCamera !== "true" || autoCameraFiredRef.current) return;
    autoCameraFiredRef.current = true;
    // Short delay lets the screen fully mount before the camera opens
    const timer = setTimeout(() => {
      pickImageRef.current?.();
      // Clear the param so back-navigation doesn't re-trigger
      navigation.setParams({ openCamera: undefined } as any);
    }, 600);
    return () => clearTimeout(timer);
  }, [openCamera, navigation]);

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
          else if (i === 2) pickImage();
          else if (i === 3) pickDocument();
          else if (i === 4) openGuidedCamera();
        }
      );
    } else {
      Alert.alert(t("messages.addFile"), t("messages.selectSource"), [
        { text: CAMERA_LABEL,  onPress: capturePhotoForAI },
        { text: GALLERY_LABEL, onPress: pickImage },
        { text: FILE_LABEL,    onPress: pickDocument },
        { text: INTRA_LABEL,   onPress: openGuidedCamera },
        { text: t("common.cancel"), style: "cancel" },
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

        {/* Destination selector — below header, always visible */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={ds.row}
          contentContainerStyle={ds.rowContent}
          alwaysBounceHorizontal={false}
        >
          {DESTINATION_OPTIONS.map(opt => {
            const active = preferredDestination === opt.id;
            return (
              <TouchableOpacity
                key={opt.id}
                style={[ds.chip, active && ds.chipActive]}
                onPress={() => selectDestination(opt.id)}
                activeOpacity={0.7}
              >
                <Text style={ds.chipFlag}>{opt.flag}</Text>
                <Text style={[ds.chipLabel, active && ds.chipLabelActive]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

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
            hasClinic ? (
              <View style={s.empty}>
                <Text style={s.emptyIcon}>💬</Text>
                <Text style={s.emptyTitle}>{t("chat.noMessages")}</Text>
                <Text style={s.emptySub}>{t("messages.emptySub")}</Text>
              </View>
            ) : null   // no clinic → full empty state shown below
          }
        />

        {/* No-clinic empty state — replaces input bar */}
        {!hasClinic && allMessages.length === 0 && (
          <View style={s.noClinicState}>
            <Text style={s.noClinicIcon}>🦷</Text>
            <Text style={s.noClinicTitle}>Henüz bir kliniğiniz yok</Text>
            <Text style={s.noClinicSub}>
              Diş fotoğrafınızı yükleyin, analiz edelim ve size uygun klinikleri önerelim
            </Text>
            <TouchableOpacity
              style={s.noClinicPrimary}
              activeOpacity={0.85}
              onPress={capturePhotoForAI}
            >
              <Text style={s.noClinicPrimaryTxt}>🦷 Diş Fotoğrafı Çek</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.noClinicSecondary}
              activeOpacity={0.85}
              onPress={() => router.push("/clinic-onboarding" as any)}
            >
              <Text style={s.noClinicSecondaryTxt}>🏥 Klinik Bul</Text>
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

        {/* Input bar — hidden when no clinic and no messages */}
        {(hasClinic || allMessages.length > 0) && <View style={s.inputBar}>
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
        </View>}
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

// ─── BeforeAfterSlider ───────────────────────────────────────────────────────
// Interactive drag-to-reveal comparison for original vs AI-simulated images.

function BeforeAfterSlider({
  beforeUrl,
  afterUrl,
}: {
  beforeUrl: string;
  afterUrl: string;
}) {
  const containerRef = useRef<View>(null);
  const containerX   = useRef(0);
  const containerW   = useRef(260); // fallback; updated by onLayout
  const dividerAnim  = useRef(new Animated.Value(0.5)).current; // 0–1 ratio
  const [ratio, setRatio] = useState(0.5);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: () => {},
      onPanResponderMove: (_, gs) => {
        const w   = containerW.current;
        const raw = gs.moveX - containerX.current;
        const clamped = Math.max(0.05, Math.min(0.95, raw / w));
        dividerAnim.setValue(clamped);
        setRatio(clamped);
      },
      onPanResponderRelease: () => {},
    })
  ).current;

  const SLIDER_HEIGHT = 220;

  return (
    <View style={bas.wrapper}>
      {/* Container that clips and compares the two images */}
      <View
        ref={containerRef}
        style={bas.container}
        onLayout={(e) => {
          containerW.current = e.nativeEvent.layout.width;
          containerRef.current?.measure((_fx, _fy, _w, _h, px) => {
            containerX.current = px;
          });
        }}
      >
        {/* After image — full width, underneath */}
        <Image
          source={{ uri: afterUrl }}
          style={[StyleSheet.absoluteFill, { borderRadius: bas.container.borderRadius }]}
          resizeMode="cover"
        />

        {/* Before image — clipped to left of divider */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: bas.container.borderRadius,
              overflow: "hidden",
              width: dividerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
        >
          <Image
            source={{ uri: beforeUrl }}
            style={{ width: containerW.current || 260, height: SLIDER_HEIGHT }}
            resizeMode="cover"
          />
        </Animated.View>

        {/* Divider line */}
        <Animated.View
          style={[
            bas.divider,
            {
              left: dividerAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ["0%", "100%"],
              }),
            },
          ]}
          {...panResponder.panHandlers}
        >
          <View style={bas.handle}>
            <Text style={bas.handleArrows}>‹ ›</Text>
          </View>
        </Animated.View>

        {/* Labels */}
        <View style={bas.labelLeft} pointerEvents="none">
          <Text style={bas.label}>Önce</Text>
        </View>
        <View style={bas.labelRight} pointerEvents="none">
          <Text style={bas.label}>Sonra</Text>
        </View>
      </View>

      {/* AI disclaimer for the simulation */}
      <Text style={bas.simDisclaimer}>
        Bu görsel AI tarafından oluşturulmuş bir önizlemedir.
      </Text>
    </View>
  );
}

const bas = StyleSheet.create({
  wrapper:   { gap: 6 },
  container: {
    width: "100%", height: 220,
    borderRadius: 12, overflow: "hidden",
    backgroundColor: "#e5e7eb",
  },
  divider: {
    position: "absolute",
    top: 0, bottom: 0,
    width: 3,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  handle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: "#fff",
    justifyContent: "center", alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 8,
  },
  handleArrows: { fontSize: 15, fontWeight: "700", color: "#374151", lineHeight: 18 },
  labelLeft: {
    position: "absolute", top: 8, left: 8,
  },
  labelRight: {
    position: "absolute", top: 8, right: 8,
  },
  label: {
    backgroundColor: "rgba(0,0,0,0.55)",
    color: "#fff", fontSize: 11, fontWeight: "700",
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
    textTransform: "uppercase", letterSpacing: 0.5,
    overflow: "hidden",
  },
  simDisclaimer: {
    fontSize: 10, color: "#9ca3af", fontStyle: "italic", textAlign: "center",
  },
});

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

// ── Main bubble ───────────────────────────────────────────────────────────────

function AiResultBubble({ msg }: { msg: Message }) {
  const result = msg.attachment?.aiResult;
  const { token, user } = useAuth();
  const router = useRouter();

  const imgUrl  = result?.originalImageUrl ?? "";
  const cacheKey = imgUrl.split("?")[0];   // stable key — survives URL re-signing

  // ── Simulation state — initialised from bridge cache or stored result ─
  const [simUrl, setSimUrl]             = useState<string | null>(
    _simCache.get(cacheKey) ?? result?.simulatedImageUrl ?? null
  );
  const [simVariations, setSimVariations] = useState<SimVariation[]>(
    _simVariations.get(cacheKey) ?? []
  );
  const [activeVariation, setActiveVariation] = useState<string>('balanced');
  const [simLoading, setSimLoading]     = useState(
    !_simCache.has(cacheKey) && _simPending.has(cacheKey)
  );
  const [simTriggered, setSimTriggered] = useState(
    _simCache.has(cacheKey) || !!result?.simulatedImageUrl || _simPending.has(cacheKey)
  );

  // ── Sim update: poll cache + subscription ─────────────────────────────
  useEffect(() => {
    const key = imgUrl.split("?")[0];
    console.log("[SIM] Bubble mounted | key:", key.slice(0, 80) || "(empty)");

    function applySimUrl(url: string, vars: SimVariation[]) {
      console.log("[SIM] Applying URL:", url.slice(0, 80));
      setSimUrl(url);
      if (vars.length > 0) setSimVariations(vars);
      setSimLoading(false);
      setSimTriggered(true);
    }

    // ── Poll cache every 1.5 s (reliable fallback when key mismatch) ──
    const poll = setInterval(() => {
      // 1. Try exact key match
      const exact = key ? _simCache.get(key) : null;
      if (exact) {
        applySimUrl(exact, _simVariations.get(key) ?? []);
        clearInterval(poll);
        return;
      }
      // 2. Full-scan: pick first non-Supabase URL (a real Replicate result)
      for (const [, v] of _simCache) {
        if (v && !v.includes('supabase.co')) {
          applySimUrl(v, []);
          clearInterval(poll);
          return;
        }
      }
      // 3. Show spinner if any prediction is in-flight
      if (_simPending.size > 0) { setSimLoading(true); setSimTriggered(true); }
    }, 1500);

    // ── Subscription for instant update when keys match ────────────────
    const unsub = subscribeSimUrl(key, () => {
      const url  = _simCache.get(key) ?? null;
      const vars = _simVariations.get(key) ?? [];
      if (url) { applySimUrl(url, vars); clearInterval(poll); }
      else if (_simFailed.has(key)) { setSimLoading(false); setSimTriggered(false); }
    });

    return () => { clearInterval(poll); unsub(); };
  }, [imgUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clinic picker ────────────────────────────────────────────────────
  const [showClinicModal, setShowClinicModal] = useState(false);

  // ── Manual simulation trigger (fallback / retry after failure) ──────
  const triggerSimulation = useCallback(async () => {
    if (simLoading || !imgUrl) return;
    // Clear failure mark so this manual attempt is allowed
    _simFailed.delete(imgUrl);
    setSimTriggered(true);
    setSimLoading(true);
    _simPending.add(imgUrl);
    try {
      const res = await fetch(`${API_BASE}/api/chat/smile-simulation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          patientId: user?.id,
          imageUrl: imgUrl,
          insights: result?.insights?.slice(0, 2) ?? [],
        }),
      });
      const data: Record<string, any> = await res.json().catch(() => ({}));
      if (data.ok && data.simulatedImageUrl) {
        const cacheKey = imgUrl.split("?")[0];
        _simCache.set(cacheKey, data.simulatedImageUrl);
        if (Array.isArray(data.variations) && data.variations.length > 0) {
          _simVariations.set(cacheKey, data.variations as SimVariation[]);
          setSimVariations(data.variations as SimVariation[]);
        }
        setSimUrl(data.simulatedImageUrl);
      } else {
        console.warn("[SIM manual] No result:", data.error ?? data.message ?? "unknown");
        _simFailed.add(imgUrl);
        setSimTriggered(false);
      }
    } catch {
      _simFailed.add(imgUrl);
      setSimTriggered(false);
    }
    finally {
      _simPending.delete(imgUrl);
      setSimLoading(false);
    }
  }, [simLoading, imgUrl, result, token, user]);

  if (!result) return null;

  const resolveUrl = (url: string) =>
    url.startsWith("http") ? url : `${API_BASE}${url}`;

  // If only the fallback variation is present, treat it as no simulation (hide slider tabs)
  const isFallbackOnly = simVariations.length === 1 && simVariations[0].id === 'original';

  // Active variation URL: prefer the selected variation; fall back to primary simUrl
  const activeSimUrl = (!isFallbackOnly && simVariations.length > 0)
    ? (simVariations.find(v => v.id === activeVariation) ?? simVariations[0])?.url ?? simUrl
    : simUrl;

  const hasSimulation = !!activeSimUrl && activeSimUrl !== (result.originalImageUrl ?? "");
  if (simUrl) console.log("[SIM RENDER] simUrl:", simUrl.slice(0, 60), "| activeSimUrl:", activeSimUrl?.slice(0, 60), "| hasSimulation:", hasSimulation);
  const conf = result.confidence ?? "medium";
  const visibleInsights = (result.insights ?? []).slice(0, 3);

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
      // No pre-loaded clinic list — fill text input for current clinic
      triggerClinicContact(prefillMessage);
    }
  };

  const handleSelectClinic = (_clinic: ClinicRecommendation) => {
    setShowClinicModal(false);
    triggerClinicContact(prefillMessage);
  };

  return (
    <View style={[s.bubbleWrap, s.bubbleLeft]}>
      <Text style={s.bubbleFrom}>AI</Text>
      <View style={[s.bubble, s.bubbleClinic, ai.card]}>

        {/* ── Header ── */}
        <View style={ai.header}>
          <Text style={ai.headerIcon}>✨</Text>
          <Text style={ai.headerTitle}>Diş Analizi</Text>
          {result.confidence && (
            <View style={[ai.confidenceBadge, { backgroundColor: CONFIDENCE_COLOR[conf] + "22" }]}>
              <Text style={[ai.confidenceText, { color: CONFIDENCE_COLOR[conf] }]}>
                {conf === "high" ? "Yüksek güven" : conf === "medium" ? "Orta güven" : "Düşük güven"}
              </Text>
            </View>
          )}
        </View>

        {/* ── 1. Simulation: slider + variation tabs / loading / image + CTA ── */}
        {hasSimulation ? (
          <View>
            {/* Variation pill tabs — only show when we have real AI variations */}
            {simVariations.length > 1 && !isFallbackOnly && (
              <View style={ai.varTabRow}>
                {simVariations.map(v => (
                  <TouchableOpacity
                    key={v.id}
                    style={[ai.varTab, activeVariation === v.id && ai.varTabActive]}
                    onPress={() => setActiveVariation(v.id)}
                    activeOpacity={0.75}
                  >
                    <Text style={[ai.varTabText, activeVariation === v.id && ai.varTabTextActive]}>
                      {v.id === 'balanced' ? `${v.label} ⭐` : v.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <BeforeAfterSlider
              beforeUrl={resolveUrl(result.originalImageUrl!)}
              afterUrl={resolveUrl(activeSimUrl!)}
            />
          </View>
        ) : simLoading ? (
          <View style={ai.simLoadingBox}>
            <ActivityIndicator size="small" color="#6366f1" />
            <Text style={ai.simLoadingText}>3 gülüş varyasyonu oluşturuluyor…</Text>
          </View>
        ) : result.originalImageUrl ? (
          <View>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => Linking.openURL(resolveUrl(result.originalImageUrl!))}
            >
              <Image
                source={{ uri: resolveUrl(result.originalImageUrl!) }}
                style={ai.image}
                resizeMode="cover"
              />
            </TouchableOpacity>
            {!simTriggered && (
              <TouchableOpacity
                style={ai.simCtaBtn}
                onPress={triggerSimulation}
                activeOpacity={0.8}
              >
                <Text style={ai.simCtaText}>👁 Gülüşümü nasıl görünecek?</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* ── 2. Insights (max 3) ── */}
        {visibleInsights.length > 0 && (
          <View style={ai.insightsBlock}>
            {visibleInsights.map((insight, i) => (
              <View key={i} style={ai.insightRow}>
                <Text style={ai.bullet}>•</Text>
                <Text style={ai.insightText}>{insight}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── 3. Key message ── */}
        <View style={ai.keyMsgBox}>
          <Text style={ai.keyMsgText}>
            Bu durum genellikle basit diş tedavileriyle iyileştirilebilir.
          </Text>
        </View>

        {/* ── 4. Primary CTA ── */}
        <TouchableOpacity
          style={ai.primaryBtn}
          onPress={handleSendToClinic}
          activeOpacity={0.85}
        >
          <Text style={ai.primaryBtnText}>Bu sonucu bir kliniğe gönder</Text>
        </TouchableOpacity>

        {/* ── 5. Secondary CTA ── */}
        <TouchableOpacity
          style={ai.secondaryBtn}
          onPress={() => router.push("/clinic-onboarding" as any)}
          activeOpacity={0.7}
        >
          <Text style={ai.secondaryBtnText}>Yakındaki klinikleri gör</Text>
        </TouchableOpacity>

        {/* ── Disclaimer ── */}
        <Text style={ai.disclaimerInline}>{result.disclaimer}</Text>

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

  // Key message block (conversion hook)
  keyMsgBox: {
    backgroundColor: "#f5f3ff", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 2,
  },
  keyMsgText: { fontSize: 13, color: "#4338ca", lineHeight: 20, fontWeight: "600" },

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

  // Smile simulation UI
  simLoadingBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#f5f3ff", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, marginVertical: 4,
  },
  simLoadingText: { fontSize: 13, color: "#6366f1", flex: 1 },
  simCtaBtn: {
    backgroundColor: "#6366f1", borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 14,
    alignItems: "center", marginTop: 8,
  },
  simCtaText: { color: "#fff", fontSize: 14, fontWeight: "600" },

  // Variation tabs
  varTabRow: {
    flexDirection: "row", gap: 6, marginBottom: 8,
    flexWrap: "wrap",
  },
  varTab: {
    paddingVertical: 5, paddingHorizontal: 12,
    borderRadius: 20, borderWidth: 1.5,
    borderColor: "#d1d5db", backgroundColor: "#f9fafb",
  },
  varTabActive: {
    borderColor: "#6366f1", backgroundColor: "#eef2ff",
  },
  varTabText: { fontSize: 13, color: "#6b7280", fontWeight: "500" },
  varTabTextActive: { color: "#4f46e5", fontWeight: "700" },
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

// ─── Destination selector styles ──────────────────────────────────────────────

const ds = StyleSheet.create({
  row: {
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 28,
    borderWidth: 2,
    borderColor: "#d1d5db",
    backgroundColor: "#f3f4f6",
    minHeight: 48,
  },
  chipActive: {
    backgroundColor: "#dbeafe",
    borderColor: "#2563eb",
  },
  chipFlag: { fontSize: 18, lineHeight: 22 },
  chipLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 20,
  },
  chipLabelActive: {
    color: "#1d4ed8",
  },
});
