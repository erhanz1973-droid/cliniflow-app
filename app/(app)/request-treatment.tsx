// app/request-treatment.tsx — Patient: Submit a Treatment Request
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, Keyboard,
  StatusBar,
  type KeyboardEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useLanguage } from '../../lib/language-context';
import { API_BASE } from '../../lib/api';

type ClinicPick = {
  id: string;
  name: string;
  city?: string | null;
  country?: string | null;
  /** Patient's enrolled clinic from GET /api/patient/me */
  isMine?: boolean;
};

const TREATMENT_OPTIONS = [
  { value: 'IMPLANT',   labelKey: 'treatmentPlan.proc.IMPLANT' },
  { value: 'CROWN',     labelKey: 'treatmentPlan.proc.CROWN' },
  { value: 'BRIDGE',    labelKey: 'treatmentPlan.proc.BRIDGE_UNIT' },
  { value: 'VENEER',    labelKey: 'treatmentPlan.proc.VENEER' },
  { value: 'ALL_ON_4',  labelKey: 'treatReq.proc.allOn4' },
  { value: 'WHITENING', labelKey: 'treatmentPlan.proc.WHITENING' },
  { value: 'EXTRACTION',labelKey: 'treatmentPlan.proc.EXTRACTION' },
  { value: 'CONSULT',   labelKey: 'treatmentPlan.proc.CONSULT' },
  { value: 'OTHER',     labelKey: 'treatmentPlan.proc.OTHER' },
];

export default function RequestTreatmentScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const keyboardVerticalOffsetIos = insets.top + 8;
  const keyboardVerticalOffsetAndroid = (StatusBar.currentHeight ?? 0) + 8;

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = (e: KeyboardEvent) => setKeyboardHeight(e.endCoordinates?.height ?? 0);
    const onHide = () => setKeyboardHeight(0);
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [preferredTreatment, setPreferredTreatment] = useState('');
  const [showProcList, setShowProcList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const [clinicOptions, setClinicOptions] = useState<ClinicPick[]>([]);
  const [clinicsLoading, setClinicsLoading] = useState(true);
  const [clinicLoadError, setClinicLoadError] = useState<string | null>(null);
  const [selectedClinicIds, setSelectedClinicIds] = useState<string[]>([]);
  const [clinicSearch, setClinicSearch] = useState('');

  const selectedProc = TREATMENT_OPTIONS.find(o => o.value === preferredTreatment);

  /** Arama + kısa varsayılan liste (uzun “rastgele” sütun yok). */
  const filteredClinics = useMemo(() => {
    const q = clinicSearch.trim().toLowerCase();
    const mine = clinicOptions.filter((c) => c.isMine);
    const others = clinicOptions
      .filter((c) => !c.isMine)
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      );

    if (q.length > 0) {
      return clinicOptions
        .filter((c) => {
          const hay = `${c.name} ${c.city ?? ''} ${c.country ?? ''}`.toLowerCase();
          return hay.includes(q);
        })
        .sort((a, b) => {
          if (a.isMine && !b.isMine) return -1;
          if (!a.isMine && b.isMine) return 1;
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        });
    }

    if (mine.length > 0) return mine;
    return others.slice(0, 10);
  }, [clinicOptions, clinicSearch]);

  const toggleClinic = useCallback((id: string) => {
    setSelectedClinicIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.token) {
        setClinicsLoading(false);
        return;
      }
      setClinicsLoading(true);
      setClinicLoadError(null);
      try {
        const headers = { Authorization: `Bearer ${user.token}`, Accept: 'application/json' };
        const [meRes, listRes] = await Promise.all([
          fetch(`${API_BASE}/api/patient/me`, { headers }),
          fetch(`${API_BASE}/api/patient/clinics?limit=200`, { headers }),
        ]);
        const me = await meRes.json().catch(() => ({}));
        const listJson = await listRes.json().catch(() => ({}));

        const merged: ClinicPick[] = [];
        const seen = new Set<string>();

        if (me?.ok && me?.clinic?.id) {
          const id = String(me.clinic.id).trim();
          const name = String(me.clinic.name || '').trim() || 'Clinic';
          merged.push({ id, name, isMine: true });
          seen.add(id);
        }

        const rawList = Array.isArray(listJson?.clinics) ? listJson.clinics : [];
        for (const c of rawList) {
          const id = String(c?.id ?? '').trim();
          if (!id || seen.has(id)) continue;
          merged.push({
            id,
            name: String(c?.name ?? 'Clinic').trim() || 'Clinic',
            city: c?.city ?? null,
            country: c?.country ?? null,
          });
          seen.add(id);
        }

        if (cancelled) return;
        setClinicOptions(merged);

        if (me?.ok && me?.clinic?.id) {
          const mid = String(me.clinic.id).trim();
          setSelectedClinicIds([mid]);
        } else if (merged.length === 1) {
          setSelectedClinicIds([merged[0].id]);
        } else {
          setSelectedClinicIds([]);
        }
      } catch {
        if (!cancelled) setClinicLoadError(t('common.error'));
      } finally {
        if (!cancelled) setClinicsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.token, t]);

  const submit = async () => {
    if (!description.trim()) {
      Alert.alert(t('common.error'), t('treatReq.descriptionRequired'));
      return;
    }
    if (!selectedClinicIds.length) {
      Alert.alert(t('common.error'), t('treatReq.selectClinicRequired'));
      return;
    }
    if (!user?.token) {
      Alert.alert(t('common.error'), t('common.notAuthenticated'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/patient/treatment-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({
          description: description.trim(),
          budget: budget.trim() || null,
          preferred_treatment: preferredTreatment || null,
          clinicIds: selectedClinicIds,
        }),
      });
      const data = await res.json();
      if (!data?.ok) {
        const errKey = String(data?.error || '');
        const friendly =
          data?.message ||
          (errKey === 'photo_url_required'
            ? t('treatReq.photoNotRequired') !== 'treatReq.photoNotRequired'
              ? t('treatReq.photoNotRequired')
              : 'Fotoğraf zorunlu değil; lütfen uygulamayı güncelleyin veya tekrar deneyin.'
            : errKey === 'empty_request'
              ? t('treatReq.descriptionRequired')
              : errKey || t('common.error'));
        throw new Error(friendly);
      }
      setSuccess(true);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || t('common.error'));
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.successContainer}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>{t('treatReq.successTitle')}</Text>
          <Text style={styles.successSub}>{t('treatReq.successSub')}</Text>
          <TouchableOpacity
            style={styles.successBtn}
            onPress={() => router.push('/my-requests')}
          >
            <Text style={styles.successBtnText}>{t('treatReq.viewRequests')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.homeBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.homeBtnText}>{t('common.back')}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('treatReq.title')}</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={
          Platform.OS === 'ios' ? keyboardVerticalOffsetIos : keyboardVerticalOffsetAndroid
        }
        enabled
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: 40 + keyboardHeight },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator
        >
          {/* Info banner */}
          <View style={styles.infoBanner}>
            <Text style={styles.infoIcon}>ℹ️</Text>
            <Text style={styles.infoText}>{t('treatReq.infoBanner')}</Text>
          </View>

          {/* Target clinics (required) */}
          <Text style={styles.label}>
            {t('treatReq.targetClinics')} <Text style={styles.required}>*</Text>
          </Text>
          <Text style={styles.hint}>{t('treatReq.targetClinicsHint')}</Text>
          {clinicsLoading ? (
            <View style={styles.clinicLoadingWrap}>
              <ActivityIndicator color="#2563EB" />
              <Text style={styles.hint}>{t('treatReq.loadingClinics')}</Text>
            </View>
          ) : clinicLoadError ? (
            <Text style={styles.errText}>{clinicLoadError}</Text>
          ) : clinicOptions.length === 0 ? (
            <Text style={styles.errText}>
              {t('find_clinic')}: {t('clinic_list.no_match_search')}
            </Text>
          ) : (
            <View style={styles.clinicPickerWrap}>
              <TextInput
                style={styles.clinicSearchInput}
                placeholder={t('treatReq.clinicSearchPlaceholder')}
                placeholderTextColor="#9CA3AF"
                value={clinicSearch}
                onChangeText={setClinicSearch}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
              <Text style={styles.clinicSearchHintSmall}>{t('treatReq.clinicSearchHint')}</Text>
              <ScrollView
                style={styles.clinicScroll}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                {filteredClinics.length === 0 ? (
                  <Text style={styles.clinicScrollEmpty}>{t('treatReq.clinicSearchEmpty')}</Text>
                ) : (
                  filteredClinics.map((c) => {
                    const checked = selectedClinicIds.includes(c.id);
                    const sub = [c.city, c.country].filter(Boolean).join(', ');
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.clinicRow, checked && styles.clinicRowActive]}
                        onPress={() => toggleClinic(c.id)}
                        activeOpacity={0.85}
                      >
                        <Text style={styles.clinicCheck}>{checked ? '☑' : '☐'}</Text>
                        <View style={styles.clinicRowText}>
                          <Text style={styles.clinicName} numberOfLines={1}>
                            {c.name}
                          </Text>
                          <Text style={styles.clinicMetaLine} numberOfLines={1}>
                            {c.isMine ? `${t('treatReq.myClinicBadge')} · ` : ''}
                            {sub || '—'}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>
            </View>
          )}

          {/* Description */}
          <Text style={styles.label}>
            {t('treatReq.description')} <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={[styles.textArea, description.trim() === '' && submitting && styles.inputError]}
            placeholder={t('treatReq.descriptionPlaceholder')}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            maxLength={2000}
            textAlignVertical="top"
          />
          <Text style={styles.counter}>{description.length}/2000</Text>

          {/* Preferred Treatment */}
          <Text style={styles.label}>{t('treatReq.preferredTreatment')}</Text>
          <TouchableOpacity
            style={styles.picker}
            onPress={() => setShowProcList(!showProcList)}
          >
            <Text style={preferredTreatment ? styles.pickerValue : styles.pickerPlaceholder}>
              {selectedProc
                ? (t(selectedProc.labelKey) || selectedProc.value)
                : t('treatReq.selectTreatment')}
            </Text>
            <Text style={styles.pickerArrow}>{showProcList ? '▲' : '▼'}</Text>
          </TouchableOpacity>
          {showProcList && (
            <View style={styles.dropDown}>
              <TouchableOpacity
                style={styles.dropItem}
                onPress={() => { setPreferredTreatment(''); setShowProcList(false); }}
              >
                <Text style={styles.dropItemText}>— {t('treatReq.noPreference')} —</Text>
              </TouchableOpacity>
              {TREATMENT_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.dropItem, preferredTreatment === opt.value && styles.dropItemActive]}
                  onPress={() => { setPreferredTreatment(opt.value); setShowProcList(false); }}
                >
                  <Text style={[styles.dropItemText, preferredTreatment === opt.value && styles.dropItemTextActive]}>
                    {t(opt.labelKey) || opt.value}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Budget */}
          <Text style={styles.label}>{t('treatReq.budget')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('treatReq.budgetPlaceholder')}
            value={budget}
            onChangeText={setBudget}
            maxLength={100}
          />

          {/* Disclaimer */}
          <View style={styles.disclaimer}>
            <Text style={styles.disclaimerText}>{t('treatReq.disclaimer')}</Text>
          </View>

          {/* Submit */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              (submitting || clinicsLoading || !clinicOptions.length) && styles.submitBtnDisabled,
            ]}
            onPress={submit}
            disabled={submitting || clinicsLoading || !clinicOptions.length}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={styles.submitBtnText}>{t('treatReq.submit')}</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F3F4F6' },
  backBtnText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  scroll: { flex: 1 },
  content: { padding: 16 },

  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#EFF6FF', borderRadius: 10, padding: 12, marginBottom: 20,
    borderLeftWidth: 4, borderLeftColor: '#2563EB',
  },
  infoIcon: { fontSize: 16 },
  infoText: { flex: 1, fontSize: 13, color: '#1E40AF', lineHeight: 19 },

  hint: { fontSize: 12, color: '#6B7280', marginBottom: 10, lineHeight: 17 },
  errText: { fontSize: 13, color: '#DC2626', marginBottom: 8 },
  clinicLoadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  clinicPickerWrap: {
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  clinicSearchInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#FAFAFA',
  },
  clinicSearchHintSmall: {
    fontSize: 11,
    color: '#9CA3AF',
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
  },
  /** ~3–4 sığdır; içeride kaydır */
  clinicScroll: {
    maxHeight: 192,
    backgroundColor: '#fff',
  },
  clinicScrollEmpty: {
    padding: 14,
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
  },
  clinicRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  clinicRowActive: {
    backgroundColor: '#EFF6FF',
  },
  clinicCheck: { fontSize: 16, color: '#2563EB' },
  clinicRowText: { flex: 1, minWidth: 0 },
  clinicName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  clinicMetaLine: { fontSize: 11, color: '#6B7280', marginTop: 2 },

  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 14 },
  required: { color: '#EF4444' },

  textArea: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: '#111827',
    backgroundColor: '#fff', minHeight: 120, textAlignVertical: 'top',
  },
  inputError: { borderColor: '#EF4444' },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#111827',
    backgroundColor: '#fff',
  },
  counter: { fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 4 },

  picker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff',
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

  disclaimer: {
    backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, marginTop: 20,
    borderLeftWidth: 4, borderLeftColor: '#F59E0B',
  },
  disclaimerText: { fontSize: 12, color: '#92400E', lineHeight: 18 },

  submitBtn: {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 20,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Success state
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  successIcon: { fontSize: 56, marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  successSub: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  successBtn: {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingHorizontal: 28, paddingVertical: 13, marginBottom: 12, width: '100%', alignItems: 'center',
  },
  successBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  homeBtn: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12,
    paddingHorizontal: 28, paddingVertical: 13, width: '100%', alignItems: 'center',
  },
  homeBtnText: { color: '#374151', fontSize: 15, fontWeight: '600' },
});
