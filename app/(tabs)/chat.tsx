import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { Socket } from "socket.io-client";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  type ListRenderItemInfo,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { safeSetItem } from "../../lib/asyncStorageSafe";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";
import { playInAppNewMessageSoundDebouncedForThread } from "../../lib/playInAppMessageSound";
import { getMessageSoundPreference } from "../../lib/messageSoundPreference";
import { useRoleBasedAPI } from "../../lib/role-based-api";
import { useLanguage } from "../../lib/language-context";
import { useSelectedChatClinic } from "../../lib/useSelectedChatClinic";
import {
  subscribePrimaryChatRealtime,
  THREAD_ID_UUID_RE,
  waitOnceSocketConnected,
} from "../../lib/chatRealtime";
import { resetAppIconBadgeCount } from "../../lib/chatAckOpen";


type Attachment = {
  name: string;
  size: number;
  url: string;
  mimeType?: string;
  fileType?: string;
};

type ChatMessage = {
  id: string;
  from: "PATIENT" | "CLINIC" | "patient" | "admin";
  text: string;
  type: "text" | "image" | "pdf";
  attachment?: Attachment;
  createdAt: number;
  thread_id?: string;
  pending?: boolean;
};

/** Socket.IO payload → doctor chat row (aligned with GET) */
function socketLegacyToDoctorChatMessage(raw: Record<string, unknown>): ChatMessage | null {
  const id = String(raw.id || "").trim();
  if (!id) return null;
  const fromUp = String(raw.from || "").toUpperCase();
  const from: ChatMessage["from"] =
    fromUp === "CLINIC" || fromUp === "ADMIN" ? "CLINIC" : "PATIENT";
  let createdAt = Date.now();
  if (typeof raw.createdAt === "number") createdAt = raw.createdAt as number;
  const attRaw = raw.attachment;
  let attachment: ChatMessage["attachment"];
  if (attRaw && typeof attRaw === "object") {
    const a = attRaw as Record<string, unknown>;
    attachment = {
      name: String(a.name || ""),
      size: typeof a.size === "number" ? a.size : Number(a.size) || 0,
      url: String(a.url || ""),
      mimeType: typeof a.mimeType === "string" ? a.mimeType : String(a.mime || ""),
      fileType:
        typeof a.fileType === "string"
          ? a.fileType
          : String(a.mimeType || "").startsWith("image/")
            ? "image"
            : "pdf",
    };
  }
  const tidRaw = raw.thread_id ?? raw.threadId;
  const thread_id =
    tidRaw != null && String(tidRaw).trim() !== "" ? String(tidRaw).trim() : undefined;
  return {
    id,
    from,
    text: String(raw.text ?? ""),
    type:
      raw.type === "image" || raw.type === "pdf" || raw.type === "text"
        ? raw.type
        : "text",
    attachment,
    createdAt,
    ...(thread_id ? { thread_id } : {}),
  };
}

export default function ChatScreen() {
  const router = useRouter();
  const { user, isAuthReady } = useAuth();
  const { fetchWithRole } = useRoleBasedAPI();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{
    patientId?: string;
    clinicId?: string;
    clinic_id?: string;
    clinicCode?: string;
  }>();
  const userPatientId = params.patientId as string || (user as any)?.patientId || "";
  const { selectedClinic, ready: selectedClinicReady } = useSelectedChatClinic(user, {
    clinicId: params.clinicId,
    clinic_id: params.clinic_id,
    clinicCode: params.clinicCode,
  });
  
  const [patientId, setPatientId] = useState<string>(userPatientId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Ref for TextInput to manage cursor and focus
  const inputRef = useRef<TextInput>(null);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<FlatList<ChatMessage>>(null);
  const isRedirectingRef = useRef(false);
  const isSendingMessageRef = useRef(false);
  const seenServerMessageIdsRef = useRef<Set<string>>(new Set());
  const chatInboundIdsPrimedRef = useRef(false);
  const chatSocketRef = useRef<Socket | null>(null);
  const [chatRealtimeConnected, setChatRealtimeConnected] = useState(false);
  /** Backend GET .../messages → leadAssignment.threadId (patient_chat_threads row) */
  const [leadThreadId, setLeadThreadId] = useState<string | null>(null);

  const playInboundPatientAlert = useCallback(async () => {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      /* ignore */
    }
    const cid = String(selectedClinic?.id || "").trim();
    playInAppNewMessageSoundDebouncedForThread(`doc_chat:${patientId}:${cid}`, 3000);
  }, [patientId, selectedClinic?.id]);
  
  // Auto-focus input when component mounts or when messages load
  useEffect(() => {
    if (!loading && inputRef.current) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 500);
    }
  }, [loading]);
  
  // Update patientId when userPatientId changes
  useEffect(() => {
    if (userPatientId) {
      setPatientId(userPatientId);
    }
  }, [userPatientId]);

  useEffect(() => {
    seenServerMessageIdsRef.current.clear();
    chatInboundIdsPrimedRef.current = false;
    setLeadThreadId(null);
  }, [patientId]);

  useEffect(() => {
    if (!isAuthReady || !user?.token) return;

    const loadPatientId = async () => {
      if (patientId) return;
      try {
        const res = await fetchWithRole("/me");
        if (res.ok) {
          const data = await res.json();
          if (data?.patientId) {
            setPatientId(data.patientId);
          }
        }
      } catch (error) {
        console.error("[CHAT] Error loading patientId:", error);
      }
    };

    loadPatientId();
  }, [isAuthReady, user?.token, patientId, fetchWithRole]);

  const fetchMessages = useCallback(async () => {
    if (!user?.token || !patientId) return;

    try {
      const cidForLead = String(selectedClinic?.id ?? "").trim();
      const qp = new URLSearchParams();
      if (THREAD_ID_UUID_RE.test(cidForLead)) {
        qp.set("clinic_id", cidForLead);
        qp.set("clinicId", cidForLead);
      }
      const qs = qp.toString() ? `?${qp.toString()}` : "";

      const messagesRel =
        user?.role === "DOCTOR"
          ? `/patient/${encodeURIComponent(patientId)}/messages${qs}`
          : `/${encodeURIComponent(patientId)}/messages${qs}`;

      if (__DEV__ && user?.role === "DOCTOR") {
        console.log("[CHAT doctor] GET (must be /api/doctor/patient/…/messages for leadAssignment.threadId)", {
          messagesRel,
          clinic_id: THREAD_ID_UUID_RE.test(cidForLead) ? cidForLead : "(from JWT/db)",
        });
      }

      const res = await fetchWithRole(messagesRel, {
        headers: { Authorization: `Bearer ${user.token}` },
        cache: "no-store",
      });

      if (res.status === 403 || res.status === 401) {
        setMessages((prev) => (prev.length === 0 ? prev : []));
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setMessages((prev) => (prev.length === 0 ? prev : []));
        setLoading(false);
        return;
      }

      const json = await res.json();
      const laRaw = json.leadAssignment;
      const tid =
        laRaw && typeof laRaw === "object" && laRaw.threadId != null
          ? String((laRaw as { threadId?: string }).threadId).trim()
          : "";
      setLeadThreadId(tid || null);

      if (__DEV__ && user?.role === "DOCTOR") {
        console.log(
          "[CHAT doctor] leadAssignment.threadId (patient app must subscribe to SAME uuid for realtime)",
          tid || "(missing — polling only / wrong GET path)",
        );
      }

      const formattedMessages: ChatMessage[] = (json.messages || []).map((msg: any) => {
        const tid =
          msg.thread_id != null
            ? String(msg.thread_id).trim()
            : msg.threadId != null
              ? String(msg.threadId).trim()
              : undefined;
        return {
          id: msg.id,
          from: msg.from === "CLINIC" || msg.from === "admin" ? "CLINIC" : "PATIENT",
          text: msg.text || "",
          type: msg.type || "text",
          attachment: msg.attachment
            ? {
                name: msg.attachment.name || t("chat.file"),
                size: msg.attachment.size || 0,
                url: msg.attachment.url,
                mimeType: msg.attachment.mimeType || msg.attachment.mime,
                fileType:
                  msg.attachment.fileType ||
                  (msg.attachment.mimeType?.startsWith("image/") ? "image" : "pdf"),
              }
            : undefined,
          createdAt: msg.createdAt || Date.now(),
          ...(tid ? { thread_id: tid } : {}),
        };
      });

      const soundPref = await getMessageSoundPreference();
      const inboundPatient = (m: ChatMessage) =>
        String(m.from).toUpperCase() === "PATIENT" || String(m.from).toLowerCase() === "patient";

      if (!chatInboundIdsPrimedRef.current) {
        for (const m of formattedMessages) {
          const mid = String(m.id || "").trim();
          if (mid) seenServerMessageIdsRef.current.add(mid);
        }
        chatInboundIdsPrimedRef.current = true;
      } else if (soundPref && !isSendingMessageRef.current) {
        let hasNewInbound = false;
        for (const m of formattedMessages) {
          const mid = String(m.id || "").trim();
          if (!mid) continue;
          const wasSeen = seenServerMessageIdsRef.current.has(mid);
          if (!wasSeen && inboundPatient(m)) {
            hasNewInbound = true;
          }
          seenServerMessageIdsRef.current.add(mid);
        }
        if (hasNewInbound) {
          void playInboundPatientAlert();
        }
      } else {
        for (const m of formattedMessages) {
          const mid = String(m.id || "").trim();
          if (mid) seenServerMessageIdsRef.current.add(mid);
        }
      }

      if (isSendingMessageRef.current) {
        isSendingMessageRef.current = false;
      }

      const sortedMsgs = [...formattedMessages].sort(
        (a, b) => a.createdAt - b.createdAt,
      );
      setMessages(sortedMsgs.slice(-50));
      setLoading(false);
    } catch (error) {
      console.error("Error fetching messages:", error);
      setLoading(false);
    }
  }, [
    user?.token,
    user?.role,
    patientId,
    selectedClinic?.id,
    fetchWithRole,
    t,
    playInboundPatientAlert,
  ]);

  const resolvedChatThreadId = useMemo(() => {
    const la = leadThreadId != null ? String(leadThreadId).trim() : "";
    const firstWithThread = messages.find(
      (m) => (m.thread_id ?? "").trim() !== "",
    );
    const fromMsg =
      firstWithThread?.thread_id != null
        ? String(firstWithThread.thread_id).trim()
        : "";
    return la || fromMsg;
  }, [leadThreadId, messages]);

  const chatRouteKeyRef = useRef("");
  useEffect(() => {
    const k = `${patientId}|${String(selectedClinic?.id ?? "").trim()}`;
    if (chatRouteKeyRef.current === k) return;
    chatRouteKeyRef.current = k;
    seenServerMessageIdsRef.current.clear();
    chatInboundIdsPrimedRef.current = false;
    setMessages([]);
    setLeadThreadId(null);
  }, [patientId, selectedClinic?.id]);

  // Check patient status on mount only - status check removed to prevent redirects
  // İlk yüklemede tek HTTP çağrısı; sonrasında sadece socket ile büyüt.
  useEffect(() => {
    if (!isAuthReady) return;
    
    if (!user?.token || !patientId) {
      setLoading(false);
      return;
    }

    // Reset redirect flag
    isRedirectingRef.current = false;

    void fetchMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchMessages güncellenince tekrar çekme
  }, [isAuthReady, user?.token, patientId, selectedClinic?.id]);

  useFocusEffect(
    useCallback(() => {
      if (!patientId) return;
      void resetAppIconBadgeCount();
      void postDoctorChatAckOpen(user?.token);
      
      const updateLastSeen = async () => {
        await safeSetItem(`chat_last_seen_${patientId}`, String(Date.now()));
      };
      
      void updateLastSeen();
    }, [patientId, user?.token])
  );

  /** Realtime — after messages load + thread UUID (leadAssignment or message rows). */
  useEffect(() => {
    if (!user?.token?.trim()) {
      setChatRealtimeConnected(false);
      return () => {};
    }

    if (loading) {
      return () => {};
    }

    const tid = resolvedChatThreadId.trim();
    if (!tid) {
      console.log("NO THREAD ID YET");
      setChatRealtimeConnected(false);
      return () => {};
    }

    console.log("START REALTIME SOCKET:", tid);
    if (__DEV__ && user?.role === "DOCTOR") {
      console.log(
        "[CHAT doctor] realtime: join_chat(threadId)=",
        tid,
        "fires from socket.io connect handler (ROOM_SIZE≥2 once patient also joined same thread)",
      );
    }
    const { unsubscribe, socket } = subscribePrimaryChatRealtime({
      token: user.token,
      threadId: tid,
      onNewMessage: (legacy) => {
        const mapped = socketLegacyToDoctorChatMessage(legacy);
        if (!mapped) return;
        setMessages((prev) => {
          if (prev.find((m) => m.id === mapped.id)) return prev;
          const withoutPendingDup = prev.filter(
            (m) =>
              !(
                m.pending &&
                String(m.from).toUpperCase() === "CLINIC" &&
                m.text === mapped.text
              ),
          );
          return [...withoutPendingDup, mapped]
            .sort((a, b) => a.createdAt - b.createdAt)
            .slice(-50);
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
  }, [user?.token, user?.role, loading, resolvedChatThreadId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);
    }
  }, [messages.length]);

  async function sendMessage() {
    console.log("[CHAT] sendMessage called", { text: text.trim(), hasToken: !!user?.token, patientId });
    if (!text.trim() || !user?.token || !patientId) {
      console.log("[CHAT] Cannot send message - missing text, token, or patientId");
      return;
    }

    // Set flag to prevent notification sound when user sends a message
    isSendingMessageRef.current = true;

    const trimmed = text.trim();
    const optimisticId = `tmp-${Date.now()}`;
    setMessages((prev) =>
      [
        ...prev,
        {
          id: optimisticId,
          from: "CLINIC",
          text: trimmed,
          type: "text" as const,
          createdAt: Date.now(),
          pending: true,
        },
      ]
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(-50),
    );
    setText("");

    try {
      if (!selectedClinicReady) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        isSendingMessageRef.current = false;
        setText(trimmed);
        return;
      }
      if (!selectedClinic?.id?.trim()) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        isSendingMessageRef.current = false;
        setText(trimmed);
        Alert.alert(
          t("common.error") || "Error",
          "Please select a clinic first"
        );
        return;
      }
      const u = user as { clinicId?: string };
      const cid = String(selectedClinic.id).trim();
      const ccode = selectedClinic.clinic_code?.trim() || "";
      const payload: Record<string, string> = {
        text: trimmed,
        type: "text",
      };
      payload.clinic_id = cid;
      payload.clinicId = cid;
      if (ccode) {
        payload.clinic_code = ccode;
        payload.clinicCode = ccode;
      }
      console.log("SEND MESSAGE PAYLOAD", {
        message: payload.text,
        clinic_id: selectedClinic?.id ?? null,
        userClinic: u?.clinicId ?? null,
      });
      const sock = chatSocketRef.current;
      if (sock && !sock.connected) {
        await waitOnceSocketConnected(sock);
      }

      let res: Response;
      if (user.role === "DOCTOR") {
        const replyUrl = `${API_BASE.replace(/\/+$/, "")}/api/messages/${encodeURIComponent(patientId)}/reply`;
        if (__DEV__) {
          console.log("[CHAT doctor] POST clinic reply →", replyUrl);
        }
        res = await fetch(replyUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text: trimmed }),
        });
      } else {
        res = await fetchWithRole(`/${encodeURIComponent(patientId)}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const txt = await res.text();
        console.error("[CHAT] send failed:", res.status, txt.slice(0, 300));
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        isSendingMessageRef.current = false;
        setText(trimmed);
        Alert.alert(t("common.error"), t("chat.sendError"));
        return;
      }

      // Focus back to input after sending message
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      isSendingMessageRef.current = false;
      setText(trimmed);
      Alert.alert(t("common.error"), t("chat.sendError"));
    }
  }

  async function pickAndUploadImage() {
    console.log("[CHAT] pickAndUploadImage called");
    if (!user?.token || !patientId) {
      console.log("[CHAT] Missing token or patientId");
      return;
    }

    try {
      // Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("İzin Gerekli", "Fotoğraf seçmek için izin gerekiyor.");
        return;
      }

      // Pick image with specific formats
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsMultipleSelection: false,
        quality: 0.85,
        exif: false, // Disable EXIF data
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const fileSize = asset.fileSize || 0;
        const maxSize = 10 * 1024 * 1024; // 10MB
        
        if (fileSize > maxSize) {
          Alert.alert("Dosya Çok Büyük", "Fotoğraf boyutu 10MB'dan küçük olmalıdır. Desteklenen formatlar: JPG, PNG, HEIC – Max 10MB");
          return;
        }

        // Validate MIME type
        const mimeType = asset.mimeType || "image/jpeg";
        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/heic", "image/heif"];
        if (!allowedTypes.includes(mimeType)) {
          Alert.alert(t("chat.formatNotSupported"), t("chat.formatNotSupportedMessage"));
          return;
        }

        // Validate file extension
        const fileName = asset.fileName || "image.jpg";
        const fileExt = fileName.toLowerCase().split('.').pop() || '';
        const allowedExts = ["jpg", "jpeg", "png", "heic", "heif"];
        if (!allowedExts.includes(fileExt)) {
          Alert.alert(t("chat.formatNotSupported"), t("chat.formatNotSupportedMessage"));
          return;
        }

        await uploadImage(asset.uri, mimeType, fileName, fileSize);
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert(t("chat.error"), t("chat.imageSelectionFailed"));
    }
  }

  async function pickAndUploadDocument() {
    console.log("[CHAT] pickAndUploadDocument called");
    if (!user?.token || !patientId) {
      console.log("[CHAT] Missing token or patientId");
      return;
    }

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/pdf",
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "text/plain",
          "application/vnd.ms-excel",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/zip",
          "application/x-zip-compressed",
        ],
        multiple: false,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await uploadFile(asset.uri, asset.mimeType || "", asset.name, asset.size || 0);
      }
    } catch (error) {
      console.error("Error picking document:", error);
      Alert.alert(t("chat.error"), t("chat.fileSelectionFailed"));
    }
  }

  async function uploadImage(uri: string, mimeType: string, fileName: string, fileSize: number) {
    if (!user?.token || !patientId) return;
    if (!selectedClinicReady) return;
    if (!selectedClinic?.id?.trim()) {
      Alert.alert(
        t("common.error") || "Error",
        "Please select a clinic first"
      );
      return;
    }

    setUploading(true);

    // Create AbortController for timeout
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      controller.abort();
    }, 60000); // 60 second timeout for image uploads

    try {
      // Create FormData - React Native format
      const formData = new FormData();
      formData.append("files", {
        uri,
        type: mimeType,
        name: fileName,
      } as any);
      formData.append("patientId", patientId);
      formData.append("isImage", "true"); // Flag to indicate image upload
      const scImg = selectedClinic;
      if (!scImg?.id?.trim()) return;
      const id = String(scImg.id).trim();
      formData.append("clinicId", id);
      formData.append("clinic_id", id);
      if (scImg.clinic_code?.trim()) {
        const code = String(scImg.clinic_code).trim();
        formData.append("clinicCode", code);
        formData.append("clinic_code", code);
      }
      console.log("SEND MESSAGE PAYLOAD (upload image)", {
        clinic_id: selectedClinic?.id ?? null,
        userClinic: (user as { clinicId?: string })?.clinicId ?? null,
      });

      const uploadRes = await fetch(`${API_BASE}/api/chat/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          // Don't set Content-Type, let React Native set it automatically for FormData
        },
        body: formData,
        signal: controller.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!uploadRes.ok) {
        const errorData = await uploadRes.json().catch(() => ({}));
        
        if (uploadRes.status === 403 || uploadRes.status === 401) {
          const errorMsg = errorData.error || errorData.message || "Yetkisiz erişim";
          console.error("[CHAT] Upload auth error:", errorMsg, errorData);
          
          if (errorData.error === "bad_token" || errorData.error === "missing_token") {
            Alert.alert(
              "Oturum Hatası", 
              "Oturum süreniz dolmuş olabilir. Lütfen uygulamadan çıkıp tekrar giriş yapın.",
              [
                {
                  text: "Tamam",
                  onPress: () => {
                    if (!isRedirectingRef.current) {
                      isRedirectingRef.current = true;
                      setTimeout(() => {
                        router.replace("/login");
                      }, 100);
                    }
                  }
                }
              ]
            );
            return;
          }
          
          if (!isRedirectingRef.current) {
            isRedirectingRef.current = true;
            router.push("/waiting-approval");
          }
          return;
        }

        if (uploadRes.status === 500) {
          const errorMsg = errorData.message || errorData.details || "Sunucu hatası oluştu";
          console.error("[CHAT] Upload 500 error:", errorData);
          Alert.alert("Yükleme Hatası", `${errorMsg}. Lütfen daha sonra tekrar deneyin.`);
          return;
        }

        if (uploadRes.status === 408 || uploadRes.status === 504) {
          Alert.alert(t("chat.timeout"), t("chat.uploadTimeout"));
          return;
        }

        const errorMsg = errorData.message || errorData.error || t("chat.uploadFailed");
        console.error("[CHAT] Upload error:", errorMsg, errorData);
        Alert.alert(`❌ ${t("chat.fileSendFailed")}`, errorMsg);
        return;
      }

      const result = await uploadRes.json();
      Alert.alert(t("chat.success"), result.message || t("chat.photoUploaded"));
    } catch (error: any) {
      // Clean up timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (error.name === "AbortError") {
        Alert.alert(t("chat.timeout"), t("chat.uploadTimeout"));
      } else if (error.message?.includes("Network request failed") || error.message?.includes("fetch")) {
        Alert.alert(t("chat.connectionError"), t("chat.checkConnection"));
      } else {
        console.error("Error uploading image:", error);
        Alert.alert(t("chat.error"), error.message || t("chat.uploadFailed"));
      }
    } finally {
      setUploading(false);
    }
  }

  async function uploadFile(uri: string, mimeType: string, fileName: string, fileSize: number) {
    if (!user?.token || !patientId) return;

    const safeName = fileName || "";
    const fileExt = safeName.includes(".") ? safeName.split(".").pop()!.toLowerCase() : "";
    const extWithDot = fileExt ? `.${fileExt}` : "";
    const forbiddenExts = [".rar", ".exe", ".apk", ".dmg", ".bat", ".sh"];
    const allowedDocMimes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
      "application/x-zip-compressed",
    ];
    const allowedDocExts = [".pdf", ".doc", ".docx", ".txt", ".xls", ".xlsx", ".zip"];

    if (forbiddenExts.includes(extWithDot)) {
      Alert.alert("Geçersiz Dosya Tipi", `Bu dosya tipi desteklenmiyor: ${extWithDot}. RAR ve çalıştırılabilir dosyalar yasaktır.`);
      return;
    }

    if (!mimeType) {
      Alert.alert("Geçersiz Dosya Tipi", "Dosya tipi belirlenemedi. Lütfen farklı bir dosya deneyin.");
      return;
    }

    if (!allowedDocMimes.includes(mimeType) || !allowedDocExts.includes(extWithDot)) {
      Alert.alert("Geçersiz Dosya Tipi", "Desteklenen formatlar: PDF, DOC/DOCX, TXT, XLS/XLSX, ZIP");
      return;
    }

    const isZip = extWithDot === ".zip" || mimeType === "application/zip" || mimeType === "application/x-zip-compressed";
    if (isZip && fileSize > 50 * 1024 * 1024) {
      Alert.alert("Dosya Çok Büyük", "ZIP dosyası 50MB'dan küçük olmalıdır.");
      return;
    }
    if (!isZip && fileSize > 20 * 1024 * 1024) {
      Alert.alert("Dosya Çok Büyük", "Doküman 20MB'dan küçük olmalıdır.");
      return;
    }

    if (!selectedClinicReady) return;
    if (!selectedClinic?.id?.trim()) {
      Alert.alert(
        t("common.error") || "Error",
        "Please select a clinic first"
      );
      return;
    }

    setUploading(true);

    // Create AbortController for timeout
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      controller.abort();
    }, 60000); // 60 second timeout for file uploads

    try {
      // Create FormData - React Native format
      const formData = new FormData();
      formData.append("files", {
        uri,
        type: mimeType,
        name: fileName,
      } as any);
      formData.append("patientId", patientId);
      const id2 = String(selectedClinic.id).trim();
      formData.append("clinicId", id2);
      formData.append("clinic_id", id2);
      if (selectedClinic.clinic_code?.trim()) {
        const code2 = String(selectedClinic.clinic_code).trim();
        formData.append("clinicCode", code2);
        formData.append("clinic_code", code2);
      }
      console.log("SEND MESSAGE PAYLOAD (upload file)", {
        clinic_id: selectedClinic?.id ?? null,
        userClinic: (user as { clinicId?: string })?.clinicId ?? null,
      });

      const uploadRes = await fetch(`${API_BASE}/api/chat/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          // Don't set Content-Type, let React Native set it automatically for FormData
        },
        body: formData,
        signal: controller.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!uploadRes.ok) {
        const errorData = await uploadRes.json().catch(() => ({}));
        
        if (uploadRes.status === 403) {
          if (errorData.error === "CHAT_LOCKED" || errorData.error === "access_denied") {
            Alert.alert(t("chat.chatLocked"), t("chat.chatLockedMessage"));
            if (!isRedirectingRef.current) {
              isRedirectingRef.current = true;
              router.push("/waiting-approval");
            }
            return;
          }
        }
        
        if (uploadRes.status === 401) {
          const errorMsg = errorData.error || errorData.message || "Yetkisiz erişim";
          console.error("[CHAT] Upload auth error:", errorMsg, errorData);
          
          if (errorData.error === "bad_token" || errorData.error === "missing_token") {
            Alert.alert(
              "Oturum Hatası", 
              "Oturum süreniz dolmuş olabilir. Lütfen uygulamadan çıkıp tekrar giriş yapın.",
              [
                {
                  text: "Tamam",
                  onPress: () => {
                    if (!isRedirectingRef.current) {
                      isRedirectingRef.current = true;
                      setTimeout(() => {
                        router.replace("/login");
                      }, 100);
                    }
                  }
                }
              ]
            );
            return;
          }
          
          Alert.alert(t("chat.sessionError"), t("chat.sessionExpired"));
          if (!isRedirectingRef.current) {
            isRedirectingRef.current = true;
            router.push("/waiting-approval");
          }
          return;
        }
        
        if (errorData.error === "INVALID_FILE_TYPE") {
          Alert.alert("Geçersiz Dosya Tipi", errorData.message || "Bu dosya tipi desteklenmiyor.");
          return;
        }
        
        if (errorData.error === "FILE_TOO_LARGE") {
          Alert.alert("Dosya Çok Büyük", errorData.message || "Dosya boyutu limitini aşıyor.");
          return;
        }
        
        if (uploadRes.status === 500) {
          const errorMsg = errorData.message || errorData.details || "Sunucu hatası oluştu";
          console.error("[CHAT] Upload 500 error:", errorData);
          Alert.alert("Yükleme Hatası", `${errorMsg}. Lütfen daha sonra tekrar deneyin.`);
          return;
        }

        const errorMsg = errorData.message || errorData.error || errorData.details || `Upload failed: ${uploadRes.status}`;
        console.error("[CHAT] Upload error:", errorMsg, errorData);
        Alert.alert(`❌ ${t("chat.fileSendFailed")}`, errorMsg);
        return;
      }

      const result = await uploadRes.json();
      Alert.alert(t("chat.success"), result.message || t("chat.photoUploaded"));
    } catch (error: any) {
      // Clean up timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      
      // Abort pending request
      if (controller && !controller.signal.aborted) {
        controller.abort();
      }
      
      // Handle abort/timeout errors
      if (error?.name === "AbortError" || error?.message?.includes("aborted")) {
        console.error("[CHAT] Upload timeout:", error);
        Alert.alert(t("chat.timeout"), t("chat.uploadTimeout"));
        return;
      }
      
      // Handle network errors
      if (error?.message?.includes("Network request failed") || error?.message?.includes("timeout")) {
        console.error("[CHAT] Upload network error:", error);
        Alert.alert(t("chat.connectionError"), t("chat.checkConnection"));
        return;
      }
      
      console.error("Error uploading file:", error);
      Alert.alert(t("chat.error"), error.message || t("chat.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }, []);

  const getAttachmentIcon = useCallback((att?: Attachment) => {
    const mime = (att?.mimeType || "").toLowerCase();
    const name = (att?.name || "").toLowerCase();
    if (att?.fileType === "zip" || name.endsWith(".zip") || mime.includes("zip"))
      return "🗜️";
    if (mime.includes("pdf") || name.endsWith(".pdf")) return "📄";
    if (mime.includes("word") || name.endsWith(".doc") || name.endsWith(".docx")) return "📝";
    if (mime.includes("excel") || name.endsWith(".xls") || name.endsWith(".xlsx")) return "📊";
    if (mime.includes("text") || name.endsWith(".txt")) return "📃";
    return "📎";
  }, []);

  const downloadAndOpenFile = useCallback(
    async (url: string, filename: string, mimeType?: string) => {
    console.log("[CHAT] ===== Starting file download =====");
    console.log("[CHAT] URL:", url);
    console.log("[CHAT] Filename:", filename);
    console.log("[CHAT] MIME type:", mimeType);
    console.log("[CHAT] Platform:", Platform.OS);
    
    try {
      // Ensure URL is absolute and correct
      let finalUrl = url;
      if (!finalUrl.startsWith("http")) {
        finalUrl = `${API_BASE}${finalUrl.startsWith("/") ? "" : "/"}${finalUrl}`;
        console.log("[CHAT] Fixed relative URL to:", finalUrl);
      } else if (finalUrl.includes("localhost") || finalUrl.includes("127.0.0.1")) {
        finalUrl = finalUrl.replace(/https?:\/\/[^\/]+/, API_BASE);
        console.log("[CHAT] Replaced localhost with API_BASE:", finalUrl);
      }
      
      // Create a safe filename with timestamp to avoid conflicts
      const timestamp = Date.now();
      const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_") || `file_${timestamp}`;
      
      // Use documentDirectory if available, otherwise use cacheDirectory
      const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (!baseDir) {
        throw new Error("Dosya sistemi dizini bulunamadı");
      }
      
      const fileUri = `${baseDir}${safeFilename}`;
      
      console.log("[CHAT] Downloading to:", fileUri);
      console.log("[CHAT] Base directory:", baseDir);
      console.log("[CHAT] Document directory:", FileSystem.documentDirectory);
      console.log("[CHAT] Cache directory:", FileSystem.cacheDirectory);
      console.log("[CHAT] Final URL for download:", finalUrl);
      
      // Download the file with timeout
      let downloadResult: any;
      try {
        const downloadPromise = FileSystem.downloadAsync(finalUrl, fileUri);
        const timeoutPromise = new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error("İndirme zaman aşımına uğradı (30 saniye)")), 30000)
        );
        
        downloadResult = await Promise.race([downloadPromise, timeoutPromise]);
        
        console.log("[CHAT] Download result:", {
          status: downloadResult.status,
          uri: downloadResult.uri,
          headers: downloadResult.headers,
        });
        
        if (downloadResult.status !== 200) {
          throw new Error(`İndirme başarısız: HTTP ${downloadResult.status}`);
        }
      } catch (downloadError: any) {
        console.error("[CHAT] Download failed:", {
          error: downloadError,
          message: downloadError?.message,
          code: downloadError?.code,
          name: downloadError?.name,
        });
        // Re-throw to be caught by outer catch
        throw downloadError;
      }
      
      console.log("[CHAT] File downloaded successfully to:", downloadResult.uri);
      
      // Show success message - file is downloaded
      Alert.alert(
        t("chat.fileDownloaded"),
        `${t("chat.downloadSuccess")}\n\n${t("common.file")}: ${filename}\n\n${t("common.location")}: ${downloadResult.uri}`,
        [
          { text: t("common.ok"), style: "cancel" },
          {
            text: t("common.share"),
            onPress: async () => {
              try {
                // Use the downloaded file URI directly
                let shareUri = downloadResult.uri;
                
                // For Android: Try to convert to content URI if method exists
                if (Platform.OS === "android" && FileSystem.getContentUriAsync) {
                  try {
                    console.log("[CHAT] Android: Converting to content URI for sharing...");
                    const contentUriResult = await FileSystem.getContentUriAsync(downloadResult.uri);
                    if (contentUriResult) {
                      shareUri = contentUriResult;
                      console.log("[CHAT] Content URI:", shareUri);
                    } else {
                      console.warn("[CHAT] Content URI conversion returned undefined, using file URI");
                    }
                  } catch (contentError: any) {
                    console.warn("[CHAT] Content URI conversion failed:", contentError?.message);
                    // Continue with file URI
                  }
                }
                
                // Ensure shareUri is valid
                if (!shareUri) {
                  throw new Error(t("common.unknownError"));
                }
                
                console.log("[CHAT] Sharing file with URI:", shareUri);
                
                const isAvailable = await Sharing.isAvailableAsync();
                if (isAvailable) {
                  await Sharing.shareAsync(shareUri, {
                    mimeType: mimeType || "application/octet-stream",
                    dialogTitle: t("common.shareFileOrSave"),
                  });
                } else {
                  Alert.alert(t("common.info"), t("common.sharingNotAvailable"));
                }
              } catch (e: any) {
                console.error("[CHAT] Sharing error:", e);
                Alert.alert(t("common.info"), `${t("chat.fileDownloadSuccess")}\n${t("common.sharingFailed")}`);
              }
            },
          },
        ]
      );
    } catch (error: any) {
      console.error("[CHAT] ===== Download error =====");
      console.error("[CHAT] Error type:", error?.name);
      console.error("[CHAT] Error message:", error?.message);
      console.error("[CHAT] Error code:", error?.code);
      console.error("[CHAT] Error stack:", error?.stack);
      console.error("[CHAT] Original URL:", url);
      console.error("[CHAT] API_BASE:", API_BASE);
      console.error("[CHAT] Platform:", Platform.OS);
      
      // Prepare final URL for fallback
      let finalUrl = url;
      if (!finalUrl.startsWith("http")) {
        finalUrl = `${API_BASE}${finalUrl.startsWith("/") ? "" : "/"}${finalUrl}`;
      } else if (finalUrl.includes("localhost") || finalUrl.includes("127.0.0.1")) {
        finalUrl = finalUrl.replace(/https?:\/\/[^\/]+/, API_BASE);
      }
      
      console.error("[CHAT] Final URL for fallback:", finalUrl);
      
      // Show detailed error to user
      let errorMessage = error?.message || error?.toString() || t("common.unknownError");
      
      // Make error message more user-friendly
      let userFriendlyMessage = t("chat.fileDownloadFailed");
      if (errorMessage.includes("timeout") || errorMessage.includes("zaman aşımı")) {
        userFriendlyMessage = t("chat.downloadTimeout");
      } else if (errorMessage.includes("Network") || errorMessage.includes("network")) {
        userFriendlyMessage = t("chat.downloadError");
      } else if (errorMessage.includes("404") || errorMessage.includes("not found")) {
        userFriendlyMessage = t("chat.fileNotFound");
      } else if (errorMessage.includes("401") || errorMessage.includes("403")) {
        userFriendlyMessage = t("chat.downloadError");
      }
      
      console.error("[CHAT] User-friendly error message:", userFriendlyMessage);
      console.error("[CHAT] Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
      
      // Show error with retry options
      Alert.alert(
        t("chat.fileDownloadFailed"),
        `${userFriendlyMessage}\n\n${t("common.file")}: ${filename}\n\n${t("common.pleaseRetry")}`,
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.retry"),
            onPress: async () => {
              // Retry the download
              try {
                console.log("[CHAT] Retrying download...");
                await downloadAndOpenFile(url, filename, mimeType);
              } catch (retryError: any) {
                console.error("[CHAT] Retry failed:", retryError);
                Alert.alert(t("common.error"), `${t("common.retryFailed")}: ${retryError?.message || t("common.unknownError")}`);
              }
            },
          },
        ]
      );
    }
  }, [t]);

  const renderChatMessageBubble = useCallback((message: ChatMessage) => {
    const isPatient = message.from === "PATIENT" || message.from === "patient";

    // Debug: Log message details
    if (message.attachment) {
      console.log("[CHAT RENDER] Message with attachment:", {
        id: message.id,
        type: message.type,
        attachmentType: message.attachment.fileType,
        mimeType: message.attachment.mimeType,
        name: message.attachment.name,
        url: message.attachment.url,
      });
    }

    return (
      <View
        style={[
          styles.bubble,
          isPatient ? styles.bubblePatient : styles.bubbleAdmin,
        ]}
      >
        {message.type === "text" && message.text ? (
          <Text style={isPatient ? styles.bubbleTextPatient : styles.bubbleTextAdmin}>
            {message.text}
          </Text>
        ) : null}

        {(message.type === "image" || message.attachment?.fileType === "image" || message.attachment?.mimeType?.startsWith("image/")) && message.attachment ? (
          <View>
            <Pressable
              onPress={async () => {
                console.log("[CHAT] ===== IMAGE PRESSED (on image itself) =====");
                
                try {
                  let url = message.attachment!.url;
                  if (!url.startsWith("http")) {
                    url = `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
                  } else if (url.includes("localhost") || url.includes("127.0.0.1")) {
                    url = url.replace(/https?:\/\/[^\/]+/, API_BASE);
                  }
                  
                  console.log("[CHAT] Opening image URL:", url);
                  console.log("[CHAT] API_BASE:", API_BASE);
                  console.log("[CHAT] Platform:", Platform.OS);
                  
                  // Use downloadAndOpenFile for all platforms - it handles images better than Linking.openURL
                  await downloadAndOpenFile(
                    url,
                    message.attachment!.name || "image.jpg",
                    message.attachment!.mimeType || "image/jpeg"
                  );
                } catch (error: any) {
                  console.error("[CHAT] Error opening image:", error);
                  Alert.alert(t("chat.error"), `${t("chat.downloadFailed")}: ${error.message || t("chat.unknownError")}`);
                }
              }}
            >
            <Image
                source={{ 
                  uri: message.attachment.url.startsWith("http") 
                    ? message.attachment.url 
                    : `${API_BASE}${message.attachment.url.startsWith("/") ? "" : "/"}${message.attachment.url}`
                }}
              style={styles.imagePreview}
              resizeMode="cover"
            />
            </Pressable>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Text style={[isPatient ? styles.bubbleTextPatient : styles.bubbleTextAdmin, { fontSize: 12, opacity: 0.8, flex: 1 }]}>
                📷 {message.attachment.name}
              </Text>
              <Pressable
                onPress={async () => {
                  console.log("[CHAT] ===== IMAGE BUTTON PRESSED =====");
                  console.log("[CHAT] Attachment:", message.attachment);
                  
                  try {
                    // Fix URL if it's relative or uses wrong base
                    let url = message.attachment!.url;
                    if (!url.startsWith("http")) {
                      // Relative URL, prepend API_BASE
                      url = `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
                    } else if (url.includes("localhost") || url.includes("127.0.0.1")) {
                      // Replace localhost with API_BASE for Android emulator
                      url = url.replace(/https?:\/\/[^\/]+/, API_BASE);
                    }
                    
                    console.log("[CHAT] Opening image URL:", url);
                    console.log("[CHAT] API_BASE:", API_BASE);
                    console.log("[CHAT] Platform:", Platform.OS);
                    
                    // Use downloadAndOpenFile for all platforms - it handles images better than Linking.openURL
                    await downloadAndOpenFile(
                      url,
                      message.attachment!.name || "image.jpg",
                      message.attachment!.mimeType || "image/jpeg"
                    );
                  } catch (error: any) {
                    console.error("[CHAT] Error opening image:", error);
                    Alert.alert(t("chat.error"), `${t("chat.photoOpenFailed")}: ${error.message || t("chat.unknownError")}`);
                  }
                }}
                style={[styles.fileCard, { backgroundColor: isPatient ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.1)" }]}
              >
                <Text style={[isPatient ? styles.bubbleTextPatient : styles.bubbleTextAdmin, { fontWeight: "700", fontSize: 16 }]}>
                  📂 Aç
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {message.attachment && !(message.type === "image" || message.attachment?.fileType === "image" || message.attachment?.mimeType?.startsWith("image/")) ? (
          <Pressable
            onPress={async () => {
              console.log("[CHAT] ===== FILE BUTTON PRESSED =====");
              console.log("[CHAT] Attachment:", message.attachment);
              
              try {
                // Fix URL if it's relative or uses wrong base
                let url = message.attachment!.url;
                if (!url.startsWith("http")) {
                  // Relative URL, prepend API_BASE
                  url = `${API_BASE}${url.startsWith("/") ? "" : "/"}${url}`;
                } else if (url.includes("localhost") || url.includes("127.0.0.1")) {
                  // Replace localhost with API_BASE for Android emulator
                  url = url.replace(/https?:\/\/[^\/]+/, API_BASE);
                }
                
                console.log("[CHAT] Opening file URL:", url);
                console.log("[CHAT] API_BASE:", API_BASE);
                console.log("[CHAT] Platform:", Platform.OS);
                
                // For Android, always download and share
                if (Platform.OS === "android") {
                  console.log("[CHAT] Android detected, calling downloadAndOpenFile");
                  await downloadAndOpenFile(
                    url,
                    message.attachment!.name || "file",
                    message.attachment!.mimeType
                  );
                } else {
                  // iOS: try to open URL directly first
                  try {
                    const canOpen = await Linking.canOpenURL(url);
                    console.log("[CHAT] Can open URL:", canOpen);
                    
                    if (canOpen) {
                      await Linking.openURL(url);
                    } else {
                      // Fallback: download and share
                      await downloadAndOpenFile(
                        url,
                        message.attachment!.name || "file",
                        message.attachment!.mimeType
                      );
                    }
                  } catch (linkError: any) {
                    console.error("[CHAT] Linking error:", linkError);
                    // Fallback: download and share
                    await downloadAndOpenFile(
                      url,
                      message.attachment!.name || "file",
                      message.attachment!.mimeType
                    );
                  }
                }
              } catch (error: any) {
                console.error("[CHAT] Error opening file:", error);
                Alert.alert(t("chat.error"), `${t("chat.fileSelectionFailed")}: ${error.message || t("chat.unknownError")}`);
              }
            }}
            style={styles.fileCard}
          >
            <Text style={{ fontSize: 24, marginBottom: 4 }}>{getAttachmentIcon(message.attachment)}</Text>
            <Text style={[isPatient ? styles.bubbleTextPatient : styles.bubbleTextAdmin, { fontWeight: "600" }]}>
              {message.attachment.name}
            </Text>
            <Text style={[isPatient ? styles.bubbleTextPatient : styles.bubbleTextAdmin, { fontSize: 11, opacity: 0.7, marginTop: 2 }]}>
              {formatFileSize(message.attachment.size)}
            </Text>
          </Pressable>
        ) : null}

        {!message.text && !message.attachment && (
          <Text style={isPatient ? styles.bubbleTextPatient : styles.bubbleTextAdmin}>(Boş mesaj)</Text>
        )}

        <Text style={[styles.time, { color: isPatient ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.5)" }]}>
          {new Date(message.createdAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
        </Text>

      </View>
    );
  }, [downloadAndOpenFile, formatFileSize, getAttachmentIcon, t]);

  const renderChatFlatListItem = useCallback(
    ({ item }: ListRenderItemInfo<ChatMessage>) => renderChatMessageBubble(item),
    [renderChatMessageBubble],
  );

  const chatMessageKeyExtractor = useCallback(
    (item: ChatMessage) => item.id?.toString() ?? `fb-${item.createdAt}`,
    [],
  );

  if (loading) {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { flex: 1 }]}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t("chat.title")}</Text>
        </View>
        <ActivityIndicator style={{ marginTop: 40 }} />
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t("chat.title")}</Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <FlatList
          ref={scrollRef}
          data={messages}
          keyExtractor={chatMessageKeyExtractor}
          renderItem={renderChatFlatListItem}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          inverted
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={true}
          style={styles.messages}
          contentContainerStyle={{ padding: 12, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>{t("chat.noMessages")}</Text>
            </View>
          }
          onContentSizeChange={() =>
            scrollRef.current?.scrollToOffset({ offset: 0, animated: false })
          }
        />

        <View style={styles.inputBar}>
          {/* Action Buttons Row - Hierarchical Design */}
          <View style={styles.actionButtonsContainer}>
            {/* 1. PRIMARY: Ağız İçi Fotoğraf Çek */}
            {patientId && (
              <Pressable
                onPress={() => {
                  console.log("[CHAT] Opening native intraoral camera from input bar");
                  router.push({
                    pathname: "/intraoral-camera",
                    params: {
                      patientId: patientId,
                      chatId: patientId,
                    },
                  });
                }}
                disabled={uploading}
                style={[styles.primaryBtn, uploading && { opacity: 0.5 }]}
              >
                <Text style={styles.primaryBtnIcon}>📸</Text>
                <Text style={styles.primaryBtnText}>{t("chat.intraoralPhoto")}</Text>
              </Pressable>
            )}
            
            {/* 2. SECONDARY: Resim Gönder */}
            <Pressable
              onPress={pickAndUploadImage}
              disabled={uploading}
              style={[styles.secondaryBtn, uploading && { opacity: 0.5 }]}
            >
              <Text style={styles.secondaryBtnIcon}>🖼️</Text>
              <Text style={styles.secondaryBtnText}>{t("chat.sendImage")}</Text>
            </Pressable>
            
            {/* 3. TERTIARY: Dosya Gönder */}
            <Pressable
              onPress={pickAndUploadDocument}
              disabled={uploading}
              style={[styles.tertiaryBtn, uploading && { opacity: 0.5 }]}
            >
              <Text style={styles.tertiaryBtnIcon}>📁</Text>
              <Text style={styles.tertiaryBtnText}>{t("chat.sendFile")}</Text>
            </Pressable>
          </View>
          
          {/* Input and Send Row */}
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={(newText) => {
                // Preserve cursor position when text changes
                setText(newText);
              }}
              placeholder={t("chat.typeMessage")}
              style={styles.input}
              multiline
              maxLength={1000}
              onFocus={() => {
                console.log("[CHAT] Input focused");
                // Ensure input is visible when focused
                setTimeout(() => {
                  scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
                }, 100);
              }}
              onBlur={() => {
                console.log("[CHAT] Input blurred");
              }}
              onSubmitEditing={() => {
                if (text.trim()) {
                  sendMessage();
                }
              }}
              blurOnSubmit={false}
              returnKeyType="send"
              textAlignVertical="top"
              scrollEnabled={true}
            />
            
            <Pressable onPress={sendMessage} disabled={!text.trim()} style={[styles.sendBtn, !text.trim() && { opacity: 0.5 }]}>
              <Text style={{ color: "white", fontWeight: "700" }}>{t("chat.send")}</Text>
            </Pressable>
          </View>
        </View>

        {uploading && (
          <View style={styles.uploadingIndicator}>
            <ActivityIndicator size="small" color="#2563EB" />
            <Text style={styles.uploadingText}>{t("common.loading")}</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F3F4F6" },
  header: {
    padding: 14,
    borderBottomWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    backgroundColor: "white",
  },
  headerTitle: { fontSize: 18, fontWeight: "800" },
  messages: { flex: 1 },
  emptyState: {
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyStateText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  bubble: {
    maxWidth: "80%",
    padding: 12,
    borderRadius: 14,
    marginBottom: 10,
  },
  bubblePatient: {
    alignSelf: "flex-end",
    backgroundColor: "#2563EB",
  },
  bubbleAdmin: {
    alignSelf: "flex-start",
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  bubbleTextPatient: { color: "white", fontSize: 15 },
  bubbleTextAdmin: { color: "#111827", fontSize: 15 },
  time: { fontSize: 10, marginTop: 6 },
  imagePreview: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 4,
  },
  fileCard: {
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 8,
    alignItems: "center",
    minWidth: 150,
    minHeight: 44, // Ensure minimum touch target size
    justifyContent: "center",
  },
  inputBar: {
    padding: 10,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  actionButtonsContainer: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  // PRIMARY: Ağız İçi Fotoğraf Çek
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    gap: 8,
    flex: 1,
    minWidth: 150,
  },
  primaryBtnIcon: {
    fontSize: 20,
  },
  primaryBtnText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },
  // SECONDARY: Resim Gönder
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    gap: 6,
  },
  secondaryBtnIcon: {
    fontSize: 18,
  },
  secondaryBtnText: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "500",
  },
  // TERTIARY: Dosya Gönder
  tertiaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 44,
    gap: 6,
  },
  tertiaryBtnIcon: {
    fontSize: 16,
  },
  tertiaryBtnText: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "400",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.2)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxHeight: 100,
    fontSize: 15,
  },
  sendBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: "center",
    minHeight: 44,
  },
  uploadingIndicator: {
    position: "absolute",
    bottom: 70,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.8)",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    pointerEvents: "none",
  },
  uploadingText: {
    color: "white",
    marginLeft: 8,
    fontSize: 14,
  },
  cameraCtaButton: {
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraCtaButtonPatient: {
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  cameraCtaButtonAdmin: {
    backgroundColor: "rgba(0,0,0,0.05)",
  },
  cameraCtaButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#16a34a",
  },
  intraoralCameraBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
  },
});
