// app/offer-chat.tsx — Offer-based messaging between patient and doctor
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/language-context';
import { API_BASE } from '../lib/api';

type Message = {
  id: string;
  sender_id: string;
  sender_role: 'patient' | 'doctor';
  sender_name: string;
  text: string;
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

// Group messages by date for day separators
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
  // Flatten to FlatList data with separators
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

  // params: offerId, otherName (doctor or patient name), treatmentType
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

  // Initial load
  useEffect(() => {
    fetchMessages(false).then(() => setLoading(false));
  }, [fetchMessages]);

  // Polling every 5s
  useEffect(() => {
    pollRef.current = setInterval(() => fetchMessages(true), 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMessages]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !user?.token || !offerId) return;
    if (text.length > 500) {
      Alert.alert(t('common.error'), t('offerChat.tooLong'));
      return;
    }

    // Optimistic update
    const optimistic: Message = {
      id: `opt_${Date.now()}`,
      sender_id: user.id || '',
      sender_role: myRole,
      sender_name: user.name || (myRole === 'doctor' ? 'Dr.' : t('offerChat.you')),
      text,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setDraft('');
    setSending(true);

    try {
      const res = await fetch(`${API_BASE}/api/offer-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ offer_id: offerId, text }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'error');
      // Replace optimistic with real message
      setMessages(prev =>
        prev.map(m => m.id === optimistic.id ? { ...data.message, sender_name: optimistic.sender_name } : m)
      );
    } catch (e: any) {
      // Rollback optimistic
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      Alert.alert(t('common.error'), e.message || t('common.error'));
    } finally {
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
                    <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
                      {item.text}
                    </Text>
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
  bubbleMe: {
    backgroundColor: '#2563EB',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  senderName: { fontSize: 10, fontWeight: '700', color: '#6B7280', marginBottom: 3 },
  bubbleText: { fontSize: 14, color: '#111827', lineHeight: 20 },
  bubbleTextMe: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: '#9CA3AF', marginTop: 4, textAlign: 'right' },
  bubbleTimeMe: { color: 'rgba(255,255,255,0.7)' },

  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
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
