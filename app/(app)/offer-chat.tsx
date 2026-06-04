// app/offer-chat.tsx — Offer-based messaging between patient and doctor
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity, Pressable,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView,
  Platform, Alert, Image, Modal, ScrollView, Linking, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  ensureCameraAccess,
  ensureMediaLibraryAccessForPicker,
  launchImageLibraryPlayStoreSafe,
} from '../../lib/mediaPicker';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { safeSetItem } from '../../lib/asyncStorageSafe';
import { useAuth } from '../../lib/auth';
import { useLanguage } from '../../lib/language-context';
import { API_BASE } from '../../lib/api';
import { exitOfferChat, offerChatLastStorageKey } from '../../lib/goToOfferChat';
import { normalizeRouteParam } from '../../lib/doctorPatientId';
import { invalidateDoctorMessagingCache } from '../../lib/doctorMessaging';
import { emitOfferUnreadEvent } from '../../lib/offerUnreadEvents';
import {
  invalidatePatientInboxUnreadCache,
  schedulePatientInboxSummaryRefresh,
} from '../../lib/patientInboxUnread';
import { peekCachedResource, setCachedResource } from '../../lib/resourceCache';
import {
  DOCTOR_REQUESTS_LIST_CACHE_KEY,
  type DoctorRequestRow,
} from '../../lib/doctorRequestsCache';
import { formatTreatmentRequestDescription } from '../../lib/treatmentRequestDescription';
import {
  normalizeOfferMessageTextNullable,
  safeOfferMessageText,
} from '../../lib/offerChatMessageText';
import {
  maybeAbortOfferRailwayMessagesFetch,
  setGlobalChatOpen,
  setGlobalOfferChatOpen,
} from  '../../hooks/chatSessionGlobal';
import { clearDoctorRequestUnreadByOfferId } from '../../lib/doctorRequestsUnread';
import { openDoctorPatientChat } from '../../lib/navigateCanonicalChat';
import { goToChat } from '../../lib/chatFlow';
import { showChatMessageCopyMenu } from '../../lib/chatMessageCopy';
import { logCanonicalSendAttempt } from '../../lib/canonicalChatDiagnostics';
import { fetchOfferMessagingMeta } from '../../lib/offerMessagingMeta';
import { useSupabaseOfferMessages } from  '../../hooks/useSupabaseOfferMessages';
import { appendMappedChatMessage, mergeSbMessages } from  '../../hooks/chatMessageUtils';
import { playInAppNewMessageSoundDebouncedForThread } from '../../lib/playInAppMessageSound';
// Guided intraoral photo steps
const PHOTO_STEP_KEYS = [
  { key: 'upper', icon: '⬆️' },
  { key: 'lower', icon: '⬇️' },
  { key: 'front', icon: '😁' },
  { key: 'left',  icon: '◀️' },
  { key: 'right', icon: '▶️' },
];

type MessageSenderRole = 'patient' | 'doctor' | 'system' | 'assistant';

type Message = {
  id: string;
  /** Thread scope — must match route `currentOfferId` (prevents multi-offer leak). */
  offer_id: string;
  sender_id: string;
  sender_role: MessageSenderRole;
  sender_name: string;
  /** clinic_ai vs doctor_direct — disambiguate legacy rows with sender_role doctor */
  actor_kind?: string;
  text: string | null;
  attachment_url: string | null;
  attachment_type: 'image' | 'xray' | 'document' | null;
  created_at: string;
  /** Stable FlatList key — set once on opt_ creation, never changes even after ID update. */
  _stableKey?: string;
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

function logOfferChatItemDev(message: Message): void {
  if (!__DEV__) return;
  console.log('[offer-chat:item]', {
    id: message.id,
    text: message.text,
    type: typeof message.text,
    sender_role: message.sender_role,
  });
}

/** RN Image / Linking need https://…; API may return /uploads/… paths. */
function resolveAttachmentMediaUrl(raw: string | null | undefined, apiBase: string): string {
  const u = String(raw || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) {
    const base = String(apiBase || '').replace(/\/$/, '');
    return base ? `${base}${u}` : u;
  }
  return u;
}

const OFFER_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paramString(v: string | string[] | undefined): string {
  const s = Array.isArray(v) ? v[0] : v;
  return String(s ?? '').trim();
}

/** Map DB / API row → list item. Uses DB names: offer_id, text; accepts offerId / message aliases. */
function offerMessageRowToUI(
  row: Record<string, unknown>,
  apiBase: string,
  fallbackOfferId = '',
  rowIndex = 0
): Message {
  const scope = String(fallbackOfferId).trim();
  const rawOid = row.offer_id ?? row.offerId;
  const offer_id =
    rawOid != null && String(rawOid).trim() !== ''
      ? String(rawOid).trim()
      : scope;

  // Normalize: message_text (DB/Supabase canonical) → text (Railway API legacy) → message (eski fallback)
  const rawText = row.message_text ?? row.text ?? row.message;
  const text = normalizeOfferMessageTextNullable(rawText);
  if (__DEV__) console.log('[offerMessageRowToUI] FINAL TEXT:', JSON.stringify(text));

  const actorKind = String(row.actor_kind ?? row.message_source ?? '').toLowerCase();
  const roleRaw = String(row.sender_role || 'patient').toLowerCase();
  let sender_role: MessageSenderRole = 'patient';
  if (roleRaw === 'system') {
    sender_role = 'system';
  } else if (roleRaw === 'patient') {
    sender_role = 'patient';
  } else if (
    actorKind === 'clinic_ai' ||
    roleRaw === 'assistant' ||
    roleRaw === 'ai' ||
    roleRaw === 'clinic'
  ) {
    sender_role = 'assistant';
  } else if (roleRaw === 'doctor' && actorKind !== 'clinic_ai') {
    sender_role = 'doctor';
  } else if (roleRaw === 'doctor' && actorKind === 'clinic_ai') {
    sender_role = 'assistant';
  } else {
    sender_role = 'assistant';
  }

  let id = String(row.id ?? '').trim();
  if (!id) {
    id = `derived:${offer_id}:${rowIndex}:${String(row.created_at ?? '')}`;
  }

  return {
    id,
    offer_id,
    sender_id: String(row.sender_id ?? ''),
    sender_role,
    actor_kind: actorKind || undefined,
    sender_name: String(row.sender_name ?? '').trim(),
    text,
    attachment_url: row.attachment_url
      ? resolveAttachmentMediaUrl(String(row.attachment_url), apiBase)
      : null,
    attachment_type:
      row.attachment_type === 'image' ||
      row.attachment_type === 'xray' ||
      row.attachment_type === 'document'
        ? row.attachment_type
        : null,
    created_at: row.created_at
      ? new Date(String(row.created_at)).toISOString()
      : new Date().toISOString(),
  };
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

type FlatItem = ReturnType<typeof groupByDate>[number];

const OfferChatMessageItem = React.memo(function OfferChatMessageItem({
  item,
  myRole,
  t,
}: {
  item: FlatItem;
  myRole: 'doctor' | 'patient';
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (item.type === 'separator') {
    return (
      <View style={styles.dateSeparator}>
        <View style={styles.dateLine} />
        <Text style={styles.dateText}>{item.date}</Text>
        <View style={styles.dateLine} />
      </View>
    );
  }
  if (item.sender_role === 'system') {
    const systemText = safeOfferMessageText(
      item.text === 'clinic_joined'
        ? t('chat.systemClinicJoined') || '✅ Hasta klinik kaydını tamamladı'
        : item.text,
    );
    return (
      <View style={styles.systemMsgRow}>
        <Pressable
          onPress={() => showChatMessageCopyMenu(systemText, t)}
          style={styles.systemMsgBubble}
        >
          <Text style={styles.systemMsgText}>{systemText || ' '}</Text>
          <Text style={styles.systemMsgTime}>{fmtTime(item.created_at)}</Text>
        </Pressable>
      </View>
    );
  }

  logOfferChatItemDev(item);

  const isMe = item.sender_role === myRole;
  const isDoctorViewingPatient = myRole === 'doctor' && item.sender_role === 'patient';
  const isPatientViewingDoctor = myRole === 'patient' && item.sender_role === 'doctor';
  const isPatientViewingCareTeam = myRole === 'patient' && item.sender_role === 'assistant';

  const patientSenderLabel = isDoctorViewingPatient
    ? String(item.sender_name || '').trim() || t('offerChat.senderFallback')
    : '';
  const doctorSenderLabel = isPatientViewingDoctor
    ? String(item.sender_name || '').trim() || t('offerChat.doctorFallback') || 'Doktor'
    : '';
  const careTeamSenderLabel = isPatientViewingCareTeam
    ? String(item.sender_name || '').trim() ||
      (t('offerChat.careTeamFallback') !== 'offerChat.careTeamFallback'
        ? t('offerChat.careTeamFallback')
        : 'Bakım Ekibi')
    : '';
  const otherSenderLabel = patientSenderLabel || doctorSenderLabel || careTeamSenderLabel;

  const mediaUrl = resolveAttachmentMediaUrl(item.attachment_url, API_BASE);
  const hasImage = Boolean(mediaUrl && (item.attachment_type === 'image' || item.attachment_type === 'xray'));
  const hasDoc = Boolean(mediaUrl && item.attachment_type === 'document');
  const rawText = safeOfferMessageText(item.text);
  const bubbleText = rawText ? formatTreatmentRequestDescription(rawText) : '';
  const showBubbleText = bubbleText.length > 0;

  return (
    <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowOther]}>
      {!isMe && (
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(otherSenderLabel || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
      )}
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
        {!isMe && !isDoctorViewingPatient && (
          <Text style={styles.senderName}>{otherSenderLabel}</Text>
        )}
        {isDoctorViewingPatient && (hasImage || hasDoc) && !showBubbleText && patientSenderLabel ? (
          <Text style={styles.senderBesideMessage} numberOfLines={1}>{patientSenderLabel}</Text>
        ) : null}

        {hasImage && mediaUrl && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => Linking.openURL(mediaUrl).catch(() => Alert.alert('Hata', 'Fotoğraf açılamadı.'))}
          >
            <View style={styles.attachImageWrap}>
              <Image source={{ uri: mediaUrl }} style={styles.attachImage} resizeMode="cover" />
              {item.attachment_type === 'xray' && (
                <View style={styles.xrayBadge}><Text style={styles.xrayBadgeText}>🩻 X-Ray</Text></View>
              )}
              {item.attachment_type === 'image' && (
                <View style={styles.intraoralBadge}><Text style={styles.intraoralBadgeText}>📷 Intraoral</Text></View>
              )}
            </View>
          </TouchableOpacity>
        )}

        {hasDoc && mediaUrl && (
          <TouchableOpacity
            style={[styles.docBubble, isMe && styles.docBubbleMe]}
            onPress={() => Linking.openURL(mediaUrl).catch(() => Alert.alert('Hata', 'Dosya açılamadı.'))}
          >
            <Text style={styles.docIcon}>📄</Text>
            <Text style={[styles.docName, isMe && styles.docNameMe]} numberOfLines={2}>
              {mediaUrl.split('/').pop()?.split('?')[0] || 'Document'}
            </Text>
          </TouchableOpacity>
        )}

        {showBubbleText ? (
          isDoctorViewingPatient && patientSenderLabel ? (
            <Pressable onPress={() => showChatMessageCopyMenu(bubbleText, t)}>
              <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
                <Text style={styles.senderBesideMessage}>{patientSenderLabel}</Text>
                <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
                  {` · ${bubbleText}`}
                </Text>
              </Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => showChatMessageCopyMenu(bubbleText, t)}>
              <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{bubbleText}</Text>
            </Pressable>
          )
        ) : null}

        <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>{fmtTime(item.created_at)}</Text>
      </View>
    </View>
  );
});

export default function OfferChatScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();

  const routeParams = useLocalSearchParams<{
    offerId: string;
    otherName: string;
    treatmentType: string;
    enrolledSharedCare?: string;
    patientChatPatientId?: string;
  }>();

  /** Route `offerId` only — safe primitive (no useMemo). */
  const currentOfferId =
    Array.isArray(routeParams.offerId)
      ? routeParams.offerId[0]
      : routeParams.offerId ?? null;

  const otherName = paramString(routeParams.otherName);
  const treatmentType = paramString(routeParams.treatmentType);
  const enrolledSharedCareParam = normalizeRouteParam(routeParams.enrolledSharedCare);
  const patientChatPatientIdParam = normalizeRouteParam(routeParams.patientChatPatientId);
  const offerIdStr = currentOfferId == null ? '' : String(currentOfferId).trim();

  const paramSaysArchived =
    user?.type === 'doctor' &&
    (enrolledSharedCareParam === '1' || enrolledSharedCareParam.toLowerCase() === 'true');

  /** pending → probing server; archived → no writes; writable → lead-phase offer thread */
  const [offerWriteGate, setOfferWriteGate] = useState<'pending' | 'writable' | 'archived'>(
    paramSaysArchived ? 'archived' : user?.type === 'doctor' ? 'pending' : 'writable',
  );

  const isDoctorEnrolledOfferReadonly =
    user?.type === 'doctor' && (paramSaysArchived || offerWriteGate === 'archived');

  const canSendOfferMessages = user?.type !== 'doctor' || offerWriteGate === 'writable';

  /** Doctors: no RT/poll until server confirms lead-phase offer thread. */
  const doctorOfferRealtimeEnabled =
    user?.type !== 'doctor' || offerWriteGate === 'writable';

  const enrolledRedirectDoneRef = useRef(false);

  /** After enrollment, offer-chat is archived — probe server, block sends, redirect to patient-chat. */
  useEffect(() => {
    if (user?.type !== 'doctor' || !offerIdStr) {
      if (user?.type !== 'doctor') setOfferWriteGate('writable');
      return;
    }

    const redirectToPatientChat = (patientId: string) => {
      if (enrolledRedirectDoneRef.current) return;
      enrolledRedirectDoneRef.current = true;
      setOfferWriteGate('archived');
      openDoctorPatientChat(
        router,
        {
          patientId,
          patientName: otherName || 'Patient',
          offerId: offerIdStr,
          leadThreadIsLead: false,
          enrolled: true,
        },
        { source: 'offer-chat-enrolled-redirect', useReplace: true },
      );
    };

    if (paramSaysArchived && patientChatPatientIdParam) {
      redirectToPatientChat(patientChatPatientIdParam);
      return;
    }

    if (!user?.token) {
      setOfferWriteGate('pending');
      return;
    }

    let cancelled = false;
    setOfferWriteGate('pending');
    void fetchOfferMessagingMeta(user.token, offerIdStr).then((meta) => {
      if (cancelled) return;
      if (meta?.enrolled && meta?.route === 'patient_chat') {
        setOfferWriteGate('archived');
        const pid = String(meta.patient_id || patientChatPatientIdParam || '').trim();
        if (pid) redirectToPatientChat(pid);
        return;
      }
      if (meta?.ok) {
        setOfferWriteGate('writable');
        return;
      }
      setOfferWriteGate('pending');
    });

    return () => {
      cancelled = true;
    };
  }, [
    user?.type,
    user?.token,
    offerIdStr,
    paramSaysArchived,
    patientChatPatientIdParam,
    otherName,
    router,
  ]);

  /** Re-check enrollment when doctor returns to this screen (patient may have joined clinic). */
  useFocusEffect(
    useCallback(() => {
      if (user?.type !== 'doctor' || !offerIdStr || !user?.token) return;
      if (paramSaysArchived && patientChatPatientIdParam) return;
      let cancelled = false;
      void fetchOfferMessagingMeta(user.token, offerIdStr).then((meta) => {
        if (cancelled || !meta?.enrolled || meta?.route !== 'patient_chat') return;
        setOfferWriteGate('archived');
        const pid = String(meta.patient_id || patientChatPatientIdParam || '').trim();
        if (!pid || enrolledRedirectDoneRef.current) return;
        enrolledRedirectDoneRef.current = true;
        openDoctorPatientChat(
          router,
          {
            patientId: pid,
            patientName: otherName || 'Patient',
            offerId: offerIdStr,
            leadThreadIsLead: false,
            enrolled: true,
          },
          { source: 'offer-chat-focus-enrolled', useReplace: true },
        );
      });
      return () => {
        cancelled = true;
      };
    }, [
      user?.type,
      user?.token,
      offerIdStr,
      paramSaysArchived,
      patientChatPatientIdParam,
      otherName,
      router,
    ]),
  );

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const myRole = user?.type === 'doctor' ? 'doctor' : 'patient';

  const handleExitOfferChat = useCallback(() => {
    exitOfferChat(router, myRole);
  }, [router, myRole]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        handleExitOfferChat();
        return true;
      });
      return () => sub.remove();
    }, [handleExitOfferChat]),
  );

  // ── Supabase: TEK KAYNAK (yapılandırılmışsa REST GET atlanır) ──────────────
  const {
    messages: sbOfferMessages,
    ready: sbOfferReady,
    configured: sbOfferConfigured,
    timedOut: sbOfferTimedOut,
    refresh: sbOfferRefresh,
  } = useSupabaseOfferMessages({
    offerId: offerIdStr,
    token: user?.token,
    enabled: doctorOfferRealtimeEnabled,
  });

  // Supabase offer mesajlarını state'e additif olarak sync et.
  // opt_* → gerçek UUID geçişi FlatList'te flash yaratmaması için IN-PLACE replace kullanır:
  // aynı _stableKey → FlatList item'ı yeniden mount etmez, sadece günceller.
  //
  // ⚠️ sbOfferReady KONTROLÜ KASITLI OLARAK YOK:
  // RT subscription henüz SUBSCRIBED olmasa bile Socket.IO mesajları hook'a gelebilir.
  // sbOfferReady beklersek bu mesajlar offer-chat state'ine hiç geçmez.
  // Sadece sbOfferConfigured=false ise veya sbMsgs tamamen boşsa atla.
  useEffect(() => {
    if (!sbOfferConfigured || !doctorOfferRealtimeEnabled) return;
    const sbMsgs = sbOfferMessages as unknown as Message[];
    // Hook henüz hiç mesaj almadıysa (SELECT tamamlanmadı, Socket.IO da yok) — atla
    if (sbMsgs.length === 0) return;
    setMessages(prev => {
      // O(n) Set ile mevcut ID'leri index'le — prev.some() O(n²) yerine O(1) lookup
      const prevIdSet = new Set(prev.map(m => m.id));
      const newSbMsgs = sbMsgs.filter(sb => !prevIdSet.has(sb.id));

      // 1️⃣ opt_* mesajlarını, eşleşen gerçek mesajla IN-PLACE değiştir
      //    → FlatList key (_stableKey) sabit kalır, flash olmaz
      //    O(n) Map: text → candidates (opt eşleştirme için)
      const candidatesByText = new Map<string, Message[]>();
      for (const sb of newSbMsgs) {
        const key = `${sb.sender_role}::${sb.text ?? '__null__'}`;
        if (!candidatesByText.has(key)) candidatesByText.set(key, []);
        candidatesByText.get(key)!.push(sb);
      }

      const usedSbIds = new Set<string>();
      const updatedPrev = prev.map(m => {
        if (!m.id.startsWith('opt_')) return m;
        const optTs = Number(m.id.slice(4));
        if (!optTs) return m;
        const key = `${m.sender_role}::${m.text ?? '__null__'}`;
        const candidates = candidatesByText.get(key);
        if (!candidates) return m;
        const match = candidates.find(sb => {
          if (usedSbIds.has(sb.id)) return false;
          const sbTs = new Date(sb.created_at).getTime();
          return Math.abs(sbTs - optTs) < 30_000;
        });
        if (match) {
          usedSbIds.add(match.id);
          if (__DEV__) console.log('[offer-chat] ✅ opt replaced in-place:', m.id, '→', match.id);
          // _stableKey korunur → FlatList aynı hücreyi günceller, unmount/remount yok
          return {
            ...match,
            text: normalizeOfferMessageTextNullable(match.text),
            sender_name: safeOfferMessageText(match.sender_name) || match.sender_name,
            _stableKey: m._stableKey ?? m.id,
          };
        }
        return m;
      });

      // 2️⃣ Gerçekten yeni gelen mesajları ekle (opt_'ye eşleşmeyen)
      const genuinelyNew = newSbMsgs.filter(sb => !usedSbIds.has(sb.id));

      const anyInPlace = updatedPrev.some((m, i) => m !== prev[i]);
      if (!anyInPlace && genuinelyNew.length === 0) return prev; // hiç değişiklik yok → re-render iptal

      const merged = [...updatedPrev, ...genuinelyNew];

      if (__DEV__ && genuinelyNew.length > 0) {
        console.log('[mergeSbMessages] STATE LENGTH BEFORE:', prev.length, '→ AFTER:', merged.length, '(added:', genuinelyNew.length, ')');
      }

      // Karşı taraftan yeni mesaj varsa ses çal (setTimeout: state updater'da side-effect'ten kaçın)
      const hasIncoming = genuinelyNew.some(sb => sb.sender_role !== myRole);
      if (hasIncoming && offerIdStr) {
        setTimeout(() => playInAppNewMessageSoundDebouncedForThread(offerIdStr, 2000), 0);
      }

      // ISO tarihleri lexicographic olarak sıralanabilir — localeCompare 10x daha yavaş
      return merged.sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
    });
  }, [sbOfferMessages, sbOfferConfigured, myRole, offerIdStr]); // sbOfferReady kasıtlı olarak dep'de yok — yukarıdaki açıklamaya bak

  // Supabase hazır olunca loading kapat
  useEffect(() => {
    if (sbOfferConfigured && sbOfferReady) setLoading(false);
  }, [sbOfferConfigured, sbOfferReady]);

  // Supabase bağlanamadı (timedOut) → Railway fallback tetikle
  useEffect(() => {
    if (sbOfferConfigured && sbOfferTimedOut && user?.token) {
      if (__DEV__) console.log('[offer-chat] ⚡ Supabase timedOut — Railway fallback');
      void fetchMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sbOfferTimedOut]);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const isAtBottomRef = useRef(true);
  const PAGE_SIZE = 60;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  // Guided intraoral state
  const [intraoralVisible, setIntraoralVisible] = useState(false);
  const [intraoralStep, setIntraoralStep]       = useState(0);
  const [intraoralPhotos, setIntraoralPhotos]   = useState<Record<string, any>>({});

  /** Only the latest GET may update state — avoids stale responses wiping a newer thread (incl. after POST). */
  const fetchMessagesSeqRef = useRef(0);
  const fetchMessagesAbortRef = useRef<AbortController | null>(null);
  const postSendFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keyExtractor = useCallback((item: FlatItem, i: number) =>
    item.type === 'separator'
      ? `sep_${item.date}_${i}`
      : String((item as Message)._stableKey ?? item.id),
  []);

  const renderOfferChatItem = useCallback(({ item }: { item: FlatItem }) => (
    <OfferChatMessageItem item={item} myRole={myRole} t={t} />
  ), [myRole, t]);

  useEffect(() => {
    const id = currentOfferId == null ? '' : String(currentOfferId).trim();
    if (__DEV__ && id) console.log('[CHAT OFFER]', id);
  }, [currentOfferId]);

  /** Son açılan teklif thread'i (hasta ana sayfa Mesajlar) — yanlış "latest offer" seçimini önler. */
  useEffect(() => {
    const oid = currentOfferId == null ? '' : String(currentOfferId).trim();
    const pid =
      user?.type === 'patient' && user?.patientId
        ? String(user.patientId).trim()
        : '';
    if (!oid || !pid || !OFFER_ID_UUID_RE.test(oid)) return;
    void safeSetItem(offerChatLastStorageKey(pid), oid);
  }, [currentOfferId, user?.patientId, user?.type]);

  /** Mark the other party's messages read (doctor ↔ patient); backend picks counterparty by actor. */
  const markAsRead = useCallback(async () => {
    if (!user?.token || currentOfferId == null || !String(currentOfferId).trim()) return;
    const oid = String(currentOfferId).trim();
    const recipient = user?.type === 'doctor' ? 'doctor' : 'patient';
    if (recipient === 'doctor') {
      clearDoctorRequestUnreadByOfferId(oid);
      invalidateDoctorMessagingCache();
    }
    else {
      invalidatePatientInboxUnreadCache();
      schedulePatientInboxSummaryRefresh(user.token);
    }
    emitOfferUnreadEvent({ type: 'offer_mark_read', offerId: oid, recipient });
    try {
      await fetch(`${API_BASE}/api/offer-messages/${encodeURIComponent(oid)}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
      });
    } catch { /* silent */ }
  }, [user?.token, user?.type, currentOfferId]);

  /** Single source of truth: GET — no merge, no client-side thread filter. */
  const fetchMessages = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent === true;
      const oid = currentOfferId == null ? '' : String(currentOfferId).trim();
      if (!oid || !user?.token) {
        if (!silent) setLoading(false);
        return;
      }
      if (user?.type === 'doctor' && !doctorOfferRealtimeEnabled) {
        if (!silent) setLoading(false);
        return;
      }

      // Supabase aktifse offer REST GET'i atla — Supabase Realtime devralır.
      if (sbOfferConfigured) {
        if (sbOfferReady) {
          // ✅ Supabase aktif ve bağlı — Railway'e gerek yok
          return;
        }
        if (!sbOfferTimedOut) {
          // 🔄 Supabase yapılandırıldı, henüz bağlanmadı — BEKLE
          return;
        }
        // ⚡ sbOfferTimedOut → Supabase bağlanamadı, Railway fallback
        if (__DEV__) console.log('[offer-chat] Supabase timeout — Railway devralıyor');
      }

      if (maybeAbortOfferRailwayMessagesFetch()) {
        if (!silent) setLoading(false);
        return;
      }

      const seq = ++fetchMessagesSeqRef.current;

      fetchMessagesAbortRef.current?.abort();
      const controller = new AbortController();
      fetchMessagesAbortRef.current = controller;

      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const res = await fetch(
          `${API_BASE}/api/offer-messages?offer_id=${encodeURIComponent(oid)}`,
          {
            signal: controller.signal,
            headers: { Authorization: `Bearer ${user.token}` },
          }
        );
        const raw = await res.json();
        if (__DEV__) console.log('[GET RAW SOURCE]', raw);

        if (!raw?.ok) throw new Error(raw?.error || 'error');

        if (seq !== fetchMessagesSeqRef.current) {
          if (__DEV__) console.log('[offer-chat] GET stale response ignored', { seq, current: fetchMessagesSeqRef.current });
          return;
        }

        // Do not replace thread with legacy / empty payloads (keeps optimistic & real rows on screen).
        if (raw.offer_messages_table_missing === true) {
          if (__DEV__) console.log('IGNORE synthetic response');
          return;
        }
        if (!raw.messages || !Array.isArray(raw.messages) || raw.messages.length === 0) {
          if (__DEV__) console.log('IGNORE empty response');
          return;
        }

        const rows = raw.messages as Record<string, unknown>[];
        const next = rows.map((row, idx) => offerMessageRowToUI(row, API_BASE, oid, idx));
        next.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        setMessages(next);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        if (seq !== fetchMessagesSeqRef.current) return;
        console.warn('[offer-chat] FETCH ERROR', e);
        setError(e.message || t('common.error'));
      } finally {
        if (seq === fetchMessagesSeqRef.current) {
          setLoading(false);
        }
      }
    },
    [currentOfferId, user?.token, user?.type, doctorOfferRealtimeEnabled, t, sbOfferConfigured, sbOfferReady, sbOfferTimedOut]
  );

  useEffect(() => {
    if (currentOfferId == null || !String(currentOfferId).trim()) {
      if (postSendFetchTimerRef.current) {
        clearTimeout(postSendFetchTimerRef.current);
        postSendFetchTimerRef.current = null;
      }
      fetchMessagesSeqRef.current += 1;
      fetchMessagesAbortRef.current?.abort();
      fetchMessagesAbortRef.current = null;
      setMessages([]);
      setLoading(false);
      return;
    }
    void fetchMessages();
  }, [currentOfferId, fetchMessages]);

  useEffect(() => {
    return () => {
      if (postSendFetchTimerRef.current) {
        clearTimeout(postSendFetchTimerRef.current);
        postSendFetchTimerRef.current = null;
      }
      fetchMessagesSeqRef.current += 1;
      fetchMessagesAbortRef.current?.abort();
      fetchMessagesAbortRef.current = null;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const oid = currentOfferId == null ? '' : String(currentOfferId).trim();
      setGlobalOfferChatOpen(true, oid);
      setGlobalChatOpen(false);
      if (!oid) {
        return () => {
          setGlobalOfferChatOpen(false);
        };
      }
      void markAsRead();
      if (doctorOfferRealtimeEnabled) {
        if (user?.token) void fetchMessages();
        sbOfferRefresh();
        const pollId = setInterval(() => {
          sbOfferRefresh();
        }, 8_000);
        return () => {
          setGlobalOfferChatOpen(false);
          clearInterval(pollId);
        };
      }
      return () => {
        setGlobalOfferChatOpen(false);
      };
    }, [
      currentOfferId,
      markAsRead,
      user?.token,
      fetchMessages,
      sbOfferRefresh,
      doctorOfferRealtimeEnabled,
    ]),
  );

  useEffect(() => {
    if (messages.length === 0) return;
    if (isAtBottomRef.current) {
      setHasNewMessage(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
    } else {
      // User is scrolled up — show "new message" badge
      setHasNewMessage(true);
    }
  }, [messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Upload a file to the backend and get back a URL
  const uploadAttachment = async (
    uri: string,
    mimeType: string,
    fileName: string,
    attachmentType: 'image' | 'xray' | 'document'
  ): Promise<string> => {
    if (!canSendOfferMessages || isDoctorEnrolledOfferReadonly) {
      throw new Error('read_only');
    }
    const formData = new FormData();
    formData.append('file', { uri, type: mimeType, name: fileName } as any);
    formData.append('offer_id', String(currentOfferId));
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
    if (!canSendOfferMessages || isDoctorEnrolledOfferReadonly) {
      if (user?.type === 'doctor' && offerWriteGate === 'pending') {
        Alert.alert(
          t('common.error') || 'Error',
          t('requests.chat.resolvingRoute') !== 'requests.chat.resolvingRoute'
            ? t('requests.chat.resolvingRoute')
            : 'Checking which conversation to use…',
        );
      }
      return;
    }
    if (!currentOfferId) return;
    if (!user?.token || !String(currentOfferId).trim()) return;

    const scope = String(currentOfferId).trim();
    logCanonicalSendAttempt({
      source: 'offer-chat',
      canonical_chat_type: 'offer',
      resolved_thread_kind: 'offer_chat',
      resolved_patient_id: patientChatPatientIdParam || null,
      resolved_offer_id: scope,
      resolved_offer_archived: isDoctorEnrolledOfferReadonly,
      lead_thread_is_lead: isDoctorEnrolledOfferReadonly ? false : true,
    });
    const optId = `opt_${Date.now()}`;
    const optimistic: Message = {
      id: optId,
      _stableKey: optId,
      offer_id: scope,
      sender_id: user.id || '',
      sender_role: myRole,
      sender_name: user.name || (myRole === 'doctor' ? 'Dr.' : t('offerChat.you')),
      text: normalizeOfferMessageTextNullable(opts.text),
      attachment_url: opts.attachment_url || null,
      attachment_type: opts.attachment_type || null,
      created_at: new Date().toISOString(),
    };
    if (__DEV__) console.log('[offer-chat send] FINAL MESSAGE OBJECT:', JSON.stringify(optimistic));
    setMessages((prev) => appendMappedChatMessage(prev, optimistic));
    isAtBottomRef.current = true;
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
    setSending(true);

    try {
      if (__DEV__) console.log('[MSG POST OFFER]', scope);
      const res = await fetch(`${API_BASE}/api/offer-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({
          offer_id: scope,
          text: opts.text || '',
          attachment_url: opts.attachment_url,
          attachment_type: opts.attachment_type,
        }),
      });
      const data = await res.json();
      if (__DEV__) console.log('[offer-chat POST] response:', JSON.stringify(data));
      if (!data?.ok) {
        if (data?.error === 'offer_thread_archived') {
          setOfferWriteGate('archived');
          const pid = String(data.patient_id || patientChatPatientIdParam || '').trim();
          const clinicIdArchived = String(data.clinic_id || '').trim();
          if (user?.type === 'doctor' && pid) {
            openDoctorPatientChat(
              router,
              {
                patientId: pid,
                patientName: otherName || 'Patient',
                offerId: scope,
                leadThreadIsLead: false,
                enrolled: true,
              },
              { source: 'offer-chat-send-blocked', useReplace: true },
            );
            Alert.alert(
              t('doctor.inbox.enrolledNoticeTitle') || 'Patient joined clinic',
              t('doctor.inbox.enrolledNoticeBody') ||
                'Continue messaging in the patient conversation.',
            );
            return;
          }
          if (user?.type === 'patient') {
            Alert.alert(
              t('common.error') !== 'common.error' ? t('common.error') : 'Hata',
              t('offerChat.sendFailedRetry') !== 'offerChat.sendFailedRetry'
                ? t('offerChat.sendFailedRetry')
                : 'Mesaj gönderilemedi. Teklifler ekranından sohbeti yeniden açıp tekrar deneyin.',
            );
            return;
          }
        }
        throw new Error(data?.error || 'error');
      }

      if (sbOfferConfigured && sbOfferReady) {
        // POST onaylandı → opt_ ID'sini gerçek UUID ile değiştir.
        // Realtime gelince aynı UUID'yi bulur → dedupe skip → boşluk/blink yok.
        const confirmedId: string | undefined =
          data.message?.id ?? data.id ?? data.data?.id;
        if (confirmedId) {
          // _stableKey korunur → FlatList key değişmez → flash/unmount olmaz
          setMessages(prev =>
            prev.map(m => m.id === optimistic.id
              ? { ...m, id: String(confirmedId), _stableKey: m._stableKey ?? m.id }
              : m),
          );
          if (__DEV__) console.log('[offer-chat] ✅ opt_ ID updated:', optimistic.id, '→', confirmedId);
        } else {
          // Backend ID dönmedi — fallback: opt_ kaldır, Realtime ekleyecek
          setMessages(prev => prev.filter(m => m.id !== optimistic.id));
        }
      } else {
        // Supabase yok → Railway fetch ile teyit et
        if (postSendFetchTimerRef.current) {
          clearTimeout(postSendFetchTimerRef.current);
          postSendFetchTimerRef.current = null;
        }
        postSendFetchTimerRef.current = setTimeout(() => {
          postSendFetchTimerRef.current = null;
          void fetchMessages({ silent: true });
        }, 600);
      }
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      Alert.alert(t('common.error'), e.message || t('common.error'));
    } finally {
      setSending(false);
    }
  };

  const send = async () => {
    if (isDoctorEnrolledOfferReadonly) return;
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
    if (isDoctorEnrolledOfferReadonly) return;
    if (sending) return;
    if (!(await ensureMediaLibraryAccessForPicker({
      deniedTitle: t('common.error'),
      deniedMessage: 'Photo library permission required',
    }))) {
      return;
    }
    const result = await launchImageLibraryPlayStoreSafe({
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
    if (isDoctorEnrolledOfferReadonly) return;
    if (sending) return;
    setIntraoralStep(0);
    setIntraoralPhotos({});
    setIntraoralVisible(true);
  };

  // Capture one step inside the guided modal
  const captureIntraoralStep = async () => {
    if (!(await ensureCameraAccess({
      deniedTitle: t('common.error'),
      deniedMessage: 'Camera permission required',
    }))) {
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
    if (isDoctorEnrolledOfferReadonly) return;
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

  // Show only the last `visibleCount` messages — older ones loaded on scroll up
  const visibleMessages = useMemo(
    () => messages.length > visibleCount ? messages.slice(messages.length - visibleCount) : messages,
    [messages, visibleCount],
  );
  const flatData = useMemo(() => groupByDate(visibleMessages), [visibleMessages]);

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleExitOfferChat} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerName} numberOfLines={1}>
            {decodeURIComponent(otherName || '')}
          </Text>
          {isDoctorEnrolledOfferReadonly ? (
            <Text style={styles.headerSubMuted} numberOfLines={2}>
              {t('offerChat.enrolledDoctorHeaderSub') !== 'offerChat.enrolledDoctorHeaderSub'
                ? t('offerChat.enrolledDoctorHeaderSub')
                : 'Request thread (read-only) · use Patients → Messages'}
            </Text>
          ) : treatmentType ? (
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
        {(loading && doctorOfferRealtimeEnabled) ||
        (user?.type === 'doctor' && offerWriteGate === 'pending' && !isDoctorEnrolledOfferReadonly) ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchMessages()}>
              <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={flatData}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.messageList}
            ListHeaderComponent={
              <>
                {isDoctorEnrolledOfferReadonly ? (
                  <View style={styles.enrolledBannerWrap}>
                    <View style={styles.enrolledBannerBubble}>
                      <Text style={styles.enrolledBannerTitle}>
                        {t('doctor.inbox.enrolledNoticeTitle') !== 'doctor.inbox.enrolledNoticeTitle'
                          ? t('doctor.inbox.enrolledNoticeTitle')
                          : 'Patient joined your clinic'}
                      </Text>
                      <Text style={styles.enrolledBannerBody}>
                        {t('offerChat.enrolledDoctorBanner') !== 'offerChat.enrolledDoctorBanner'
                          ? t('offerChat.enrolledDoctorBanner')
                          : 'This patient has joined your clinic. Continue messaging from the Patients section.'}
                      </Text>
                      <TouchableOpacity
                        style={styles.enrolledPrimaryCta}
                        activeOpacity={0.88}
                        onPress={() => {
                          invalidateDoctorMessagingCache();
                          const name = decodeURIComponent(otherName || '');
                          if (!patientChatPatientIdParam) {
                            router.push('/doctor/patients');
                            return;
                          }
                          router.replace({
                            pathname: '/doctor/patient-chat',
                            params: {
                              patientId: patientChatPatientIdParam,
                              patientName: encodeURIComponent(name || 'Patient'),
                            },
                          });
                        }}
                      >
                        <Text style={styles.enrolledPrimaryCtaTxt}>
                          {t('doctor.inbox.openPatientChatCta') !== 'doctor.inbox.openPatientChatCta'
                            ? t('doctor.inbox.openPatientChatCta')
                            : 'Open patient chat'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.enrolledSecondaryCta}
                        onPress={() => router.push('/doctor/patients')}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.enrolledSecondaryCtaTxt}>
                          {t('requests.enrolled.openPatientsList') !== 'requests.enrolled.openPatientsList'
                            ? t('requests.enrolled.openPatientsList')
                            : 'Open Patients'}
                        </Text>
                      </TouchableOpacity>
                      {messages.length > 0 ? (
                        <Text style={styles.enrolledHistoryHint}>
                          {t('offerChat.enrolledDoctorHistoryHint') !== 'offerChat.enrolledDoctorHistoryHint'
                            ? t('offerChat.enrolledDoctorHistoryHint')
                            : 'Earlier request messages (read-only)'}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}
                {messages.length > visibleCount ? (
                  <TouchableOpacity
                    onPress={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, messages.length))}
                    style={{ alignItems: 'center', paddingVertical: 8 }}
                  >
                    <Text style={{ color: '#888', fontSize: 13 }}>
                      ↑ {messages.length - visibleCount} older messages
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </>
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>💬</Text>
                <Text style={styles.emptyText}>{t('offerChat.noMessages')}</Text>
                <Text style={styles.emptySub}>{t('offerChat.noMessagesSub')}</Text>
              </View>
            }
            renderItem={renderOfferChatItem}
            initialNumToRender={20}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
            onScroll={(e) => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
              const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 80;
              isAtBottomRef.current = atBottom;
              if (atBottom) setHasNewMessage(false);
              // Load older messages when scrolled near top
              if (contentOffset.y < 100 && messages.length > visibleCount) {
                setVisibleCount(c => Math.min(c + PAGE_SIZE, messages.length));
              }
            }}
            scrollEventThrottle={100}
            onContentSizeChange={() => {
              if (isAtBottomRef.current) {
                flatListRef.current?.scrollToEnd({ animated: false });
              }
            }}
          />
        )}

        {/* New message badge — visible when scrolled up and new message arrived */}
        {hasNewMessage && (
          <TouchableOpacity
            onPress={() => {
              isAtBottomRef.current = true;
              setHasNewMessage(false);
              flatListRef.current?.scrollToEnd({ animated: true });
            }}
            style={{
              position: 'absolute',
              bottom: 80,
              alignSelf: 'center',
              backgroundColor: '#2563eb',
              borderRadius: 20,
              paddingHorizontal: 16,
              paddingVertical: 8,
              zIndex: 10,
              shadowColor: '#000',
              shadowOpacity: 0.2,
              shadowRadius: 4,
              elevation: 4,
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>↓ New message</Text>
          </TouchableOpacity>
        )}

        {!canSendOfferMessages ? (
          <View style={styles.enrolledBottomBar}>
            <Text style={styles.enrolledBottomBarTxt}>
              {offerWriteGate === 'pending'
                ? (t('requests.chat.resolvingRoute') !== 'requests.chat.resolvingRoute'
                    ? t('requests.chat.resolvingRoute')
                    : 'Checking which conversation to use…')
                : t('offerChat.enrolledDoctorComposerHint') !== 'offerChat.enrolledDoctorComposerHint'
                  ? t('offerChat.enrolledDoctorComposerHint')
                  : 'Messaging continues under Patients → Messages for this patient.'}
            </Text>
          </View>
        ) : (
          <View style={styles.inputBar}>
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={pickIntraoral}
              disabled={sending}
            >
              <Text style={styles.attachBtnText}>📷</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.attachBtn}
              onPress={takeIntraoral}
              disabled={sending}
            >
              <Text style={styles.attachBtnText}>📸</Text>
            </TouchableOpacity>

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
        )}
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
  headerSubMuted: { fontSize: 11, color: '#92400E', marginTop: 2, fontWeight: '600', textAlign: 'center' },

  enrolledBannerWrap: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4 },
  enrolledBannerBubble: {
    backgroundColor: '#FEF3C7',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F59E0B',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  enrolledBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 8,
    textAlign: 'center',
  },
  enrolledBannerBody: {
    fontSize: 14,
    color: '#78350F',
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 14,
    fontWeight: '600',
  },
  enrolledPrimaryCta: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  enrolledPrimaryCtaTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
  enrolledSecondaryCta: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  enrolledSecondaryCtaTxt: { color: '#1D4ED8', fontSize: 14, fontWeight: '600' },
  enrolledHistoryHint: {
    marginTop: 12,
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    textAlign: 'center',
    opacity: 0.85,
  },
  enrolledBottomBar: {
    backgroundColor: '#FFFBEB',
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  enrolledBottomBarTxt: {
    fontSize: 13,
    color: '#92400E',
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 19,
  },

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

  systemMsgRow: { alignItems: 'center', marginVertical: 10 },
  systemMsgBubble: {
    backgroundColor: '#D1FAE5', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 8,
    maxWidth: '80%', alignItems: 'center',
    borderWidth: 1, borderColor: '#6EE7B7',
  },
  systemMsgText: { fontSize: 13, color: '#065F46', fontWeight: '600', textAlign: 'center' },
  systemMsgTime: { fontSize: 10, color: '#6EE7B7', marginTop: 3 },

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
  /** Doctor thread: patient name inline with message (same line, bold). */
  senderBesideMessage: { fontSize: 14, fontWeight: '700', color: '#1E40AF' },
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
