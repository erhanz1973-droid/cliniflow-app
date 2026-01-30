import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Image,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

// Import expo-av for audio playback
import { Audio } from "expo-av";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import * as IntentLauncher from "expo-intent-launcher";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";
import { t } from "../lib/i18n";

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
};

export default function PatientChatScreen() {
  const router = useRouter();
  const { user, isAuthReady } = useAuth();
  const params = useLocalSearchParams();
  const userPatientId = params.patientId as string || (user as any)?.patientId || "";
  
  const [patientId, setPatientId] = useState<string>(userPatientId);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Ref for TextInput to manage cursor and focus
  const inputRef = useRef<TextInput>(null);
  const [uploading, setUploading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const isRedirectingRef = useRef(false);
  const previousMessagesCountRef = useRef<number>(0);
  const isSendingMessageRef = useRef(false);
  
  // Play notification sound and haptic feedback when new message arrives
  const playNotificationSound = useCallback(async () => {
    try {
      console.log("[CHAT] Playing notification sound...");
      
      // Configure audio mode for playback
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true, // Play even when phone is in silent mode (iOS)
          staysActiveInBackground: true, // Keep audio active in background (for when screen is off)
          shouldDuckAndroid: true, // Duck other audio on Android
        });
        console.log("[CHAT] Audio mode configured");
      } catch (audioModeError) {
        console.warn("[CHAT] Could not set audio mode:", audioModeError);
      }
      
      // Haptic feedback (vibration on mobile)
      try {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        console.log("[CHAT] Haptic feedback played");
      } catch (hapticError) {
        console.warn("[CHAT] Haptic feedback failed:", hapticError);
      }
      
      // Play notification sound file
      try {
        console.log("[CHAT] Loading sound file from assets/audio/notification.mp3...");
        
        // Try to require the sound file
        let soundSource;
        try {
          soundSource = require('../assets/audio/notification.mp3');
        } catch (requireError) {
          // Sound file not found - continue with haptic feedback only
          console.log("[CHAT] Sound file not available, using haptic feedback only");
          return; // Exit early if sound file is not available
        }
        
        const { sound } = await Audio.Sound.createAsync(
          soundSource,
          { 
            shouldPlay: true, 
            volume: 0.8,
            isLooping: false
          }
        );
        console.log("[CHAT] Sound loaded, playing...");
        
        // Wait for sound to finish playing
        sound.setOnPlaybackStatusUpdate((status: any) => {
          if (status.didJustFinish) {
            sound.unloadAsync().catch(() => {});
            console.log("[CHAT] Sound finished and unloaded");
          }
        });
        
        await sound.playAsync();
        console.log("[CHAT] Notification sound played successfully");
      } catch (soundError) {
        console.log("[CHAT] Sound playback skipped (file may be missing)");
        // Don't throw - continue without sound if file is missing
      }
      
      console.log("[CHAT] Notification played (haptic + sound)");
    } catch (error) {
      console.error("[CHAT] Could not play notification:", error);
    }
  }, []);
  
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
  
  // Fetch patientId from API if not available
  useEffect(() => {
    if (!isAuthReady || !user?.token) return;
    
    const loadPatientId = async () => {
      if (patientId) return; // Already have patientId
      
      try {
        const res = await fetch(`${API_BASE}/api/patient/me`, {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        
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
  }, [isAuthReady, user?.token, patientId]);

  // Status check removed - backend handles status checking in messages endpoint
  // If status is not APPROVED, backend returns 403 with CHAT_LOCKED error

  const fetchMessages = useCallback(async () => {
    if (!user?.token || !patientId) return;
    
    try {
      const res = await fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/messages`, {
        headers: { Authorization: `Bearer ${user.token}` },
        cache: "no-store",
      });

      if (res.status === 403 || res.status === 401) {
        // Not approved or unauthorized - but don't redirect, just show empty messages
        setMessages([]);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setMessages([]);
        setLoading(false);
        return;
      }

      const json = await res.json();
        const formattedMessages: ChatMessage[] = (json.messages || []).map((msg: any) => ({
          id: msg.id,
          from: msg.from === "CLINIC" || msg.from === "admin" ? "CLINIC" : "PATIENT",
          text: msg.text || "",
          type: msg.type || "text",
          attachment: msg.attachment ? {
            name: msg.attachment.name || t("chat.file"),
            size: msg.attachment.size || 0,
            url: msg.attachment.url,
            mimeType: msg.attachment.mimeType || msg.attachment.mime,
            fileType: msg.attachment.fileType || (msg.attachment.mimeType?.startsWith("image/") ? "image" : "pdf"),
          } : undefined,
          createdAt: msg.createdAt || Date.now(),
        }));

        // Check if new CLINIC messages arrived during refresh
        const currentCount = formattedMessages.length;
        const previousCount = previousMessagesCountRef.current;
        
        // Only play sound if not sending a message (user sent message should not trigger sound)
        if (currentCount > previousCount && previousCount > 0 && !isSendingMessageRef.current) {
          const previousMessageIds = new Set(messages.map((m: ChatMessage) => m.id));
          const newClinicMessages = formattedMessages.filter((msg: ChatMessage) => {
            return msg.from === "CLINIC" && !previousMessageIds.has(msg.id);
          });
          
          if (newClinicMessages.length > 0) {
            playNotificationSound();
          }
        }
        
        // Reset sending flag after checking
        if (isSendingMessageRef.current) {
          isSendingMessageRef.current = false;
        }
        
        previousMessagesCountRef.current = currentCount;
        setMessages(formattedMessages);
        setLoading(false);
    } catch (error) {
      console.error("Error fetching messages:", error);
      setLoading(false);
    }
  }, [user?.token, patientId, playNotificationSound]);

  // Check patient status on mount only - status check removed to prevent redirects
  // Status is checked in fetchMessages instead
  useEffect(() => {
    if (!isAuthReady) return;
    
    if (!user?.token || !patientId) {
      setLoading(false);
      return;
    }

    // Reset redirect flag
    isRedirectingRef.current = false;

    // Load messages directly - backend handles status checking, 403/401 won't redirect
    fetchMessages();
  }, [isAuthReady, user?.token, patientId]);

  // Reset chat badge when chat screen is focused (opened)
  useFocusEffect(
    useCallback(() => {
      if (!patientId) return;
      
      // Update last seen timestamp to current time to reset badge
      const updateLastSeen = async () => {
        try {
          const currentTime = Date.now();
          await AsyncStorage.setItem(`chat_last_seen_${patientId}`, String(currentTime));
          console.log("[CHAT] Last seen timestamp updated:", currentTime);
        } catch (error) {
          console.error("[CHAT] Failed to update last seen timestamp:", error);
        }
      };
      
      updateLastSeen();
    }, [patientId])
  );

  // Auto-refresh messages every 2.5 seconds
  useEffect(() => {
    if (!user?.token || !patientId || loading) return;
    
    const refreshMessages = async () => {
      if (!user?.token || !patientId) return;
      
      try {
        const res = await fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/messages`, {
          headers: { Authorization: `Bearer ${user.token}` },
          cache: "no-store",
        });

        if (res.status === 403 || res.status === 401) {
          return; // Don't redirect on auto-refresh
        }

        if (!res.ok) {
          return;
        }

        const json = await res.json();
        const formattedMessages: ChatMessage[] = (json.messages || []).map((msg: any) => ({
          id: msg.id,
          from: msg.from === "CLINIC" || msg.from === "admin" ? "CLINIC" : "PATIENT",
          text: msg.text || "",
          type: msg.type || "text",
          attachment: msg.attachment ? {
            name: msg.attachment.name || t("chat.file"),
            size: msg.attachment.size || 0,
            url: msg.attachment.url,
            mimeType: msg.attachment.mimeType || msg.attachment.mime,
            fileType: msg.attachment.fileType || (msg.attachment.mimeType?.startsWith("image/") ? "image" : "pdf"),
          } : undefined,
          createdAt: msg.createdAt || Date.now(),
        }));

        // Check if new CLINIC messages arrived (use ref to track previous state)
        const currentCount = formattedMessages.length;
        const previousCount = previousMessagesCountRef.current;
        
        // If messages increased and we had messages before, check for new CLINIC messages
        if (currentCount > previousCount && previousCount > 0) {
          // Use a closure to access current messages state
          setMessages((prevMessages) => {
            const previousMessageIds = new Set(prevMessages.map((m: ChatMessage) => m.id));
            const newClinicMessages = formattedMessages.filter((msg: ChatMessage) => {
              return msg.from === "CLINIC" && !previousMessageIds.has(msg.id);
            });
            
            // Only play sound if not sending a message (user sent message should not trigger sound)
            if (newClinicMessages.length > 0 && !isSendingMessageRef.current) {
              playNotificationSound();
            }
            
            // Reset sending flag after checking
            if (isSendingMessageRef.current) {
              isSendingMessageRef.current = false;
            }
            
            return formattedMessages;
          });
        } else {
          setMessages(formattedMessages);
        }
        
        previousMessagesCountRef.current = currentCount;
      } catch (error) {
        console.error("Error refreshing messages:", error);
      }
    };
    
    refreshMessages();
    const interval = setInterval(refreshMessages, 2500);
    return () => clearInterval(interval);
  }, [user?.token, patientId, loading, playNotificationSound]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
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

    try {
      const res = await fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify({
          text: text.trim(),
          type: "text",
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("[CHAT] send failed:", res.status, text.slice(0, 300));
        isSendingMessageRef.current = false; // Reset flag on error
        throw new Error(`HTTP ${res.status}`);
      }

      setText("");
      
      // Focus back to input after sending message
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
      
      // Fetch messages after sending (flag will prevent sound)
      await fetchMessages();
    } catch (error) {
      console.error("Error sending message:", error);
      isSendingMessageRef.current = false; // Reset flag on error
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
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
      fetchMessages();
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
      fetchMessages();
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

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getAttachmentIcon(att?: Attachment) {
    const mime = (att?.mimeType || "").toLowerCase();
    const name = (att?.name || "").toLowerCase();
    if (att?.fileType === "zip" || name.endsWith(".zip") || mime.includes("zip")) return "🗜️";
    if (mime.includes("pdf") || name.endsWith(".pdf")) return "📄";
    if (mime.includes("word") || name.endsWith(".doc") || name.endsWith(".docx")) return "📝";
    if (mime.includes("excel") || name.endsWith(".xls") || name.endsWith(".xlsx")) return "📊";
    if (mime.includes("text") || name.endsWith(".txt")) return "📃";
    return "📎";
  }

  // Helper function to download files (simplified - just download, don't try to open)
  async function downloadAndOpenFile(url: string, filename: string, mimeType?: string) {
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
  }

  // Check if there's a CLINIC message and get the last one's index
  const getLastClinicMessageIndex = useCallback(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].from === "CLINIC" || messages[i].from === "admin") {
        return i;
      }
    }
    return -1;
  }, [messages]);

  function renderMessage(message: ChatMessage, index: number) {
    const isPatient = message.from === "PATIENT" || message.from === "patient";
    const lastClinicIndex = getLastClinicMessageIndex();
    const isLastClinicMessage = !isPatient && index === lastClinicIndex;
    
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
        key={message.id}
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
  }

  if (loading) {
    return (
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
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
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={{ padding: 12 }}
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>{t("chat.noMessages")}</Text>
            </View>
          ) : (
            messages.map((msg, index) => renderMessage(msg, index))
          )}
        </ScrollView>

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
                  scrollRef.current?.scrollToEnd({ animated: true });
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
