// app/doctor/requests.tsx — Doctor: Incoming requests dashboard with quick-offer system
import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, RefreshControl, Modal,
  TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useLanguage } from '../../lib/language-context';
import { API_BASE } from '../../lib/api';

// ── Quick treatment presets ───────────────────────────────────────────────────
// Tap one to open a pre-filled offer modal in <15 seconds.
const QUICK = [
  { value: 'IMPLANT',  label: 'Implant',  emoji: '🦷', price: '$800–1,200',    dur: '3–5 days' },
  { value: 'CROWN',    label: 'Crown',    emoji: '👑', price: '$200–350',      dur: '2–3 days' },
  { value: 'BRIDGE',   label: 'Bridge',   emoji: '🌉', price: '$400–700',      dur: '3–4 days' },
  { value: 'ALL_ON_4', label: 'All-on-4', emoji: '✨', price: '$5,000–8,000',  dur: '5–7 days' },
];

// Full list for the "More" selector inside the modal
const ALL_TYPES = [
  { value: 'IMPLANT',    label: 'Implant' },
  { value: 'CROWN',      label: 'Crown' },
  { value: 'BRIDGE',     label: 'Bridge' },
  { value: 'VENEER',     label: 'Veneer' },
  { value: 'ALL_ON_4',   label: 'All-on-4' },
  { value: 'ALL_ON_6',   label: 'All-on-6' },
  { value: 'WHITENING',  label: 'Whitening' },
  { value: 'EXTRACTION', label: 'Extraction' },
  { value: 'ROOT_CANAL', label: 'Root Canal' },
  { value: 'CONSULT',    label: 'Consultation' },
  { value: 'OTHER',      label: 'Other' },
];

// Price control (mirrors backend)
const MIN_PRICE: Record<string, number> = {
  IMPLANT: 600, CROWN: 150, BRIDGE: 300, VENEER: 200,
  ALL_ON_4: 4000, ALL_ON_6: 5000, WHITENING: 100,
  EXTRACTION: 50, ROOT_CANAL: 200, CONSULT: 30,
};

function parsePriceMin(str: string): number | null {
  // Strip thousands-separator commas before parsing (e.g. "1,200" → "1200")
  const nums = str.replace(/,(\d{3})/g, '$1').replace(/[^\d.]/g, ' ').trim().split(/\s+/)
    .map(Number).filter(n => !isNaN(n) && n > 0);
  return nums.length > 0 ? Math.min(...nums) : null;
}

function fmtTs(iso: string) {
  try {
    const d  = new Date(iso);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 36e5;
    if (diffH < 1)   return `${Math.round(diffH * 60)}m ago`;
    if (diffH < 24)  return `${Math.round(diffH)}h ago`;
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch { return iso; }
}

type Request = {
  id: string;
  patient_name: string;
  description: string;
  budget: string | null;
  preferred_treatment: string | null;
  status: 'pending' | 'answered' | 'closed';
  created_at: string;
  offer_count: number;
  my_offer_id: string | null;
  is_assigned_to_me: boolean;
};

// ── Quick Offer Modal ─────────────────────────────────────────────────────────
function QuickOfferModal({
  request, preset, token, onClose, onSent,
}: {
  request: Request;
  preset: typeof QUICK[0] | null;
  token?: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [treatType, setTreatType]   = useState(preset?.value || '');
  const [price,     setPrice]       = useState(preset?.price || '');
  const [duration,  setDuration]    = useState(preset?.dur   || '');
  const [note,      setNote]        = useState('');
  const [showMore,  setShowMore]    = useState(!preset);
  const [saving,    setSaving]      = useState(false);

  const minAllowed = treatType ? (MIN_PRICE[treatType] ?? null) : null;
  const parsedMin  = price.trim() ? parsePriceMin(price) : null;
  const isBelowMin = minAllowed !== null && parsedMin !== null && parsedMin < minAllowed;

  const submit = async () => {
    if (!treatType) { Alert.alert('Select treatment type first'); return; }
    if (isBelowMin) {
      Alert.alert('Price too low', `Minimum for this treatment is $${minAllowed}.`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/doctor/treatment-requests/${request.id}/offer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            treatment_type: treatType,
            price_range:    price.trim()    || null,
            duration:       duration.trim() || null,
            note:           note.trim()     || null,
          }),
        }
      );
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Error');
      onSent();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={ms.overlay}
      >
        <View style={ms.sheet}>
          {/* Handle + header */}
          <View style={ms.handleBar} />
          <View style={ms.header}>
            <View style={{ flex: 1 }}>
              <Text style={ms.title}>
                {preset ? `${preset.emoji} ${preset.label} Offer` : 'Make an Offer'}
              </Text>
              <Text style={ms.patientRow} numberOfLines={1}>
                👤 {request.patient_name}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={ms.closeBtn}>
              <Text style={ms.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={ms.scroll} keyboardShouldPersistTaps="handled">

            {/* Patient request summary */}
            <View style={ms.summaryBox}>
              <Text style={ms.summaryLabel}>PATIENT REQUEST</Text>
              <Text style={ms.summaryText} numberOfLines={3}>{request.description}</Text>
              {request.budget && (
                <Text style={ms.summaryBudget}>Budget: {request.budget}</Text>
              )}
            </View>

            {/* Treatment type — show inline picker if no preset */}
            {showMore ? (
              <View style={ms.typePicker}>
                <Text style={ms.fieldLabel}>Treatment type</Text>
                <View style={ms.typeGrid}>
                  {ALL_TYPES.map(t => (
                    <TouchableOpacity
                      key={t.value}
                      style={[ms.typeChip, treatType === t.value && ms.typeChipActive]}
                      onPress={() => setTreatType(t.value)}
                    >
                      <Text style={[ms.typeChipText, treatType === t.value && ms.typeChipTextActive]}>
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <View style={ms.presetRow}>
                <Text style={ms.presetBadge}>{preset?.emoji} {preset?.label}</Text>
                <TouchableOpacity onPress={() => setShowMore(true)}>
                  <Text style={ms.changeTypeLink}>Change type</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Price */}
            <Text style={ms.fieldLabel}>
              Price range{minAllowed !== null ? ` (min $${minAllowed})` : ''}
            </Text>
            <TextInput
              style={[ms.input, isBelowMin && ms.inputError]}
              value={price}
              onChangeText={setPrice}
              placeholder="e.g. $800–1,200"
              placeholderTextColor="#9CA3AF"
              maxLength={80}
            />
            {isBelowMin && (
              <Text style={ms.errorHint}>⛔ Below minimum (${minAllowed})</Text>
            )}

            {/* Duration */}
            <Text style={ms.fieldLabel}>Duration</Text>
            <TextInput
              style={ms.input}
              value={duration}
              onChangeText={setDuration}
              placeholder="e.g. 3–5 days"
              placeholderTextColor="#9CA3AF"
              maxLength={80}
            />

            {/* Note */}
            <Text style={ms.fieldLabel}>Note (optional)</Text>
            <TextInput
              style={ms.textarea}
              value={note}
              onChangeText={setNote}
              placeholder="Any special notes for the patient..."
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              maxLength={500}
              textAlignVertical="top"
            />

            {/* Disclaimer notice */}
            <View style={ms.disclaimer}>
              <Text style={ms.disclaimerText}>
                ⚠️ Preliminary estimate — final diagnosis requires clinical examination.
              </Text>
            </View>

            {/* Send */}
            <TouchableOpacity
              style={[ms.sendBtn, (saving || isBelowMin) && ms.sendBtnDisabled]}
              onPress={submit}
              disabled={saving || isBelowMin}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={ms.sendBtnText}>Send Offer</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Request Card ──────────────────────────────────────────────────────────────
function RequestCard({
  req, token, onOfferSent, onChat,
}: {
  req: Request;
  token?: string;
  onOfferSent: () => void;
  onChat: (offerId: string) => void;
}) {
  const [preset, setPreset] = useState<typeof QUICK[0] | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded]   = useState(false);

  const isPending  = req.status === 'pending';
  const hasMyOffer = !!req.my_offer_id;

  const openQuick = (q: typeof QUICK[0]) => { setPreset(q); setShowModal(true); };
  const openFull  = () => { setPreset(null); setShowModal(true); };

  return (
    <View style={[cs.card, isPending && !hasMyOffer && cs.cardUrgent]}>

      {/* Top row */}
      <View style={cs.topRow}>
        <View style={cs.topLeft}>
          {req.is_assigned_to_me && (
            <View style={cs.assignedBadge}>
              <Text style={cs.assignedText}>📌 Assigned to me</Text>
            </View>
          )}
          <Text style={cs.patientName}>👤 {req.patient_name}</Text>
        </View>
        <View style={cs.topRight}>
          <Text style={cs.ts}>{fmtTs(req.created_at)}</Text>
          <View style={[cs.statusDot, isPending ? cs.statusDotPending : cs.statusDotAnswered]} />
        </View>
      </View>

      {/* Description */}
      <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
        <Text style={cs.description} numberOfLines={expanded ? undefined : 2}>
          {req.description}
        </Text>
        {!expanded && req.description.length > 80 && (
          <Text style={cs.readMore}>more ▾</Text>
        )}
      </TouchableOpacity>

      {/* Metadata chips */}
      <View style={cs.metaRow}>
        {req.preferred_treatment && (
          <View style={cs.metaChip}>
            <Text style={cs.metaChipText}>🦷 {req.preferred_treatment}</Text>
          </View>
        )}
        {req.budget && (
          <View style={cs.metaChip}>
            <Text style={cs.metaChipText}>💰 {req.budget}</Text>
          </View>
        )}
        {req.offer_count > 0 && (
          <View style={[cs.metaChip, cs.metaChipGray]}>
            <Text style={cs.metaChipText}>{req.offer_count} offer{req.offer_count > 1 ? 's' : ''} sent</Text>
          </View>
        )}
      </View>

      {/* Quick action buttons — only for pending requests */}
      {isPending && !hasMyOffer && (
        <View style={cs.quickRow}>
          {QUICK.map(q => (
            <TouchableOpacity
              key={q.value}
              style={cs.quickBtn}
              onPress={() => openQuick(q)}
              activeOpacity={0.75}
            >
              <Text style={cs.quickEmoji}>{q.emoji}</Text>
              <Text style={cs.quickLabel}>{q.label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={cs.quickBtnMore} onPress={openFull} activeOpacity={0.75}>
            <Text style={cs.quickMoreTxt}>···</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Answered state actions */}
      {hasMyOffer && (
        <View style={cs.answeredRow}>
          <View style={cs.answeredBadge}>
            <Text style={cs.answeredBadgeText}>✓ Offer sent</Text>
          </View>
          <TouchableOpacity
            style={cs.chatBtn}
            onPress={() => onChat(req.my_offer_id!)}
          >
            <Text style={cs.chatBtnText}>💬 Messages</Text>
          </TouchableOpacity>
          <TouchableOpacity style={cs.resendBtn} onPress={openFull}>
            <Text style={cs.resendBtnText}>+ Another</Text>
          </TouchableOpacity>
        </View>
      )}

      {showModal && (
        <QuickOfferModal
          request={req}
          preset={preset}
          token={token}
          onClose={() => setShowModal(false)}
          onSent={() => { setShowModal(false); onOfferSent(); }}
        />
      )}
    </View>
  );
}

// ── Dashboard Screen ──────────────────────────────────────────────────────────
type FilterKey = 'all' | 'mine' | 'pending' | 'answered';

export default function DoctorRequestsScreen() {
  const router  = useRouter();
  const { user } = useAuth();
  const { t }   = useLanguage();

  const [requests,   setRequests]   = useState<Request[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [filter,     setFilter]     = useState<FilterKey>('pending');

  const load = useCallback(async () => {
    if (!user?.token) return;
    setError(null);
    try {
      const res  = await fetch(`${API_BASE}/api/doctor/treatment-requests`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'error');
      setRequests(data.requests || []);
    } catch (e: any) {
      setError(e.message || t('common.error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.token, t]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const filtered = requests.filter(r => {
    if (filter === 'mine')     return r.is_assigned_to_me;
    if (filter === 'pending')  return r.status === 'pending';
    if (filter === 'answered') return r.status === 'answered';
    return true;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const mineCount    = requests.filter(r => r.is_assigned_to_me).length;

  const FILTERS: { key: FilterKey; label: string; count?: number }[] = [
    { key: 'pending',  label: 'Pending',  count: pendingCount },
    { key: 'mine',     label: 'Mine',     count: mineCount    },
    { key: 'answered', label: 'Answered' },
    { key: 'all',      label: 'All' },
  ];

  return (
    <SafeAreaView style={ds.safe}>

      {/* Header */}
      <View style={ds.header}>
        <TouchableOpacity onPress={() => router.back()} style={ds.backBtn}>
          <Text style={ds.backTxt}>← Back</Text>
        </TouchableOpacity>
        <View style={ds.headerCenter}>
          <Text style={ds.headerTitle}>Incoming Requests</Text>
          {pendingCount > 0 && (
            <View style={ds.badge}>
              <Text style={ds.badgeTxt}>{pendingCount}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 60 }} />
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={ds.filterBar}
        contentContainerStyle={ds.filterBarContent}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[ds.filterTab, filter === f.key && ds.filterTabActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[ds.filterTabTxt, filter === f.key && ds.filterTabTxtActive]}>
              {f.label}
              {f.count !== undefined && f.count > 0 ? ` (${f.count})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={ds.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <ScrollView
          style={ds.scroll}
          contentContainerStyle={ds.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {error && (
            <View style={ds.errorBox}>
              <Text style={ds.errorTxt}>⚠️ {error}</Text>
              <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
                <Text style={ds.retryTxt}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {!error && filtered.length === 0 && (
            <View style={ds.emptyBox}>
              <Text style={ds.emptyIcon}>📭</Text>
              <Text style={ds.emptyTitle}>No requests here</Text>
              <Text style={ds.emptySub}>
                {filter === 'mine'
                  ? 'No requests assigned to you yet.'
                  : 'Pull down to refresh.'}
              </Text>
            </View>
          )}

          {filtered.map(req => (
            <RequestCard
              key={req.id}
              req={req}
              token={user?.token}
              onOfferSent={() => {
                load();
                Alert.alert('✅ Offer sent!', 'The patient will be notified.');
              }}
              onChat={offerId =>
                router.push({
                  pathname: '/offer-chat',
                  params: {
                    offerId,
                    otherName: encodeURIComponent(req.patient_name),
                    treatmentType: req.preferred_treatment || '',
                  },
                })
              }
            />
          ))}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

// Dashboard
const ds = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F3F4F6' },
  backTxt: { color: '#374151', fontWeight: '600', fontSize: 13 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  badge: {
    backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  filterBar: {
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', maxHeight: 48,
  },
  filterBarContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row' },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB',
  },
  filterTabActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  filterTabTxt: { fontSize: 13, color: '#374151', fontWeight: '600' },
  filterTabTxtActive: { color: '#fff' },
  scroll: { flex: 1 },
  content: { padding: 14 },
  errorBox: {
    backgroundColor: '#FEE2E2', borderRadius: 10, padding: 14, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  errorTxt: { color: '#991B1B', fontSize: 13, flex: 1 },
  retryTxt: { color: '#2563EB', fontSize: 13, fontWeight: '700', marginLeft: 8 },
  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#374151', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingHorizontal: 24 },
});

// Card
const cs = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    borderLeftWidth: 3, borderLeftColor: 'transparent',
  },
  cardUrgent: { borderLeftColor: '#F59E0B' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  topLeft: { flex: 1, gap: 3 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assignedBadge: {
    alignSelf: 'flex-start', backgroundColor: '#EFF6FF', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: '#BFDBFE',
  },
  assignedText: { fontSize: 10, color: '#1D4ED8', fontWeight: '700' },
  patientName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  ts: { fontSize: 11, color: '#9CA3AF' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusDotPending: { backgroundColor: '#F59E0B' },
  statusDotAnswered: { backgroundColor: '#10B981' },
  description: { fontSize: 13, color: '#374151', lineHeight: 19, marginBottom: 6 },
  readMore: { fontSize: 12, color: '#2563EB', fontWeight: '600', marginBottom: 4 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  metaChip: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  metaChipGray: { backgroundColor: '#E5E7EB' },
  metaChipText: { fontSize: 11, color: '#374151', fontWeight: '500' },

  // Quick action row
  quickRow: { flexDirection: 'row', gap: 6 },
  quickBtn: {
    flex: 1, backgroundColor: '#EFF6FF', borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE',
    paddingVertical: 8, alignItems: 'center', gap: 2,
  },
  quickEmoji: { fontSize: 18 },
  quickLabel: { fontSize: 10, color: '#1D4ED8', fontWeight: '700' },
  quickBtnMore: {
    width: 40, backgroundColor: '#F3F4F6', borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  quickMoreTxt: { fontSize: 18, color: '#6B7280', fontWeight: '700', lineHeight: 24 },

  // Answered state
  answeredRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  answeredBadge: {
    backgroundColor: '#D1FAE5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  answeredBadgeText: { fontSize: 12, fontWeight: '700', color: '#065F46' },
  chatBtn: {
    flex: 1, backgroundColor: '#EFF6FF', borderRadius: 8, borderWidth: 1,
    borderColor: '#BFDBFE', paddingVertical: 7, alignItems: 'center',
  },
  chatBtnText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  resendBtn: {
    backgroundColor: '#F3F4F6', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB',
    paddingHorizontal: 12, paddingVertical: 7,
  },
  resendBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },
});

// Modal
const ms = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%',
  },
  handleBar: {
    width: 36, height: 4, backgroundColor: '#D1D5DB', borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 17, fontWeight: '800', color: '#111827' },
  patientRow: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  closeBtn: { paddingLeft: 16, paddingTop: 2 },
  closeTxt: { fontSize: 18, color: '#9CA3AF' },
  scroll: { paddingHorizontal: 18 },

  summaryBox: {
    backgroundColor: '#F3F4F6', borderRadius: 10, padding: 12, marginTop: 14, marginBottom: 2,
  },
  summaryLabel: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5, marginBottom: 4 },
  summaryText: { fontSize: 13, color: '#374151', lineHeight: 18 },
  summaryBudget: { fontSize: 12, color: '#6B7280', marginTop: 4, fontWeight: '600' },

  presetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 14,
  },
  presetBadge: { fontSize: 15, fontWeight: '700', color: '#2563EB' },
  changeTypeLink: { fontSize: 12, color: '#6B7280', fontWeight: '600', textDecorationLine: 'underline' },

  typePicker: { marginTop: 14 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  typeChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB',
  },
  typeChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  typeChipText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  typeChipTextActive: { color: '#fff' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#111827', backgroundColor: '#FAFAFA',
  },
  inputError: { borderColor: '#EF4444', borderWidth: 1.5 },
  errorHint: { fontSize: 12, color: '#DC2626', marginTop: 4, fontWeight: '600' },
  textarea: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 14, color: '#111827', backgroundColor: '#FAFAFA',
    minHeight: 72, textAlignVertical: 'top',
  },
  disclaimer: {
    backgroundColor: '#FEF9C3', borderRadius: 8, padding: 10, marginTop: 14,
    borderLeftWidth: 3, borderLeftColor: '#F59E0B',
  },
  disclaimerText: { fontSize: 11, color: '#92400E', lineHeight: 16 },
  sendBtn: {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 18,
  },
  sendBtnDisabled: { backgroundColor: '#93C5FD' },
  sendBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
