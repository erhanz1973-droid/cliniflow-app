// app/offer-chat.tsx — Offer-based messaging between patient and doctor
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/language-context';
import { API_BASE } from '../lib/api';

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

  const myRole = user?.type === 'doctor' ? 'doctor' : 'patient';

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
    fetchMessages(false).then(() => setLoading(false));
  }, [fetchMessages]);

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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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

  const takeIntraoral = async () => {
    if (sending) return;
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(t('common.error'), 'Camera permission required');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const uri = asset.uri;
    const mime = asset.mimeType || 'image/jpeg';
    const name = asset.fileName || `intraoral_cam_${Date.now()}.jpg`;

    setSending(true);
    try {
      const url = await uploadAttachment(uri, mime, name, 'image');
      await sendMessage({ attachment_url: url, attachment_type: 'image' });
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || 'Upload failed');
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
                    )}

                    {/* Attachment: document / PDF */}
                    {hasDoc && item.attachment_url && (
                      <TouchableOpacity
                        style={[styles.docBubble, isMe && styles.docBubbleMe]}
                        onPress={() => Alert.alert('File', item.attachment_url!)}
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
    </SafeAreaView>
  );
}

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
