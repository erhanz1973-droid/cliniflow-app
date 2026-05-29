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
  Alert,
  InteractionManager,
  type ListRenderItemInfo,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useDeferredFocusRefresh } from '../../../hooks/use-deferred-focus-refresh';
import { focusPerfMark, focusPerfStart } from '../../../lib/perfFocus';
import { useAuthSession } from '../../../lib/auth';
import { useLanguage } from '../../../lib/language-context';
import { API_BASE, setAuthToken } from '../../../lib/api';
import { invalidateDoctorMessagingCache } from '../../../lib/doctorMessaging';
import { markDoctorPatientMessagesRead } from '../../../lib/markChatRead';
import { setGlobalDoctorChatPatientIdOpen } from '../../../lib/doctorChatForeground';
import { subscribePrimaryChatRealtime, waitOnceSocketConnected } from '../../../lib/chatRealtime';
import { markPatientChatNav } from '../../../lib/patientChatNavPerf';
import { logCanonicalSendAttempt } from '../../../lib/canonicalChatDiagnostics';
import {
  type DoctorChatMessage,
  hydratePatientChatFromDisk,
  mapApiMessages,
  parseLeadAssignment,
  peekPatientChatCache,
  persistPatientChatCache,
} from '../../../lib/doctorPatientChatCache';
import {
  fetchDoctorAiCoordination,
  resumeDoctorAiForPatient,
  snoozeDoctorAiForPatient,
  snoozeRemainingLabel,
  type DoctorAiCoordinationState,
} from '../../../lib/doctorAiSnooze';

function applySnapshot(
  snapshot: { messages: DoctorChatMessage[]; leadThreadId: string | null; enrolledSharedCare: boolean },
  setters: {
    setMessages: (m: DoctorChatMessage[]) => void;
    setLeadThreadId: (id: string | null) => void;
    setEnrolledSharedCare: (v: boolean) => void;
  }
) {
  setters.setMessages(snapshot.messages);
  setters.setLeadThreadId(snapshot.leadThreadId);
  setters.setEnrolledSharedCare(snapshot.enrolledSharedCare);
}

export default function DoctorPatientChatScreen() {
  const router = useRouter();
  const { token } = useAuthSession();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const { patientId, patientName, sourceOfferId } = useLocalSearchParams<{
    patientId?: string;
    patientName?: string;
    sourceOfferId?: string;
  }>();
  const archivedOfferId = String(
    Array.isArray(sourceOfferId) ? sourceOfferId[0] : sourceOfferId ?? '',
  ).trim();

  const displayName = patientName ? decodeURIComponent(patientName) : 'Hasta';
  const patientKey = String(patientId ?? '').trim();
  const initialSnapshot = patientKey ? peekPatientChatCache(patientKey) : null;

  const [messages, setMessages] = useState<DoctorChatMessage[]>(initialSnapshot?.messages ?? []);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(!(initialSnapshot?.messages?.length));
  const [silentRefreshing, setSilentRefreshing] = useState(false);
  const hasDisplayedContentRef = useRef((initialSnapshot?.messages?.length ?? 0) > 0);
  const firstPaintMarkedRef = useRef(false);
  /** Snap to newest message on open / after fetch — not on silent poll while scrolled up. */
  const pendingScrollToLatestRef = useRef(true);
  const isAtBottomRef = useRef(true);
  const lastScrollSnapAtRef = useRef(0);
  const [sending, setSending] = useState(false);
  const [leadThreadId, setLeadThreadId] = useState<string | null>(initialSnapshot?.leadThreadId ?? null);
  const [enrolledSharedCare, setEnrolledSharedCare] = useState(
    initialSnapshot?.enrolledSharedCare ?? false
  );
  const [aiCoord, setAiCoord] = useState<DoctorAiCoordinationState | null>(null);
  const [aiSnoozeBusy, setAiSnoozeBusy] = useState(false);
  const [snoozeTick, setSnoozeTick] = useState(0);

  const flatRef = useRef<FlatList>(null);
  const chatSocketRef = useRef<Socket | null>(null);
  const patientRouteKeyRef = useRef('');

  const markFirstPaint = useCallback((source: string) => {
    if (firstPaintMarkedRef.current) return;
    firstPaintMarkedRef.current = true;
    focusPerfMark('doctor:patient-chat:first_paint', { source });
    markPatientChatNav('first_frame', { patientId: patientKey.slice(0, 12) });
  }, [patientKey]);

  const scrollToLatest = useCallback((opts?: { force?: boolean }) => {
    if (!flatRef.current || messages.length === 0) return;
    if (!opts?.force && !pendingScrollToLatestRef.current && !isAtBottomRef.current) return;
    const now = Date.now();
    if (now - lastScrollSnapAtRef.current < 48) return;
    lastScrollSnapAtRef.current = now;
    pendingScrollToLatestRef.current = false;
    requestAnimationFrame(() => {
      flatRef.current?.scrollToOffset({ offset: 0, animated: false });
    });
  }, [messages.length]);

  const persistSnapshot = useCallback(
    (next: {
      messages: DoctorChatMessage[];
      leadThreadId: string | null;
      enrolledSharedCare: boolean;
    }) => {
      if (!patientKey) return;
      persistPatientChatCache(patientKey, next);
    },
    [patientKey]
  );

  const fetchMessages = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!token || !patientId) return;
      const silent = opts?.silent === true;
      if (!silent && !hasDisplayedContentRef.current) setLoading(true);
      if (silent) setSilentRefreshing(true);

      const endFetch = focusPerfStart(
        silent ? 'doctor:patient-chat:fetch-silent' : 'doctor:patient-chat:fetch'
      );
      setAuthToken(token);
      try {
        const res = await fetch(
          `${API_BASE}/api/doctor/patient/${encodeURIComponent(patientId)}/messages?limit=250`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        const meta = parseLeadAssignment(json);
        setLeadThreadId(meta.leadThreadId);
        setEnrolledSharedCare(meta.enrolledSharedCare);

        if (__DEV__) {
          console.log(
            '[DR-CHAT] leadAssignment.threadId',
            meta.leadThreadId || '(none)'
          );
        }

        const canonicalPid = String(json.canonicalPatientId || patientId || '').trim();

        if (json.ok && Array.isArray(json.messages)) {
          const slice = mapApiMessages(json.messages as Record<string, unknown>[]);
          if (__DEV__ && json.unifiedThread) {
            console.log('[DR-CHAT] unified thread', {
              canonicalPatientId: canonicalPid.slice(0, 12),
              offerArchiveCount: json.offerArchiveCount,
              total: slice.length,
            });
          }
          setMessages(slice);
          hasDisplayedContentRef.current = slice.length > 0 || hasDisplayedContentRef.current;
          persistSnapshot({
            messages: slice,
            leadThreadId: meta.leadThreadId,
            enrolledSharedCare: meta.enrolledSharedCare,
          });
          focusPerfMark('doctor:patient-chat:data_ready', { count: slice.length, silent });
          if (slice.length > 0 && (!silent || isAtBottomRef.current)) {
            pendingScrollToLatestRef.current = true;
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[DR CHAT fetch]', msg);
      } finally {
        setLoading(false);
        setSilentRefreshing(false);
        endFetch();
      }
    },
    [token, patientId, patientKey, persistSnapshot]
  );

  useEffect(() => {
    setGlobalDoctorChatPatientIdOpen(patientId);
    return () => setGlobalDoctorChatPatientIdOpen(null);
  }, [patientId]);

  useEffect(() => {
    if (initialSnapshot?.messages?.length) {
      focusPerfMark('doctor:patient-chat:data_ready', {
        count: initialSnapshot.messages.length,
        source: 'memory',
      });
    }
  }, [initialSnapshot]);

  useEffect(() => {
    const k = String(patientId ?? '').trim();
    if (patientRouteKeyRef.current === k) return;
    patientRouteKeyRef.current = k;
    firstPaintMarkedRef.current = false;

    const snap = k ? peekPatientChatCache(k) : null;
    if (snap) {
      applySnapshot(snap, { setMessages, setLeadThreadId, setEnrolledSharedCare });
      hasDisplayedContentRef.current = snap.messages.length > 0;
      setLoading(false);
      pendingScrollToLatestRef.current = snap.messages.length > 0;
      isAtBottomRef.current = true;
    } else {
      setMessages([]);
      setLeadThreadId(null);
      setEnrolledSharedCare(false);
      hasDisplayedContentRef.current = false;
      setLoading(true);
      pendingScrollToLatestRef.current = true;
      isAtBottomRef.current = true;
    }

    if (!k) return;
    let cancelled = false;
    void hydratePatientChatFromDisk(k).then((disk) => {
      if (cancelled || !disk?.messages?.length) return;
      if (!hasDisplayedContentRef.current) {
        applySnapshot(disk, { setMessages, setLeadThreadId, setEnrolledSharedCare });
        hasDisplayedContentRef.current = true;
        setLoading(false);
        pendingScrollToLatestRef.current = true;
        isAtBottomRef.current = true;
        focusPerfMark('doctor:patient-chat:data_ready', {
          count: disk.messages.length,
          source: 'disk',
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  useEffect(() => {
    if (!token || !patientId) return;
    const task = InteractionManager.runAfterInteractions(() => {
      void fetchMessages({ silent: hasDisplayedContentRef.current });
    });
    return () => task.cancel?.();
  }, [token, patientId, fetchMessages]);

  useDeferredFocusRefresh(
    'doctor:patient-chat:focus',
    () => fetchMessages({ silent: true }),
    { enabled: !!token && !!patientId, minIntervalMs: 50_000 }
  );

  const refreshAiCoordination = useCallback(async () => {
    if (!token || !patientKey) return;
    const state = await fetchDoctorAiCoordination(token, patientKey);
    if (state) setAiCoord(state);
  }, [token, patientKey]);

  useFocusEffect(
    useCallback(() => {
      if (!token || !patientId) return;
      void markDoctorPatientMessagesRead(token, patientId);
      void refreshAiCoordination();
      pendingScrollToLatestRef.current = true;
      isAtBottomRef.current = true;
      const task = InteractionManager.runAfterInteractions(() => {
        scrollToLatest({ force: true });
      });
      return () => task.cancel?.();
    }, [token, patientId, scrollToLatest, refreshAiCoordination]),
  );

  useEffect(() => {
    if (!aiCoord?.aiSnoozeActive || !aiCoord.aiSnoozedUntil) return;
    const id = setInterval(() => {
      const untilMs = Date.parse(aiCoord.aiSnoozedUntil || '');
      if (!Number.isFinite(untilMs) || Date.now() >= untilMs) {
        void refreshAiCoordination();
      }
      setSnoozeTick((n) => n + 1);
    }, 15_000);
    return () => clearInterval(id);
  }, [aiCoord?.aiSnoozeActive, aiCoord?.aiSnoozedUntil, refreshAiCoordination]);

  const handleResumeAi = useCallback(async () => {
    if (!token || !patientKey || aiSnoozeBusy) return;
    setAiSnoozeBusy(true);
    try {
      const result = await resumeDoctorAiForPatient(token, patientKey);
      if (!result.ok) {
        Alert.alert('AI devam', result.message || 'İşlem başarısız.');
        return;
      }
      if (result.state) setAiCoord(result.state);
      else await refreshAiCoordination();
    } catch (e) {
      Alert.alert('AI devam', e instanceof Error ? e.message : 'Ağ hatası');
    } finally {
      setAiSnoozeBusy(false);
    }
  }, [token, patientKey, aiSnoozeBusy, refreshAiCoordination]);

  const handleSnoozeAi = useCallback(async () => {
    if (!token || !patientKey || aiSnoozeBusy) return;
    setAiSnoozeBusy(true);
    try {
      const result = await snoozeDoctorAiForPatient(token, patientKey, 5);
      if (!result.ok) {
        Alert.alert('AI susturma', result.message || 'İşlem başarısız.');
        return;
      }
      if (result.state) setAiCoord(result.state);
      else await refreshAiCoordination();
    } catch (e) {
      Alert.alert('AI susturma', e instanceof Error ? e.message : 'Ağ hatası');
    } finally {
      setAiSnoozeBusy(false);
    }
  }, [token, patientKey, aiSnoozeBusy, refreshAiCoordination]);

  const snoozeRemaining = useMemo(() => {
    void snoozeTick;
    return snoozeRemainingLabel(aiCoord?.aiSnoozedUntil ?? null);
  }, [aiCoord?.aiSnoozedUntil, snoozeTick]);

  const resolvedThreadId = useMemo(() => {
    const la = leadThreadId != null ? String(leadThreadId).trim() : '';
    const firstWith = messages.find((m) => (m.thread_id ?? '').trim() !== '');
    const fromMsg = firstWith?.thread_id != null ? String(firstWith.thread_id).trim() : '';
    return la || fromMsg;
  }, [leadThreadId, messages]);

  useEffect(() => {
    if (!token) return () => {};

    const tid = resolvedThreadId.trim();
    if (!tid) return () => {};

    const { unsubscribe, socket } = subscribePrimaryChatRealtime({
      token,
      threadId: tid,
      onNewMessage: (legacy) => {
        const id = String(legacy.id || '').trim();
        if (!id) return;
        setMessages((prev) => {
          if (prev.find((m) => m.id === id)) return prev;
          const textMsg = String(legacy.text || '');
          const withoutPending = prev.filter(
            (m) =>
              !(m.pending && String(m.from).toUpperCase() === 'CLINIC' && m.text === textMsg)
          );
          const fromRaw = String(legacy.from || '').toUpperCase();
          const from = fromRaw === 'PATIENT' ? 'PATIENT' : 'CLINIC';
          const tidLegacy = legacy.thread_id ?? legacy.threadId;
          const thread_id =
            tidLegacy != null && String(tidLegacy).trim() !== ''
              ? String(tidLegacy).trim()
              : undefined;
          const row: DoctorChatMessage = {
            id,
            text: textMsg,
            from,
            createdAt: typeof legacy.createdAt === 'number' ? legacy.createdAt : Date.now(),
            ...(thread_id ? { thread_id } : {}),
          };
          const next = [...withoutPending, row].sort((a, b) => a.createdAt - b.createdAt).slice(-50);
          if (patientKey) {
            persistSnapshot({
              messages: next,
              leadThreadId: tid,
              enrolledSharedCare,
            });
          }
          if (isAtBottomRef.current) pendingScrollToLatestRef.current = true;
          return next;
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
  }, [token, resolvedThreadId, patientKey, enrolledSharedCare, persistSnapshot]);

  useEffect(() => {
    if (messages.length === 0) return;
    const task = InteractionManager.runAfterInteractions(() => {
      scrollToLatest();
    });
    return () => task.cancel?.();
  }, [messages, scrollToLatest]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending || !token || !patientId) return;

    const optimisticId = `tmp-${Date.now()}`;
    pendingScrollToLatestRef.current = true;
    isAtBottomRef.current = true;
    setMessages((prev) =>
      [
        ...prev,
        {
          id: optimisticId,
          text: trimmed,
          from: 'CLINIC' as const,
          createdAt: Date.now(),
          pending: true,
        },
      ]
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(-50)
    );
    setText('');
    setSending(true);

    logCanonicalSendAttempt({
      source: 'doctor/patient-chat',
      canonical_chat_type: 'patient',
      resolved_thread_kind: 'patient_chat',
      resolved_patient_id: String(patientId),
      resolved_offer_id: archivedOfferId || null,
      resolved_offer_archived: Boolean(archivedOfferId),
      enrolled: enrolledSharedCare,
    });

    try {
      const s = chatSocketRef.current;
      if (s && !s.connected) {
        await waitOnceSocketConnected(s);
      }

      const res = await fetch(
        `${API_BASE}/api/messages/${encodeURIComponent(patientId)}/reply`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!json.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        const serverMsg =
          typeof json.message === 'string' && json.message.trim() !== ''
            ? String(json.message).trim()
            : typeof json.detail === 'string'
              ? json.detail
              : json.error === 'assigned_doctor_only'
                ? 'Bu hasta artık kliniğinize üyedir ve yalnızca atanmış doktor ile mesajlaşabilir.'
                : String(json.error || 'Mesaj gönderilemedi.');
        const alertTitle = json.error === 'assigned_doctor_only' ? 'Bilgilendirme' : 'Hata';
        Alert.alert(alertTitle, serverMsg);
        setText(trimmed);
      } else {
        const leg = json.legacyMessage;
        if (leg && typeof leg === 'object') {
          const id = String(leg.id || '').trim();
          const textOut = String(leg.text ?? leg.message ?? '').trim();
          const fromRaw = String(leg.from || '').toUpperCase();
          const from = fromRaw === 'PATIENT' ? 'PATIENT' : 'CLINIC';
          const createdAt =
            typeof leg.createdAt === 'number'
              ? leg.createdAt
              : leg.created_at
                ? new Date(leg.created_at).getTime()
                : Date.now();
          const confirmSent = (confirmedId: string) => {
            setMessages((prev) => {
              const withoutOpt = prev.filter((m) => m.id !== optimisticId);
              if (withoutOpt.some((m) => m.id === confirmedId)) return withoutOpt;
              const tidRaw = leg.thread_id ?? leg.threadId;
              const thread_id =
                tidRaw != null && String(tidRaw).trim() !== ''
                  ? String(tidRaw).trim()
                  : undefined;
              const senderName =
                leg.senderName != null
                  ? String(leg.senderName)
                  : leg.sender_name != null
                    ? String(leg.sender_name)
                    : undefined;
              const next = [
                ...withoutOpt,
                {
                  id: confirmedId,
                  text: textOut || trimmed,
                  from,
                  createdAt,
                  ...(thread_id ? { thread_id } : {}),
                  ...(senderName ? { senderName } : {}),
                },
              ]
                .sort((a, b) => a.createdAt - b.createdAt)
                .slice(-50);
              if (patientKey) {
                persistSnapshot({
                  messages: next,
                  leadThreadId,
                  enrolledSharedCare,
                });
              }
              return next;
            });
          };
          if (id) {
            confirmSent(id);
          } else {
            confirmSent(`sent-${Date.now()}`);
            void fetchMessages({ silent: true });
          }
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === optimisticId ? { ...m, pending: false, text: trimmed } : m
            )
          );
          void fetchMessages({ silent: true });
        }
        invalidateDoctorMessagingCache();
      }
    } catch (err: unknown) {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      Alert.alert('Hata', 'Ağ hatası. Lütfen tekrar deneyin.');
      setText(trimmed);
      console.error('[DR CHAT send]', err instanceof Error ? err.message : err);
    } finally {
      setSending(false);
    }
  };

  const renderDoctorMessageItem = useCallback(
    ({ item }: ListRenderItemInfo<DoctorChatMessage>) => <MessageItem message={item} />,
    []
  );

  const doctorMessageKeyExtractor = useCallback((item: DoctorChatMessage) => {
    const id = String(item.id ?? '').trim();
    if (id !== '') return id;
    return `fb-${item.createdAt}-${item.from}`;
  }, []);

  const showListSkeleton = loading && messages.length === 0;

  return (
    <SafeAreaView
      style={styles.root}
      edges={['top', 'left', 'right']}
      onLayout={() => markFirstPaint(hasDisplayedContentRef.current ? 'cache' : 'shell')}
    >
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerMid}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarChar}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
          <View>
            <Text style={styles.headerName} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.headerSub}>
              {t('doctor.patientChat.headerSub') !== 'doctor.patientChat.headerSub'
                ? t('doctor.patientChat.headerSub')
                : 'Messages'}
            </Text>
          </View>
        </View>
        <View style={styles.headerTrail}>
          {silentRefreshing ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : null}
        </View>
      </View>

      <View style={styles.aiSnoozeBar}>
        {aiCoord?.aiSnoozeActive ? (
          <View style={styles.aiSnoozeActiveRow}>
            <View style={styles.aiSnoozeActivePill} accessibilityRole="text">
              <Text style={styles.aiSnoozeActiveText}>
                AI susturuldu{snoozeRemaining ? ` · ${snoozeRemaining} kaldı` : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.aiResumeBtn, aiSnoozeBusy && styles.aiSnoozeBtnDisabled]}
              onPress={handleResumeAi}
              disabled={aiSnoozeBusy || !token || !patientKey}
              accessibilityRole="button"
              accessibilityLabel="AI devam etsin"
            >
              {aiSnoozeBusy ? (
                <ActivityIndicator size="small" color="#166534" />
              ) : (
                <Text style={styles.aiResumeBtnText}>AI devam</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.aiSnoozeBtn, aiSnoozeBusy && styles.aiSnoozeBtnDisabled]}
            onPress={handleSnoozeAi}
            disabled={aiSnoozeBusy || !token || !patientKey}
            accessibilityRole="button"
            accessibilityLabel="AI yi 5 dakika sustur"
          >
            {aiSnoozeBusy ? (
              <ActivityIndicator size="small" color="#1E40AF" />
            ) : (
              <Text style={styles.aiSnoozeBtnText}>AI · 5 dk sustur</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {(archivedOfferId || enrolledSharedCare) ? (
        <View style={styles.enrolledBanner} accessibilityRole="text">
          <Text style={styles.enrolledBannerTitle}>
            {t('doctor.chat.unifiedThreadTitle') !== 'doctor.chat.unifiedThreadTitle'
              ? t('doctor.chat.unifiedThreadTitle')
              : 'Tek mesaj kutusu'}
          </Text>
          <Text style={styles.enrolledBannerBody}>
            {t('doctor.chat.unifiedThreadBody') !== 'doctor.chat.unifiedThreadBody'
              ? t('doctor.chat.unifiedThreadBody')
              : 'Talep dönemindeki ve klinik mesajlar burada birlikte görünür.'}
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
      >
        {showListSkeleton ? (
          <View style={styles.skeletonWrap}>
            <ChatSkeletonBubble align="left" />
            <ChatSkeletonBubble align="right" />
            <ChatSkeletonBubble align="left" />
          </View>
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
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={7}
            removeClippedSubviews={Platform.OS === 'android'}
            onScroll={(e) => {
              isAtBottomRef.current = e.nativeEvent.contentOffset.y < 72;
            }}
            scrollEventThrottle={100}
            onLayout={() => {
              if (pendingScrollToLatestRef.current && messages.length > 0) {
                scrollToLatest({ force: true });
              }
            }}
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyText}>Henüz mesaj yok</Text>
              </View>
            }
          />
        )}

        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
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
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>Gönder</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ChatSkeletonBubble({ align }: { align: 'left' | 'right' }) {
  return (
    <View
      style={[
        styles.skeletonBubble,
        align === 'right' ? styles.skeletonBubbleRight : styles.skeletonBubbleLeft,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 22, color: '#111827' },
  headerMid: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTrail: { width: 40, alignItems: 'center', justifyContent: 'center' },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DBEAFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarChar: { fontSize: 16, fontWeight: '700', color: '#2563EB' },
  headerName: { fontSize: 15, fontWeight: '700', color: '#111827', maxWidth: 180 },
  headerSub: { fontSize: 11, color: '#6B7280' },
  aiSnoozeBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  aiSnoozeBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  aiSnoozeBtnDisabled: { opacity: 0.6 },
  aiSnoozeBtnText: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  aiSnoozeActiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  aiSnoozeActivePill: {
    flex: 1,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#6EE7B7',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  aiSnoozeActiveText: { fontSize: 13, fontWeight: '600', color: '#047857' },
  aiResumeBtn: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  aiResumeBtnText: { fontSize: 13, fontWeight: '700', color: '#166534' },
  enrolledBanner: {
    backgroundColor: '#EFF6FF',
    borderBottomWidth: 1,
    borderBottomColor: '#BFDBFE',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  enrolledBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 4,
  },
  enrolledBannerBody: { fontSize: 12, color: '#1E3A8A', lineHeight: 17 },
  archivedOfferLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563EB',
    textDecorationLine: 'underline',
    marginTop: 4,
  },
  skeletonWrap: { flex: 1, padding: 14, gap: 10, justifyContent: 'flex-end' },
  skeletonBubble: {
    height: 48,
    borderRadius: 16,
    backgroundColor: '#E5E7EB',
    opacity: 0.7,
    maxWidth: '72%',
  },
  skeletonBubbleLeft: { alignSelf: 'flex-start', width: '55%' },
  skeletonBubbleRight: { alignSelf: 'flex-end', width: '48%' },
  listContent: { padding: 14, paddingBottom: 8, flexGrow: 1 },
  bubble: {
    maxWidth: '78%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 8,
  },
  bubblePatient: {
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 1 },
      },
      android: { elevation: 1 },
    }),
  },
  bubbleDoctor: {
    backgroundColor: '#2563EB',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  bubbleSender: { fontSize: 11, color: '#6B7280', marginBottom: 3, fontWeight: '600' },
  bubbleText: { fontSize: 15, color: '#111827', lineHeight: 21 },
  bubbleTextDoctor: { color: '#fff' },
  bubbleTime: { fontSize: 10, color: '#9CA3AF', marginTop: 4, alignSelf: 'flex-end' },
  bubbleTimeDoctor: { color: 'rgba(255,255,255,0.65)' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 15, color: '#9CA3AF' },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    maxHeight: 120,
  },
  sendBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  sendBtnDisabled: { backgroundColor: '#93C5FD' },
  sendBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

const MessageItem = React.memo(
  function MessageItem({ message }: { message: DoctorChatMessage }) {
    const isPatient = message.from === 'PATIENT';
    const isAi =
      !isPatient &&
      (message.senderName === 'AI' ||
        message.senderName === 'Care Team' ||
        message.senderName === 'Klinik');
    const isDoctorSide =
      !isPatient &&
      !isAi &&
      (message.from === 'CLINIC' || message.from === 'DOCTOR' || message.from === 'admin');
    const ts =
      typeof message.createdAt === 'number' && Number.isFinite(message.createdAt)
        ? message.createdAt
        : Date.now();
    const timeStr = new Date(ts).toLocaleTimeString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      <View style={[styles.bubble, isDoctorSide ? styles.bubbleDoctor : styles.bubblePatient]}>
        {!isDoctorSide && message.senderName ? (
          <Text style={styles.bubbleSender}>{message.senderName}</Text>
        ) : null}
        <Text style={[styles.bubbleText, isDoctorSide && styles.bubbleTextDoctor]}>
          {message.text?.trim() ? message.text : '…'}
        </Text>
        <Text style={[styles.bubbleTime, isDoctorSide && styles.bubbleTimeDoctor]}>{timeStr}</Text>
      </View>
    );
  },
  (prev, next) =>
    prev.message.id === next.message.id &&
    prev.message.text === next.message.text &&
    prev.message.pending === next.message.pending &&
    prev.message.createdAt === next.message.createdAt
);
