// app/doctor/requests.tsx — Doctor: View incoming treatment requests + submit offers
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

const OFFER_TREATMENT_TYPES = [
  { value: 'IMPLANT',    labelKey: 'treatmentPlan.proc.IMPLANT' },
  { value: 'CROWN',      labelKey: 'treatmentPlan.proc.CROWN' },
  { value: 'BRIDGE',     labelKey: 'treatmentPlan.proc.BRIDGE_UNIT' },
  { value: 'VENEER',     labelKey: 'treatmentPlan.proc.VENEER' },
  { value: 'ALL_ON_4',   labelKey: 'treatReq.proc.allOn4' },
  { value: 'ALL_ON_6',   labelKey: 'treatReq.proc.allOn6' },
  { value: 'WHITENING',  labelKey: 'treatmentPlan.proc.WHITENING' },
  { value: 'EXTRACTION', labelKey: 'treatmentPlan.proc.EXTRACTION' },
  { value: 'ROOT_CANAL', labelKey: 'treatmentPlan.proc.ROOT_CANAL_TREATMENT' },
  { value: 'CONSULT',    labelKey: 'treatmentPlan.proc.CONSULT' },
  { value: 'OTHER',      labelKey: 'treatmentPlan.proc.OTHER' },
];

const DISCLAIMER = 'This is a preliminary estimate. Final diagnosis requires clinical examination.';

type TreatmentRequest = {
  id: string;
  patient_name: string;
  description: string;
  budget: string | null;
  preferred_treatment: string | null;
  status: 'pending' | 'answered' | 'closed';
  created_at: string;
  offer_count: number;
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return iso; }
}

// ── Offer Modal ──────────────────────────────────────────────────────────────
function OfferModal({
  request, token, onClose, onSubmitted,
}: {
  request: TreatmentRequest;
  token?: string;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const { t } = useLanguage();
  const [treatmentType, setTreatmentType] = useState('');
  const [priceRange, setPriceRange] = useState('');
  const [duration, setDuration] = useState('');
  const [note, setNote] = useState('');
  const [showTypeList, setShowTypeList] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedType = OFFER_TREATMENT_TYPES.find(o => o.value === treatmentType);

  const submit = async () => {
    if (!treatmentType) {
      Alert.alert(t('common.error'), t('treatReq.offer.typeRequired'));
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
            treatment_type: treatmentType,
            price_range: priceRange.trim() || null,
            duration: duration.trim() || null,
            note: note.trim() || null,
          }),
        }
      );
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || t('common.error'));
      onSubmitted();
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalOverlay}
      >
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>{t('treatReq.offer.title')}</Text>
              <Text style={styles.modalSub} numberOfLines={1}>{request.patient_name}</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            {/* Patient description summary */}
            <View style={styles.patientRequest}>
              <Text style={styles.patientRequestLabel}>{t('treatReq.patientRequest')}</Text>
              <Text style={styles.patientRequestText} numberOfLines={3}>
                {request.description}
              </Text>
            </View>

            {/* Treatment type */}
            <Text style={styles.fieldLabel}>
              {t('treatReq.offer.treatmentType')} <Text style={{ color: '#EF4444' }}>*</Text>
            </Text>
            <TouchableOpacity
              style={styles.picker}
              onPress={() => setShowTypeList(!showTypeList)}
            >
              <Text style={treatmentType ? styles.pickerValue : styles.pickerPlaceholder}>
                {selectedType ? (t(selectedType.labelKey) || selectedType.value) : t('treatmentPlan.selectProcedure')}
              </Text>
              <Text style={styles.pickerArrow}>{showTypeList ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showTypeList && (
              <View style={styles.dropDown}>
                {OFFER_TREATMENT_TYPES.map(opt => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.dropItem, treatmentType === opt.value && styles.dropItemActive]}
                    onPress={() => { setTreatmentType(opt.value); setShowTypeList(false); }}
                  >
                    <Text style={[styles.dropItemText, treatmentType === opt.value && styles.dropItemTextActive]}>
                      {t(opt.labelKey) || opt.value}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Price range */}
            <Text style={styles.fieldLabel}>{t('treatReq.offer.priceRange')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('treatReq.offer.priceRangePlaceholder')}
              value={priceRange}
              onChangeText={setPriceRange}
              maxLength={100}
            />

            {/* Duration */}
            <Text style={styles.fieldLabel}>{t('treatReq.offer.duration')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('treatReq.offer.durationPlaceholder')}
              value={duration}
              onChangeText={setDuration}
              maxLength={100}
            />

            {/* Note */}
            <Text style={styles.fieldLabel}>{t('treatReq.offer.note')}</Text>
            <TextInput
              style={styles.textArea}
              placeholder={t('treatReq.offer.notePlaceholder')}
              value={note}
              onChangeText={setNote}
              multiline
              numberOfLines={3}
              maxLength={500}
              textAlignVertical="top"
            />

            {/* Disclaimer */}
            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerLabel}>{t('treatReq.offer.disclaimerLabel')}</Text>
              <Text style={styles.disclaimerText}>{DISCLAIMER}</Text>
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, saving && { opacity: 0.6 }]}
              onPress={submit}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.submitBtnText}>{t('treatReq.offer.submit')}</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────
export default function DoctorRequestsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [requests, setRequests] = useState<TreatmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offerTarget, setOfferTarget] = useState<TreatmentRequest | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'answered'>('all');

  const load = useCallback(async () => {
    if (!user?.token) return;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/doctor/treatment-requests`, {
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
    if (filter === 'pending')  return r.status === 'pending';
    if (filter === 'answered') return r.status === 'answered';
    return true;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const statusColor = (s: string) => {
    if (s === 'answered') return { bg: '#D1FAE5', text: '#065F46' };
    return { bg: '#FEF3C7', text: '#92400E' };
  };

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t('treatReq.doctor.title')}</Text>
          {pendingCount > 0 && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 60 }} />
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {(['all', 'pending', 'answered'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {t(`treatReq.filter.${f}`)}
              {f === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {error}</Text>
              <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
                <Text style={styles.retryText}>{t('common.retry')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {!error && filtered.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>📭</Text>
              <Text style={styles.emptyTitle}>{t('treatReq.doctor.noRequests')}</Text>
              <Text style={styles.emptySub}>{t('treatReq.doctor.noRequestsSub')}</Text>
            </View>
          )}

          {filtered.map(req => {
            const sc = statusColor(req.status);
            const isExpanded = expandedId === req.id;
            return (
              <View key={req.id} style={[styles.card, req.status === 'pending' && styles.cardPending]}>
                <TouchableOpacity
                  style={styles.cardHeader}
                  onPress={() => setExpandedId(isExpanded ? null : req.id)}
                  activeOpacity={0.75}
                >
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.patientName}>{req.patient_name}</Text>
                    <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.statusText, { color: sc.text }]}>
                        {req.status === 'answered' ? t('treatReq.status.answered') : t('treatReq.status.pending')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardHeaderRight}>
                    <Text style={styles.cardDate}>{fmtDate(req.created_at)}</Text>
                    <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>
                </TouchableOpacity>

                <Text style={styles.description} numberOfLines={isExpanded ? undefined : 2}>
                  {req.description}
                </Text>

                {isExpanded && (
                  <View style={styles.details}>
                    {req.preferred_treatment && (
                      <Text style={styles.detailRow}>
                        🦷 {t('treatReq.preferredTreatment')}: {t(`treatmentPlan.proc.${req.preferred_treatment}`) || req.preferred_treatment}
                      </Text>
                    )}
                    {req.budget && (
                      <Text style={styles.detailRow}>💰 {t('treatReq.budget')}: {req.budget}</Text>
                    )}
                    {req.offer_count > 0 && (
                      <Text style={styles.detailRow}>
                        📨 {req.offer_count} {t('treatReq.offers')} {t('treatReq.alreadySent')}
                      </Text>
                    )}
                  </View>
                )}

                {/* Action row */}
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.offerBtn}
                    onPress={() => setOfferTarget(req)}
                  >
                    <Text style={styles.offerBtnText}>
                      {req.offer_count > 0 ? t('treatReq.offer.sendAnother') : t('treatReq.offer.makeOffer')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {offerTarget && (
        <OfferModal
          request={offerTarget}
          token={user?.token}
          onClose={() => setOfferTarget(null)}
          onSubmitted={() => {
            setOfferTarget(null);
            load();
            Alert.alert('✅', t('treatReq.offer.sent'));
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F3F4F6' },
  backBtnText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  pendingBadge: {
    backgroundColor: '#EF4444', borderRadius: 10,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  pendingBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  filterRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB',
  },
  filterChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  filterChipText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },

  scroll: { flex: 1 },
  content: { padding: 16 },

  errorBox: {
    backgroundColor: '#FEE2E2', borderRadius: 10, padding: 14, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  errorText: { color: '#991B1B', fontSize: 13, flex: 1 },
  retryText: { color: '#2563EB', fontSize: 13, fontWeight: '700', marginLeft: 8 },

  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#374151', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingHorizontal: 20 },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  cardPending: { borderLeftWidth: 3, borderLeftColor: '#F59E0B' },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  cardHeaderLeft: { flex: 1, gap: 4 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  patientName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, alignSelf: 'flex-start' },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  cardDate: { fontSize: 12, color: '#9CA3AF' },
  chevron: { fontSize: 12, color: '#9CA3AF' },
  description: { fontSize: 13, color: '#374151', lineHeight: 19 },

  details: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  detailRow: { fontSize: 13, color: '#6B7280', marginBottom: 4 },

  actionRow: { marginTop: 12, flexDirection: 'row' },
  offerBtn: {
    flex: 1, backgroundColor: '#2563EB', borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  offerBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18, borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  modalSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  modalClose: { fontSize: 18, color: '#6B7280', paddingLeft: 16 },
  modalScroll: { padding: 18 },

  patientRequest: {
    backgroundColor: '#F3F4F6', borderRadius: 10, padding: 12, marginBottom: 4,
  },
  patientRequestLabel: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', marginBottom: 4 },
  patientRequestText: { fontSize: 13, color: '#374151', lineHeight: 18 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#111827',
    backgroundColor: '#FAFAFA',
  },
  textArea: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#111827',
    backgroundColor: '#FAFAFA', minHeight: 80, textAlignVertical: 'top',
  },
  picker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#FAFAFA',
  },
  pickerValue: { fontSize: 14, color: '#111827', flex: 1 },
  pickerPlaceholder: { fontSize: 14, color: '#9CA3AF', flex: 1 },
  pickerArrow: { fontSize: 12, color: '#6B7280', marginLeft: 8 },
  dropDown: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    backgroundColor: '#fff', marginTop: 4, overflow: 'hidden',
  },
  dropItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  dropItemActive: { backgroundColor: '#EFF6FF' },
  dropItemText: { fontSize: 14, color: '#374151' },
  dropItemTextActive: { color: '#2563EB', fontWeight: '700' },

  disclaimerBox: {
    backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, marginTop: 16,
    borderLeftWidth: 4, borderLeftColor: '#F59E0B',
  },
  disclaimerLabel: { fontSize: 11, fontWeight: '700', color: '#92400E', textTransform: 'uppercase', marginBottom: 4 },
  disclaimerText: { fontSize: 12, color: '#92400E', lineHeight: 18 },

  submitBtn: {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 20,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
