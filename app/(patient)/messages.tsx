import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Image,
  Linking, Modal, ScrollView, ActionSheetIOS,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";
import { useDateLocale } from "../../lib/date-locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type Attachment = {
  name: string; size?: number; url: string;
  mimeType: string; fileType: "image" | "pdf" | string;
};
type Message = {
  id: string; from: "PATIENT" | "CLINIC";
  text?: string; type: string;
  attachment?: Attachment;
  createdAt: number;
};

// ─── Intraoral photo steps ────────────────────────────────────────────────────

const PHOTO_STEPS = [
  { key: "upper", label: "Üst Dişler",  icon: "⬆️", instruction: "Ağzınızı açın ve üst dişlerinizi gösterin" },
  { key: "lower", label: "Alt Dişler",  icon: "⬇️", instruction: "Ağzınızı açın ve alt dişlerinizi gösterin" },
  { key: "front", label: "Ön Görünüm",  icon: "😁", instruction: "Gülümseyin ve ön dişlerinizi tam gösterin" },
  { key: "left",  label: "Sol Taraf",   icon: "◀️", instruction: "Sol yan dişlerinizi gösterin" },
  { key: "right", label: "Sağ Taraf",   icon: "▶️", instruction: "Sağ yan dişlerinizi gösterin" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(ts: number, locale: string) {
  return new Date(ts).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(ts: number, locale: string) {
  return new Date(ts).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MessagesScreen() {  // ← BURASI EKSİKTİ!
  const { user } = useAuth();
  const locale = useDateLocale();
  const router = useRouter();
  const [messages, setMessages]             = useState<Message[]>([]);
  const [loading, setLoading]               = useState(true);
  const [text, setText]                     = useState("");
  const [sending, setSending]               = useState(false);
  const [uploading, setUploading]           = useState(false);
  const [intraoralVisible, setIntraoralVisible] = useState(false);
  const [intraoralStep, setIntraoralStep]   = useState(0);
  const [intraoralPhotos, setIntraoralPhotos] = useState<Record<string, any>>({});
  const flatRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCountRef = useRef(0);

  const patientId = String(user?.patientId || "").trim();
  const token     = user?.token;

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  }), [token]);

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
    fetchMessages();
    pollRef.current = setInterval(() => fetchMessages(true), 12_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMessages]);

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
          Alert.alert("Mesajlaşma Kilitli", "Klinik onayı bekleniyor. Onaylandıktan sonra mesaj gönderebilirsiniz.");
        } else {
          Alert.alert("Hata", "Mesaj gönderilemedi. Tekrar deneyin.");
        }
      } else {
        fetchMessages(true);
      }
    } catch {
      setText(msg);
      Alert.alert("Hata", "Bağlantı hatası.");
    } finally { setSending(false); }
  };

  // ── Upload file ────────────────────────────────────────────────────────────

  const uploadFile = async (uri: string, name: string, mimeType: string) => {
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
        Alert.alert("Yükleme Hatası", json.message || json.error || "Dosya yüklenemedi.");
      } else {
        fetchMessages(true);
      }
    } catch {
      Alert.alert("Hata", "Dosya yüklenemedi.");
    } finally { setUploading(false); }
  };

  // ── Pickers ────────────────────────────────────────────────────────────────

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("İzin Gerekli", "Fotoğraf kitaplığına erişim izni gerekli.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      await uploadFile(a.uri, a.fileName || `photo_${Date.now()}.jpg`, a.mimeType || "image/jpeg");
    }
  };

  const pickDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "image/*"],
      copyToCacheDirectory: true,
    });
    if (!result.canceled && result.assets[0]) {
      const a = result.assets[0];
      await uploadFile(a.uri, a.name, a.mimeType || "application/octet-stream");
    }
  };

  const showAttachMenu = () => {
    const openIntraoral = () => {
      // Yeni AI Guided ekranına yönlendir
      router.push("/patient/AIGuidedPhotoCapture");
      // Eski modalı fallback olarak kullanmak istersen aşağıdaki satırları başka bir butona bağlayabilirsin:
      // setIntraoralStep(0);
      // setIntraoralPhotos({});
      // setIntraoralVisible(true);
    };
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["İptal", "Fotoğraf Seç", "Dosya Seç (PDF)", "Ağız İçi Fotoğraf Çek"], cancelButtonIndex: 0 },
        (i) => { if (i === 1) pickImage(); else if (i === 2) pickDocument(); else if (i === 3) openIntraoral(); }
      );
    } else {
      Alert.alert("Dosya Ekle", "Kaynak seçin", [
        { text: "Fotoğraf Seç",         onPress: pickImage },
        { text: "Dosya Seç (PDF)",       onPress: pickDocument },
        { text: "Ağız İçi Fotoğraf",    onPress: openIntraoral },
        { text: "İptal",                 style: "cancel" },
      ]);
    }
  };

  // ── Intraoral ─────────────────────────────────────────────────────────────

  const captureIntraoralStep = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("İzin Gerekli", "Kamera erişim izni gerekli.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: "images", quality: 0.85 });
    if (!result.canceled && result.assets[0]) {
      const key = PHOTO_STEPS[intraoralStep].key;
      setIntraoralPhotos(prev => ({ ...prev, [key]: result.assets[0] }));
    }
  };

  const submitIntraoralPhotos = async () => {
    const entries = Object.entries(intraoralPhotos);
    if (entries.length === 0) { Alert.alert("Hata", "En az bir fotoğraf çekin."); return; }
    setIntraoralVisible(false);
    setUploading(true);
    for (const [key, asset] of entries) {
      const name = `intraoral_${key}_${Date.now()}.jpg`;
      await uploadFile((asset as any).uri, name, "image/jpeg");
    }
    setUploading(false);
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
          <Text style={s.headerTitle}>Mesajlar</Text>
          <Text style={s.headerSub}>Kliniğinizle iletişim</Text>
        </View>

        {/* Message list */}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m, i) => m.id || String(i)}
          contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            const prev = messages[index - 1];
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
              <Text style={s.emptyTitle}>Henüz mesaj yok</Text>
              <Text style={s.emptySub}>
                Klinikle iletişime geçmek için bir mesaj gönderin.
              </Text>
            </View>
          }
        />

        {/* Upload indicator */}
        {uploading && (
          <View style={s.uploadBanner}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={s.uploadBannerText}>Dosya yükleniyor...</Text>
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
            placeholder="Mesaj yazın..."
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
        onNext={() => setIntraoralStep(p => Math.min(p + 1, PHOTO_STEPS.length - 1))}
        onPrev={() => setIntraoralStep(p => Math.max(p - 1, 0))}
        onSubmit={submitIntraoralPhotos}
      />
    </KeyboardAvoidingView>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const locale = useDateLocale();
  const isPatient = msg.from === "PATIENT";
  const att = msg.attachment;
  const isImage = att?.fileType === "image" || att?.mimeType?.startsWith("image/");
  const isPdf   = att?.fileType === "pdf"   || att?.mimeType === "application/pdf";

  return (
    <View style={[s.bubbleWrap, isPatient ? s.bubbleRight : s.bubbleLeft]}>
      {!isPatient && <Text style={s.bubbleFrom}>Klinik</Text>}
      <View style={[s.bubble, isPatient ? s.bubblePatient : s.bubbleClinic]}>
        {!!msg.text && (
          <Text style={[s.bubbleText, isPatient && s.bubbleTextWhite]}>
            {msg.text}
          </Text>
        )}
        {isImage && att?.url ? (
          <TouchableOpacity onPress={() => Linking.openURL(att.url)} activeOpacity={0.85}>
            <Image source={{ uri: att.url }} style={s.attImage} resizeMode="cover" />
            {att.name && (
              <Text style={[s.attName, isPatient && { color: "rgba(255,255,255,0.7)" }]}
                numberOfLines={1}>{att.name}</Text>
            )}
          </TouchableOpacity>
        ) : null}
        {isPdf && att ? (
          <TouchableOpacity style={s.pdfRow} onPress={() => Linking.openURL(att.url)} activeOpacity={0.85}>
            <Text style={s.pdfEmoji}>📄</Text>
            <View style={{ flex: 1 }}>
              <Text style={[s.pdfName, isPatient && { color: "#dbeafe" }]} numberOfLines={2}>
                {att.name || "Dosya"}
              </Text>
              {att.size ? (
                <Text style={[s.pdfSize, isPatient && { color: "rgba(255,255,255,0.5)" }]}>
                  {(att.size / 1024).toFixed(0)} KB
                </Text>
              ) : null}
            </View>
            <Text style={[s.pdfOpen, isPatient && { color: "#93c5fd" }]}>Aç</Text>
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
  const current = PHOTO_STEPS[step];
  const photo   = photos[current?.key];
  const doneCount = Object.keys(photos).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={im.container}>
        {/* Header */}
        <View style={im.header}>
          <TouchableOpacity onPress={onClose} style={im.closeBtn}>
            <Text style={im.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={im.title}>Ağız İçi Fotoğraf</Text>
          <Text style={im.badge}>{doneCount}/{PHOTO_STEPS.length}</Text>
        </View>

        {/* Progress dots */}
        <View style={im.dots}>
          {PHOTO_STEPS.map((st, i) => (
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
          <Text style={im.stepIcon}>{current.icon}</Text>
          <Text style={im.stepLabel}>{current.label}</Text>
          <Text style={im.stepInstruction}>{current.instruction}</Text>

          {photo ? (
            <Image source={{ uri: photo.uri }} style={im.preview} resizeMode="cover" />
          ) : (
            <View style={im.placeholder}>
              <Text style={im.placeholderIcon}>📷</Text>
              <Text style={im.placeholderText}>Fotoğraf henüz çekilmedi</Text>
            </View>
          )}

          <TouchableOpacity style={im.cameraBtn} onPress={onCapture} activeOpacity={0.85}>
            <Text style={im.cameraBtnText}>
              {photo ? "📷  Yeniden Çek" : "📷  Fotoğraf Çek"}
            </Text>
          </TouchableOpacity>

          <View style={im.navRow}>
            <TouchableOpacity
              style={[im.navBtn, step === 0 && im.navBtnOff]}
              onPress={onPrev}
              disabled={step === 0}
              activeOpacity={0.8}
            >
              <Text style={im.navBtnText}>◀  Önceki</Text>
            </TouchableOpacity>

            {step < PHOTO_STEPS.length - 1 ? (
              <TouchableOpacity style={im.navBtn} onPress={onNext} activeOpacity={0.8}>
                <Text style={im.navBtnText}>Sonraki  ▶</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[im.navBtn, im.submitBtn, doneCount === 0 && im.navBtnOff]}
                onPress={onSubmit}
                disabled={doneCount === 0}
                activeOpacity={0.85}
              >
                <Text style={[im.navBtnText, im.submitBtnText]}>
                  Gönder ({doneCount}) ✓
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={im.hint}>
            Tüm adımları tamamlamak zorunda değilsiniz. İstediğiniz fotoğrafları çektikten sonra "Gönder"e basın.
          </Text>
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
  bubble:        { maxWidth: "80%", borderRadius: 16, padding: 10, paddingHorizontal: 14 },
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