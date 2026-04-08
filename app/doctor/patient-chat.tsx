// app/doctor/patient-chat.tsx — Doctor ↔ Patient messaging (no tab bar)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, SafeAreaView, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { API_BASE } from '../../lib/api';

interface Message {
  id: string;
  text: string;
  from: 'PATIENT' | 'CLINIC' | 'DOCTOR' | string;
  createdAt: number;
  senderName?: string;
}

const POLL_MS = 6000;

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
  const [sending, setSending]   = useState(false);

  const flatRef   = useRef<FlatList>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Fetch messages ────────────────────────────────────────────
  const fetchMessages = useCallback(async (silent = false) => {
    if (!user?.token || !patientId) return;
    if (!silent) setLoading(true);
    try {
      const res  = await fetch(
        `${API_BASE}/api/patient/${encodeURIComponent(patientId)}/messages`,
        { headers: { Authorization: `Bearer ${user.token}` } },
      );
      const json = await res.json().catch(() => ({}));
      if (json.ok && Array.isArray(json.messages)) {
        setMessages(json.messages.map((m: any) => ({
          id:         m.id || String(m.createdAt || Math.random()),
          text:       m.text || m.content || m.message || '',
          from:       m.from || m.senderRole || 'CLINIC',
          createdAt:  m.createdAt || m.created_at
            ? new Date(m.createdAt || m.created_at).getTime()
            : Date.now(),
          senderName: m.senderName || m.sender_name,
        })));
      }
    } catch (err: any) {
      console.error('[DR CHAT fetch]', err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.token, patientId]);

  // Initial load + polling
  useEffect(() => {
    fetchMessages();
    pollTimer.current = setInterval(() => fetchMessages(true), POLL_MS);
    return () => { if (pollTimer.current) clearInterval(pollTimer.current); };
  }, [fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 120);
    }
  }, [messages.length]);

  // ── Send message ──────────────────────────────────────────────
  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !user?.token || !patientId) return;
    setSending(true);
    setText('');

    try {
      const res = await fetch(
        `${API_BASE}/api/patient/${encodeURIComponent(patientId)}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed, from: 'CLINIC' }),
        },
      );
      const json = await res.json().catch(() => ({}));
      if (json.ok) {
        fetchMessages(true);
      } else {
        Alert.alert('Hata', json.error || 'Mesaj gönderilemedi.');
        setText(trimmed);
      }
    } catch (err: any) {
      Alert.alert('Hata', 'Ağ hatası. Lütfen tekrar deneyin.');
      setText(trimmed);
      console.error('[DR CHAT send]', err.message);
    } finally {
      setSending(false);
    }
  };

  // ── Render message bubble ─────────────────────────────────────
  const renderItem = ({ item }: { item: Message }) => {
    const isDoctor = item.from === 'CLINIC' || item.from === 'DOCTOR' || item.from === 'admin';
    const timeStr  = new Date(item.createdAt).toLocaleTimeString('tr-TR', {
      hour: '2-digit', minute: '2-digit',
    });
    return (
      <View style={[styles.bubble, isDoctor ? styles.bubbleDoctor : styles.bubblePatient]}>
        {!isDoctor && item.senderName && (
          <Text style={styles.bubbleSender}>{item.senderName}</Text>
        )}
        <Text style={[styles.bubbleText, isDoctor && styles.bubbleTextDoctor]}>
          {item.text}
        </Text>
        <Text style={[styles.bubbleTime, isDoctor && styles.bubbleTimeDoctor]}>{timeStr}</Text>
      </View>
    );
  };

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

      {/* Messages */}
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} size="large" color="#2563EB" />
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyText}>Henüz mesaj yok</Text>
            </View>
          }
        />
      )}

      {/* Input bar */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
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
