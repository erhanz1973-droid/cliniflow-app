// app/doctor/patient-chat.tsx — Doctor ↔ Patient messaging (no tab bar)
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import type { Socket } from 'socket.io-client';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Alert,
  type ListRenderItemInfo,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { API_BASE } from '../../lib/api';
import { subscribePrimaryChatRealtime, waitOnceSocketConnected } from '../../lib/chatRealtime';

interface Message {
  id: string;
  text: string;
  from: 'PATIENT' | 'CLINIC' | 'DOCTOR' | string;
  createdAt: number;
  senderName?: string;
  pending?: boolean;
  thread_id?: string;
}

export default function DoctorPatientChatScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { patientId, patientName } = useLocalSearchParams<{
    patientId?: string;
    patientName?: string;
  }>();

  const displayName = patientName ? decodeURIComponent(patientName) : 'Hasta';

  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText]         = useState('');
  const [loading, setLoading]   = useState(true);
  const [sending, setSending] = useState(false);
  const [leadThreadId, setLeadThreadId] = useState<string | null>(null);

  const flatRef = useRef<FlatList>(null);
  const chatSocketRef = useRef<Socket | null>(null);
  const patientRouteKeyRef = useRef("");

  // ── Fetch messages ────────────────────────────────────────────
  const fetchMessages = useCallback(async (silent = false) => {
    if (!user?.token || !patientId) return;
    if (!silent) setLoading(true);
    try {
      const res  = await fetch(
        `${API_BASE}/api/doctor/patient/${encodeURIComponent(patientId)}/messages`,
        { headers: { Authorization: `Bearer ${user.token}` } },
      );
      const json = await res.json().catch(() => ({}));
      const laRaw = json.leadAssignment;
      const tid =
        laRaw && typeof laRaw === "object" && (laRaw as { threadId?: string }).threadId != null
          ? String((laRaw as { threadId?: string }).threadId).trim()
          : "";
      setLeadThreadId(tid || null);
      if (__DEV__) {
        console.log(
          "[DR-CHAT] leadAssignment.threadId (must match patient's thread — same UUID for SOCKET room chat:{tid})",
          tid || "(none)",
        );
      }
      if (json.ok && Array.isArray(json.messages)) {
        const mapped = json.messages.map((m: any) => {
          const threadIdRaw = m.thread_id ?? m.threadId;
          const thread_id =
            threadIdRaw != null && String(threadIdRaw).trim() !== ""
              ? String(threadIdRaw).trim()
              : undefined;
          return {
            id:         m.id || String(m.createdAt || Math.random()),
            text:       m.text || m.content || m.message || '',
            from:       m.from || m.senderRole || 'CLINIC',
            createdAt:  m.createdAt || m.created_at
              ? new Date(m.createdAt || m.created_at).getTime()
              : Date.now(),
            senderName: m.senderName || m.sender_name,
            ...(thread_id ? { thread_id } : {}),
          };
        });
        const sorted = [...mapped].sort((a, b) => a.createdAt - b.createdAt);
        setMessages(sorted.slice(-50));
      }
    } catch (err: any) {
      console.error('[DR CHAT fetch]', err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.token, patientId]);

  const resolvedThreadId = useMemo(() => {
    const la = leadThreadId != null ? String(leadThreadId).trim() : '';
    const firstWith = messages.find((m) => (m.thread_id ?? '').trim() !== '');
    const fromMsg = firstWith?.thread_id != null ? String(firstWith.thread_id).trim() : '';
    return la || fromMsg;
  }, [leadThreadId, messages]);

  useEffect(() => {
    const k = String(patientId ?? "").trim();
    if (patientRouteKeyRef.current === k) return;
    patientRouteKeyRef.current = k;
    setMessages([]);
    setLeadThreadId(null);
  }, [patientId]);

  useEffect(() => {
    if (!user?.token || !patientId) return;
    void fetchMessages(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sadece token/patientId değişince ilk yükleme
  }, [user?.token, patientId]);

  useEffect(() => {
    if (!user?.token) {
      return () => {};
    }

    if (loading) {
      return () => {};
    }

    const tid = resolvedThreadId.trim();
    if (!tid) {
      console.log('NO THREAD ID YET');
      return () => {};
    }

    console.log('START REALTIME SOCKET:', tid);
    const { unsubscribe, socket } = subscribePrimaryChatRealtime({
      token: user.token,
      threadId: tid,
      onNewMessage: (legacy) => {
        const id = String(legacy.id || "").trim();
        if (!id) return;
        setMessages((prev) => {
          if (prev.find((m) => m.id === id)) return prev;
          const text = String(legacy.text || '');
          const withoutPending = prev.filter(
            (m) =>
              !(m.pending && String(m.from).toUpperCase() === 'CLINIC' && m.text === text),
          );
          const fromRaw = String(legacy.from || "").toUpperCase();
          const from = fromRaw === 'PATIENT' ? 'PATIENT' : 'CLINIC';
          const tidLegacy = legacy.thread_id ?? legacy.threadId;
          const thread_id =
            tidLegacy != null && String(tidLegacy).trim() !== ''
              ? String(tidLegacy).trim()
              : undefined;
          const row: Message = {
            id,
            text,
            from,
            createdAt: typeof legacy.createdAt === 'number' ? legacy.createdAt : Date.now(),
            senderName: undefined,
            ...(thread_id ? { thread_id } : {}),
          };
          const next = [...withoutPending, row].sort((a, b) => a.createdAt - b.createdAt);
          return next.slice(-50);
        });
      },
      onConnect: () => {},
      onDisconnect: () => {},
    });
    chatSocketRef.current = socket;
    return () => {
      unsubscribe();
      chatSocketRef.current = null;
    };
  }, [user?.token, loading, resolvedThreadId]);

  // Inverted liste: alt (yeni) tarafa kaydır
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToOffset({ offset: 0, animated: true }), 120);
    }
  }, [messages.length]);

  // ── Send message ──────────────────────────────────────────────
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !user?.token || !patientId) return;

    const optimisticId = `tmp-${Date.now()}`;
    setMessages((prev) =>
      [...prev, {
          id: optimisticId,
          text: trimmed,
          from: 'CLINIC' as const,
          createdAt: Date.now(),
          pending: true,
      }].sort((a, b) => a.createdAt - b.createdAt).slice(-50),
    );
    setText('');
    setSending(true);

    try {
      const s = chatSocketRef.current;
      if (s && !s.connected) {
        await waitOnceSocketConnected(s);
      }

      const res = await fetch(
        `${API_BASE}/api/messages/${encodeURIComponent(patientId)}/reply`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!json.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        Alert.alert('Hata', json.error || 'Mesaj gönderilemedi.');
        setText(trimmed);
      }
    } catch (err: any) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      Alert.alert('Hata', 'Ağ hatası. Lütfen tekrar deneyin.');
      setText(trimmed);
      console.error('[DR CHAT send]', err.message);
    } finally {
      setSending(false);
    }
  };

  const renderDoctorMessageItem = useCallback(
    ({ item }: ListRenderItemInfo<Message>) => <MessageItem message={item} />,
    [],
  );

  const doctorMessageKeyExtractor = useCallback((item: Message) => {
    const id = String(item.id ?? '').trim();
    if (id !== '') return id;
    return `fb-${item.createdAt}-${item.from}`;
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerMid}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarChar}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.headerName} numberOfLines={1}>{displayName}</Text>
            <Text style={styles.headerSub}>Mesajlar</Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {loading ? (
          <ActivityIndicator style={{ flex: 1 }} size="large" color="#2563EB" />
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={doctorMessageKeyExtractor}
            contentContainerStyle={styles.listContent}
            renderItem={renderDoctorMessageItem}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            inverted
            maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            onContentSizeChange={() =>
              flatRef.current?.scrollToOffset({ offset: 0, animated: false })
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyText}>Henüz mesaj yok</Text>
              </View>
            }
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Mesajınızı yazın…"
            placeholderTextColor="#9CA3AF"
            multiline
            maxLength={1000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
          >
            {sending
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.sendBtnText}>Gönder</Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn:  { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 22, color: '#111827' },
  headerMid:{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center',
  },
  avatarChar:  { fontSize: 16, fontWeight: '700', color: '#2563EB' },
  headerName:  { fontSize: 15, fontWeight: '700', color: '#111827', maxWidth: 180 },
  headerSub:   { fontSize: 11, color: '#6B7280' },

  // List
  listContent: { padding: 14, paddingBottom: 8, flexGrow: 1 },

  bubble: {
    maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9,
    marginBottom: 8,
  },
  bubblePatient: {
    backgroundColor: '#fff', alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    ...Platform.select({
      ios:     { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
      android: { elevation: 1 },
    }),
  },
  bubbleDoctor: {
    backgroundColor: '#2563EB', alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleSender:    { fontSize: 11, color: '#6B7280', marginBottom: 3, fontWeight: '600' },
  bubbleText:      { fontSize: 15, color: '#111827', lineHeight: 21 },
  bubbleTextDoctor:{ color: '#fff' },
  bubbleTime:      { fontSize: 10, color: '#9CA3AF', marginTop: 4, alignSelf: 'flex-end' },
  bubbleTimeDoctor:{ color: 'rgba(255,255,255,0.65)' },

  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyIcon:{ fontSize: 48 },
  emptyText:{ fontSize: 15, color: '#9CA3AF' },

  // Input
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  input: {
    flex: 1, backgroundColor: '#F9FAFB',
    borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: '#111827',
    borderWidth: 1, borderColor: '#E5E7EB',
    maxHeight: 120,
  },
  sendBtn:         { backgroundColor: '#2563EB', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 12 },
  sendBtnDisabled: { backgroundColor: '#93C5FD' },
  sendBtnText:     { color: '#fff', fontWeight: '700', fontSize: 14 },
});

const MessageItem = React.memo(
  function MessageItem({ message }: { message: Message }) {
    const isDoctor =
      message.from === 'CLINIC' ||
      message.from === 'DOCTOR' ||
      message.from === 'admin';
    const timeStr = new Date(message.createdAt).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      <View
        style={[
          styles.bubble,
          isDoctor ? styles.bubbleDoctor : styles.bubblePatient,
        ]}
      >
        {!isDoctor && message.senderName ? (
          <Text style={styles.bubbleSender}>{message.senderName}</Text>
        ) : null}
        <Text style={[styles.bubbleText, isDoctor && styles.bubbleTextDoctor]}>
          {message.text}
        </Text>
        <Text
          style={[styles.bubbleTime, isDoctor && styles.bubbleTimeDoctor]}
        >
          {timeStr}
        </Text>
      </View>
    );
  },
  (prev, next) => prev.message === next.message,
);

