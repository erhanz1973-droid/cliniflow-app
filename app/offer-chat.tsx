// app/offer-chat.tsx — Offer-based messaging between patient and doctor
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert, Image, Modal, ScrollView, Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/language-context';
import { API_BASE } from '../lib/api';

// Guided intraoral photo steps
const PHOTO_STEP_KEYS = [
  { key: 'upper', icon: '⬆️' },
  { key: 'lower', icon: '⬇️' },
  { key: 'front', icon: '😁' },
  { key: 'left',  icon: '◀️' },
  { key: 'right', icon: '▶️' },
];

type Message = {
  id: string;
  sender_id: string;
  sender_role: 'patient' | 'doctor';
  sender_name: string;
  text: string | null;
  attachment_url: string | null;
  attachment_type: 'image' | 'xray' | 'document' | null;
  created_at: string;
};

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return ''; }
}

function groupByDate(messages: Message[]) {
  const groups: { date: string; items: Message[] }[] = [];
  let lastDate = '';
  for (const m of messages) {
    const d = fmtDate(m.created_at);
    if (d !== lastDate) {
      groups.push({ date: d, items: [] });
      lastDate = d;
    }
    groups[groups.length - 1].items.push(m);
  }
  const flat: ({ type: 'separator'; date: string } | { type: 'message' } & Message)[] = [];
  for (const g of groups) {
    flat.push({ type: 'separator', date: g.date });
    for (const m of g.items) flat.push({ type: 'message', ...m });
  }
  return flat;
}

export default function OfferChatScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();

  const { offerId, otherName, treatmentType } = useLocalSearchParams<{
    offerId: string;
    otherName: string;
    treatmentType: string;
  }>();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Guided intraoral state
  const [intraoralVisible, setIntraoralVisible] = useState(false);
  const [intraoralStep, setIntraoralStep]       = useState(0);
  const [intraoralPhotos, setIntraoralPhotos]   = useState<Record<string, any>>({});

  const myRole = user?.type === 'doctor' ? 'doctor' : 'patient';

  // Mark all patient messages in this thread as read (doctor only)
  const markAsRead = useCallback(async () => {
    if (!user?.token || !offerId || user?.type !== 'doctor') return;
    try {
      await fetch(`${API_BASE}/api/offer-messages/${encodeURIComponent(offerId)}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
      });
    } catch { /* silent — badge will auto-correct on next poll */ }
  }, [user?.token, user?.type, offerId]);

  const fetchMessages = useCallback(async (silent = false) => {
    if (!user?.token || !offerId) return;
    if (!silent) setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/offer-messages?offer_id=${encodeURIComponent(offerId)}`,
        { headers: { Authorization: `Bearer ${user.token}` } }
      );
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'error');
      setMessages(data.messages || []);
    } catch (e: any) {
      if (!silent) setError(e.message || t('common.error'));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user?.token, offerId, t]);

  useEffect(() => {
    fetchMessages(false).then(() => {
      setLoading(false);
      markAsRead(); // mark existing messages as read as soon as chat opens
    });
  }, [fetchMessages, markAsRead]);

  useEffect(() => {
    pollRef.current = setInterval(() => fetchMessages(true), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // Upload a file to the backend and get back a URL
  const uploadAttachment = async (
    uri: string,
    mimeType: string,
    fileName: string,
    attachmentType: 'image' | 'xray' | 'document'
  ): Promise<string> => {
    const formData = new FormData();
    formData.append('file', { uri, type: mimeType, name: fileName } as any);
    formData.append('offer_id', offerId!);
    formData.append('attachment_type', attachmentType);

    const res = await fetch(`${API_BASE}/api/offer-messages/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user!.token}` },
      body: formData,
    });
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || 'upload_failed');
    return data.url as string;
  };

  // Build and send a message (text-only, attachment-only, or both)
  const sendMessage = async (opts: {
    text?: string;
    attachment_url?: string;
    attachment_type?: 'image' | 'xray' | 'document';
  }) => {
    if (!user?.token || !offerId) return;

    const optimistic: Message = {
      id: `opt_${Date.now()}`,
      sender_id: user.id || '',
      sender_role: myRole,
      sender_name: user.name || (myRole === 'doctor' ? 'Dr.' : t('offerChat.you')),
      text: opts.text || null,
      attachment_url: opts.attachment_url || null,
      attachment_type: opts.attachment_type || null,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setSending(true);

    try {
      const res = await fetch(`${API_BASE}/api/offer-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({
          offer_id: offerId,
          text: opts.text || '',
          attachment_url: opts.attachment_url,
          attachment_type: opts.attachment_type,
        }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'error');
      setMessages(prev =>
        prev.map(m => m.id === optimistic.id
          ? { ...data.message, sender_name: optimistic.sender_name }
          : m
        )
      );
    } catch (e: any) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      Alert.alert(t('common.error'), e.message || t('common.error'));
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    if (text.length > 500) {
      Alert.alert(t('common.error'), t('offerChat.tooLong'));
      return;
    }
    setDraft('');
    await sendMessage({ text });
  };

  const pickIntraoral = async () => {
    if (sending) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), 'Photo library permission required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.8,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const uri = asset.uri;
    const mime = asset.mimeType || 'image/jpeg';
    const name = asset.fileName || `intraoral_${Date.now()}.jpg`;

    setSending(true);
    try {
      const url = await uploadAttachment(uri, mime, name, 'image');
      await sendMessage({ attachment_url: url, attachment_type: 'image' });
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Upload failed');
      setSending(false);
    }
  };

  // Open the guided intraoral modal
  const takeIntraoral = () => {
    if (sending) return;
    setIntraoralStep(0);
    setIntraoralPhotos({});
    setIntraoralVisible(true);
  };

  // Capture one step inside the guided modal
  const captureIntraoralStep = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), 'Camera permission required');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return;
    const key = PHOTO_STEP_KEYS[intraoralStep].key;
    setIntraoralPhotos(prev => ({ ...prev, [key]: result.assets[0] }));
  };

  // Upload all captured intraoral photos as chat messages
  const submitIntraoralPhotos = async () => {
    const entries = Object.entries(intraoralPhotos);
    if (entries.length === 0) {
      Alert.alert(t('common.error'), t('messages.intraoral.noPhotoError') || 'Please capture at least one photo.');
      return;
    }
    setIntraoralVisible(false);
    setSending(true);
    try {
      for (const [key, asset] of entries) {
        const uri  = (asset as any).uri;
        const mime = (asset as any).mimeType || 'image/jpeg';
        const name = `intraoral_${key}_${Date.now()}.jpg`;
        const url  = await uploadAttachment(uri, mime, name, 'image');
        await sendMessage({ attachment_url: url, attachment_type: 'image' });
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Upload failed');
    } finally {
      setSending(false);
    }
  };

  const pickXray = async () => {
    if (sending) return;
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const uri = asset.uri;
    const mime = asset.mimeType || 'application/octet-stream';
    const name = asset.name || `xray_${Date.now()}`;
    const isImage = mime.startsWith('image/');

    setSending(true);
    try {
      const url = await uploadAttachment(uri, mime, name, isImage ? 'xray' : 'document');
      await sendMessage({ attachment_url: url, attachment_type: isImage ? 'xray' : 'document' });
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Upload failed');
      setSending(false);
    }
  };

  const flatData = groupByDate(messages);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerName} numberOfLines={1}>
            {decodeURIComponent(otherName || '')}
          </Text>
          {treatmentType ? (
            <Text style={styles.headerSub} numberOfLines={1}>
              {t(`treatmentPlan.proc.${treatmentType}`) || decodeURIComponent(treatmentType)}
            </Text>
          ) : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Legal warning banner */}
      <View style={styles.legalBanner}>
        <Text style={styles.legalText}>{t('offerChat.legalWarning')}</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={0}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => fetchMessages(false)}>
              <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={flatData}
            keyExtractor={(item, i) =>
              item.type === 'separator' ? `sep_${item.date}_${i}` : item.id
            }
            contentContainerStyle={styles.messageList}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyText}>{t('offerChat.noMessages')}</Text>
                <Text style={styles.emptySub}>{t('offerChat.noMessagesSub')}</Text>
              </View>
            }
            renderItem={({ item }) => {
              if (item.type === 'separator') {
                return (
                  <View style={styles.dateSeparator}>
                    <View style={styles.dateLine} />
                    <Text style={styles.dateText}>{item.date}</Text>
                    <View style={styles.dateLine} />
                  </View>
                );
              }
              const isMe = item.sender_role === myRole;
              const hasImage = item.attachment_url &&
                (item.attachment_type === 'image' || item.attachment_type === 'xray');
              const hasDoc   = item.attachment_url && item.attachment_type === 'document';

              return (
                <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowOther]}>
                  {!isMe && (
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {(item.sender_name || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                  <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
                    {!isMe && (
                      <Text style={styles.senderName}>{item.sender_name}</Text>
                    )}

                    {/* Attachment: image / x-ray */}
                    {hasImage && item.attachment_url && (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => Linking.openURL(item.attachment_url!).catch(() =>
                          Alert.alert('Hata', 'Fotoğraf açılamadı.')
                        )}
                      >
                        <View style={styles.attachImageWrap}>
                          <Image
                            source={{ uri: item.attachment_url }}
                            style={styles.attachImage}
                            resizeMode="cover"
                          />
                          {item.attachment_type === 'xray' && (
                            <View style={styles.xrayBadge}>
                              <Text style={styles.xrayBadgeText}>🩻 X-Ray</Text>
                            </View>
                          )}
                          {item.attachment_type === 'image' && (
                            <View style={styles.intraoralBadge}>
                              <Text style={styles.intraoralBadgeText}>📷 Intraoral</Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    )}

                    {/* Attachment: document / PDF */}
                    {hasDoc && item.attachment_url && (
                      <TouchableOpacity
                        style={[styles.docBubble, isMe && styles.docBubbleMe]}
                        onPress={() => Linking.openURL(item.attachment_url!).catch(() =>
                          Alert.alert('Hata', 'Dosya açılamadı.')
                        )}
                      >
                        <Text style={styles.docIcon}>📄</Text>
                        <Text style={[styles.docName, isMe && styles.docNameMe]} numberOfLines={2}>
                          {item.attachment_url.split('/').pop() || 'Document'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {item.text ? (
                      <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
                        {item.text}
                      </Text>
                    ) : null}

                    <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
                      {fmtTime(item.created_at)}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          {/* Gallery photo */}
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={pickIntraoral}
            disabled={sending}
          >
            <Text style={styles.attachBtnText}>📷</Text>
          </TouchableOpacity>

          {/* Camera — take intraoral photo */}
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={takeIntraoral}
            disabled={sending}
          >
            <Text style={styles.attachBtnText}>📸</Text>
          </TouchableOpacity>

          {/* X-ray / document */}
          <TouchableOpacity
            style={styles.attachBtn}
            onPress={pickXray}
            disabled={sending}
          >
            <Text style={styles.attachBtnText}>🩻</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={t('offerChat.inputPlaceholder')}
            placeholderTextColor="#9CA3AF"
            maxLength={500}
            multiline
            returnKeyType="send"
            onSubmitEditing={send}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!draft.trim() || sending}
          >
            {sending
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.sendBtnText}>↑</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Guided Intraoral Modal */}
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
    </SafeAreaView>
  );
}

// ─── Guided Intraoral Modal ────────────────────────────────────────────────────

function IntraoralModal({ visible, step, photos, onClose, onCapture, onNext, onPrev, onSubmit }: {
  visible: boolean;
  step: number;
  photos: Record<string, any>;
  onClose: () => void;
  onCapture: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSubmit: () => void;
}) {
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
          <Text style={im.title}>{t('messages.intraoral.title') || 'Intraoral Photos'}</Text>
          <Text style={im.badge}>{doneCount}/{PHOTO_STEP_KEYS.length}</Text>
        </View>

        {/* Progress dots */}
        <View style={im.dots}>
          {PHOTO_STEP_KEYS.map((st, i) => (
            <View
              key={st.key}
              style={[im.dot, i === step && im.dotActive, photos[st.key] && im.dotDone]}
            >
              <Text style={[im.dotText, i === step && im.dotTextActive]}>
                {photos[st.key] ? '✓' : String(i + 1)}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView contentContainerStyle={im.body} showsVerticalScrollIndicator={false}>
          <Text style={im.stepIcon}>{currentKey.icon}</Text>
          <Text style={im.stepLabel}>
            {t(`messages.intraoral.${currentKey.key}.label`) || currentKey.key}
          </Text>
          <Text style={im.stepInstruction}>
            {t(`messages.intraoral.${currentKey.key}.instruction`) || ''}
          </Text>

          {photo ? (
            <Image source={{ uri: photo.uri }} style={im.preview} resizeMode="cover" />
          ) : (
            <View style={im.placeholder}>
              <Text style={im.placeholderIcon}>📷</Text>
              <Text style={im.placeholderText}>{t('messages.intraoral.noPhoto') || 'No photo yet'}</Text>
            </View>
          )}

          <TouchableOpacity style={im.cameraBtn} onPress={onCapture} activeOpacity={0.85}>
            <Text style={im.cameraBtnText}>
              {photo
                ? (t('messages.intraoral.retake') || 'Retake')
                : (t('messages.intraoral.capture') || 'Take Photo')}
            </Text>
          </TouchableOpacity>

          <View style={im.navRow}>
            <TouchableOpacity
              style={[im.navBtn, step === 0 && im.navBtnOff]}
              onPress={onPrev}
              disabled={step === 0}
              activeOpacity={0.8}
            >
              <Text style={im.navBtnText}>{t('messages.intraoral.prev') || 'Back'}</Text>
            </TouchableOpacity>

            {step < PHOTO_STEP_KEYS.length - 1 ? (
              <TouchableOpacity style={im.navBtn} onPress={onNext} activeOpacity={0.8}>
                <Text style={im.navBtnText}>{t('messages.intraoral.next') || 'Next'}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[im.navBtn, im.submitBtn, doneCount === 0 && im.navBtnOff]}
                onPress={onSubmit}
                disabled={doneCount === 0}
                activeOpacity={0.85}
              >
                <Text style={[im.navBtnText, im.submitBtnText]}>
                  {(t('messages.intraoral.submit') || 'Send {count} Photos').replace('{count}', String(doneCount))}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={im.hint}>{t('messages.intraoral.hint') || ''}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const im = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  closeBtn:  { padding: 4 },
  closeText: { fontSize: 18, color: '#6B7280' },
  title:     { fontSize: 17, fontWeight: '800', color: '#111827' },
  badge:     { fontSize: 13, fontWeight: '700', color: '#2563EB' },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  dot: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6',
    borderWidth: 1.5, borderColor: '#E5E7EB',
    justifyContent: 'center', alignItems: 'center',
  },
  dotActive:     { backgroundColor: '#EFF6FF', borderColor: '#2563EB' },
  dotDone:       { backgroundColor: '#D1FAE5', borderColor: '#10B981' },
  dotText:       { fontSize: 12, fontWeight: '700', color: '#9CA3AF' },
  dotTextActive: { color: '#2563EB' },

  body:            { padding: 20, alignItems: 'center', gap: 14, paddingBottom: 40 },
  stepIcon:        { fontSize: 52 },
  stepLabel:       { fontSize: 22, fontWeight: '800', color: '#111827' },
  stepInstruction: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 },

  preview: { width: '100%', height: 230, borderRadius: 14, marginTop: 4 },
  placeholder: {
    width: '100%', height: 230, borderRadius: 14, backgroundColor: '#F8FAFC',
    borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  placeholderIcon: { fontSize: 40 },
  placeholderText: { fontSize: 14, color: '#9CA3AF' },

  cameraBtn:     { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
  cameraBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  navRow: { flexDirection: 'row', gap: 12, width: '100%' },
  navBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
  },
  navBtnOff:     { opacity: 0.35 },
  navBtnText:    { fontSize: 14, fontWeight: '600', color: '#374151' },
  submitBtn:     { backgroundColor: '#065F46', borderColor: '#10B981' },
  submitBtnText: { color: '#fff' },

  hint: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', lineHeight: 17 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backBtnText: { fontSize: 20, color: '#374151', fontWeight: '600' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 11, color: '#6B7280', marginTop: 1 },

  legalBanner: {
    backgroundColor: '#FEF3C7', paddingHorizontal: 14, paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: '#FDE68A',
  },
  legalText: { fontSize: 11, color: '#92400E', textAlign: 'center', lineHeight: 16 },

  messageList: { paddingHorizontal: 12, paddingVertical: 16, flexGrow: 1 },

  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 44, marginBottom: 10 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#374151', marginBottom: 4 },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 24 },

  dateSeparator: {
    flexDirection: 'row', alignItems: 'center', marginVertical: 12, gap: 8,
  },
  dateLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dateText: { fontSize: 11, color: '#9CA3AF', fontWeight: '600' },

  bubbleRow: { flexDirection: 'row', marginBottom: 10, alignItems: 'flex-end' },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubbleRowOther: { justifyContent: 'flex-start' },

  avatar: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: '#DBEAFE',
    alignItems: 'center', justifyContent: 'center', marginRight: 6,
  },
  avatarText: { fontSize: 12, fontWeight: '700', color: '#1D4ED8' },

  bubble: {
    maxWidth: '75%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8,
  },
  bubbleMe: { backgroundColor: '#2563EB', borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: '#fff', borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  senderName: { fontSize: 10, fontWeight: '700', color: '#6B7280', marginBottom: 3 },
  bubbleText: { fontSize: 14, color: '#111827', lineHeight: 20 },
  bubbleTextMe: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: '#9CA3AF', marginTop: 4, textAlign: 'right' },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.7)' },

  // Attachment: image / xray
  attachImageWrap: { position: 'relative', marginBottom: 6, borderRadius: 10, overflow: 'hidden' },
  attachImage: { width: 200, height: 150, borderRadius: 10 },
  xrayBadge: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  xrayBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  intraoralBadge: {
    position: 'absolute', bottom: 6, left: 6,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  intraoralBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  // Attachment: document
  docBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F3F4F6', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6,
    borderWidth: 1, borderColor: '#E5E7EB', maxWidth: 220,
  },
  docBubbleMe: { backgroundColor: 'rgba(255,255,255,0.15)', borderColor: 'rgba(255,255,255,0.2)' },
  docIcon: { fontSize: 22 },
  docName: { flex: 1, fontSize: 12, color: '#374151' },
  docNameMe: { color: '#fff' },

  // Input bar
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 6,
    backgroundColor: '#fff', paddingHorizontal: 8, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  attachBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
  attachBtnText: { fontSize: 20 },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 9, fontSize: 14, color: '#111827',
    backgroundColor: '#F9FAFB', maxHeight: 100,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#D1D5DB' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 22 },

  errorText: { color: '#991B1B', fontSize: 14 },
  retryBtn: { backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  retryBtnText: { color: '#fff', fontWeight: '700' },
});
