// app/doctor/diagnosis.tsx — Doctor ICD-10 Diagnosis Screen
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, Alert, SafeAreaView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useLanguage } from '../../lib/language-context';
import { getIcdDescription } from '../../lib/icdLabels';
import { API_ROUTES } from '../../lib/api-routes';
import { secureGet, securePost } from '../../lib/secure-fetch';
import { classifyApiError } from '../../lib/api';
import TeethFDISelector from '../../components/TeethFDISelector';
import ICD10Dropdown from '../../components/ICD10Dropdown';
import { ErrorScreen, EmptyState } from '../../components/ScreenFeedback';

interface DiagnosisItem {
  id?: string;
  icd10_code: string;
  icd10_description: string;
  tooth_number?: string | number;
  is_primary?: boolean;
}

interface TreatmentItem {
  id: string;
  tooth_number?: string | number;
  procedure_type: string;
  status: string;
  scheduled_at?: string | null;
  chair?: string | null;
  notes?: string | null;
}

export default function DoctorDiagnosisScreen() {
  const router = useRouter();
  const { patientId, encounterId, patientName } = useLocalSearchParams<{ patientId?: string; encounterId?: string; patientName?: string }>();
  const { user } = useAuth();
  const { t, currentLanguage } = useLanguage();

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [proceeding, setProceeding] = useState(false);
  const [diagnoses, setDiagnoses] = useState<DiagnosisItem[]>([]);
  const [treatments, setTreatments] = useState<TreatmentItem[]>([]);
  const [selectedTooth, setSelectedTooth] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
  const [selectedDescription, setSelectedDescription] = useState('');
  const [activeEncounterId, setActiveEncounterId] = useState(encounterId || '');

  // ── Load ALL diagnoses + treatments for this patient ──
  const loadDiagnoses = useCallback(async () => {
    if (!patientId) return;
    setLoadError(null);
    try {
      setLoading(true);
      const [diagRes, treatRes] = await Promise.all([
        secureGet(API_ROUTES.doctor.patientDiagnoses(patientId), user?.token),
        secureGet(API_ROUTES.doctor.patientTreatments(patientId), user?.token).catch(() => null),
      ]);
      setDiagnoses(diagRes?.diagnoses || []);
      setTreatments(treatRes?.treatments || []);
    } catch (err) {
      console.error('[Diagnosis] load error:', err);
      setLoadError(classifyApiError(err));
    } finally {
      setLoading(false);
    }
  }, [patientId, user?.token]);

  // ── Ensure encounter exists (needed for saving new diagnoses) ───────────────
  const ensureEncounter = useCallback(async (): Promise<string> => {
    if (activeEncounterId) return activeEncounterId;
    if (!patientId) return '';
    try {
      const existing = await secureGet(
        API_ROUTES.doctor.encountersByPatient(patientId),
        user?.token,
      );
      const list: any[] = existing?.encounters || [];
      if (list.length > 0) {
        const sorted = [...list].sort((a, b) =>
          new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
        );
        const id = sorted[0].id || '';
        setActiveEncounterId(id);
        return id;
      }
      const res = await securePost(
        API_ROUTES.doctor.encounters,
        { patient_id: patientId, notes: 'Diagnosis session' },
        user?.token,
      );
      const id = res?.encounter?.id || res?.id || '';
      setActiveEncounterId(id);
      return id;
    } catch (err) {
      console.error('[Diagnosis] ensureEncounter error:', err);
      return '';
    }
  }, [activeEncounterId, patientId, user?.token]);

  useEffect(() => {
    if (!user) return;
    loadDiagnoses();
  }, [user, patientId]);

  // ── Save diagnosis ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (saving) return; // guard against multiple taps
    if (!selectedTooth) {
      Alert.alert('', t('diagnosis.selectToothFirst'));
      return;
    }
    if (!selectedCode) {
      Alert.alert('', t('diagnosis.selectICD10First'));
      return;
    }

    // Lock immediately — before any async work so rapid taps are ignored
    setSaving(true);

    try {
      const eid = await ensureEncounter();
      if (!eid) {
        Alert.alert(t('common.error'), t('diagnosis.encounterError'));
        return;
      }

      const alreadyHasPrimary = diagnoses.some(
        (d) => String(d.tooth_number) === selectedTooth && d.is_primary,
      );

      const newItem: DiagnosisItem = {
        icd10_code: selectedCode,
        icd10_description: selectedDescription,
        is_primary: !alreadyHasPrimary,
        tooth_number: selectedTooth,
      };

      await securePost(
        API_ROUTES.doctor.encounterDiagnoses(eid),
        {
          diagnoses: [newItem],
          toothNumbers: [selectedTooth],
        },
        user?.token,
      );

      // Optimistic update — no second network round-trip needed
      setDiagnoses((prev) => [...prev, newItem]);
      setSelectedCode('');
      setSelectedDescription('');
      Alert.alert('', t('diagnosis.saved'));

      // Sync in background to pick up server-assigned id / dedup
      loadDiagnoses();
    } catch (err) {
      console.error('[Diagnosis] save error:', err);
      Alert.alert(t('common.error'), t('diagnosis.saveError'));
    } finally {
      setSaving(false);
    }
  };

  // ── Proceed to treatment plan ───────────────────────────────────────────────
  const handleProceed = async () => {
    if (proceeding) return; // guard against double-tap
    if (diagnoses.length === 0) {
      Alert.alert('', t('diagnosis.noDiagnosisYet'));
      return;
    }
    setProceeding(true);
    try {
      const eid = await ensureEncounter();
      if (!eid) {
        Alert.alert(t('common.error'), t('diagnosis.encounterError'));
        return;
      }
      router.replace({
        pathname: '/treatment-plan',
        params: { patientId: patientId || '', encounterId: eid, patientName: patientName || '' },
      });
    } finally {
      setProceeding(false);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const toothDiagnoses = diagnoses.filter(
    (d) => String(d.tooth_number) === selectedTooth,
  );

  return (
    <SafeAreaView style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/doctor/patients');
          }
        }}>
          <Text style={styles.backBtnText}>←</Text>
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('diagnosis.addNew')}</Text>
          {patientName ? <Text style={styles.headerSub}>{decodeURIComponent(patientName)}</Text> : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        {/* ── Tooth chart ── */}
        <TeethFDISelector
          value={selectedTooth || undefined}
          onChange={(id) => {
            setSelectedTooth(id);
            setSelectedCode('');
            setSelectedDescription('');
          }}
          diagnoses={diagnoses.map((d) => ({ id: String(d.id || d.icd10_code), tooth_number: d.tooth_number }))}
          title={t('diagnosis.toothChart')}
        />

        {/* ── ICD-10 selector ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>
            {t('diagnosis.selectICD10')}
          </Text>

          {!selectedTooth ? (
            <View style={styles.placeholderBox}>
              <Text style={styles.placeholderText}>
                {t('diagnosis.selectToothFirst')}
              </Text>
            </View>
          ) : (
            <ICD10Dropdown
              selectedCode={selectedCode}
              onCodeSelect={(item) => {
                setSelectedCode(item.code);
                setSelectedDescription(item.description);
              }}
              label={t('diagnosis.icd10Placeholder')}
            />
          )}
        </View>

        {/* ── Save button ── */}
        <Pressable
          style={[styles.saveBtn, (!selectedTooth || !selectedCode || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!selectedTooth || !selectedCode || saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.saveBtnText}>{t('common.save')}</Text>
          }
        </Pressable>

        {/* ── Tanılar list ── */}
        <Text style={styles.tanılarTitle}>{t('diagnosis.list')}</Text>

        {loading ? (
          <ActivityIndicator style={{ marginVertical: 16 }} color="#2563EB" />
        ) : loadError ? (
          <ErrorScreen
            kind={loadError}
            onRetry={() => { loadDiagnoses(); }}
            inline
          />
        ) : diagnoses.length === 0 ? (
          <EmptyState
            icon="🦷"
            titleKey="common.noDiagnoses"
            subKey="common.noDiagnosesSub"
          />
        ) : (
          diagnoses.map((d, i) => {
            const localDesc = getIcdDescription(d.icd10_code, d.icd10_description, currentLanguage);
            const label = d.icd10_code
              ? `${d.icd10_code} - ${localDesc}`
              : localDesc || '—';
            return (
              <View key={i} style={styles.diagnosisCard}>
                <View style={styles.diagnosisCardTop}>
                  <Text style={styles.diagnosisCode} numberOfLines={2}>{label}</Text>
                  {d.is_primary && (
                    <View style={styles.primaryBadge}>
                      <Text style={styles.primaryBadgeText}>{t('diagnosis.primary')}</Text>
                    </View>
                  )}
                </View>
                {d.tooth_number ? (
                  <Text style={styles.diagnosisTooth}>
                    {t('diagnosis.tooth')}: {d.tooth_number}
                  </Text>
                ) : null}
              </View>
            );
          })
        )}

        {/* ── Treatment History ── */}
        {treatments.length > 0 && (
          <>
            <Text style={styles.tanılarTitle}>{t('diagnosis.treatmentHistory')}</Text>
            {treatments.map((tr, i) => {
              const st = String(tr.status || '').toLowerCase();
              const isCompleted = st === 'completed' || st === 'done';
              const isInProgress = st === 'in_progress' || st === 'active';
              const statusBg = isCompleted ? '#D1FAE5' : isInProgress ? '#FEF3C7' : '#EFF6FF';
              const statusColor = isCompleted ? '#065F46' : isInProgress ? '#92400E' : '#1D4ED8';
              const statusLabel = isCompleted
                ? (t('doctor.status.completed') || 'Tamamlandı')
                : isInProgress
                ? (t('doctor.status.inProgress') || 'Devam Ediyor')
                : (t('doctor.status.scheduled') || 'Planlandı');
              return (
                <View key={tr.id || i} style={styles.treatmentCard}>
                  <View style={styles.treatmentCardTop}>
                    <Text style={styles.treatmentProc} numberOfLines={2}>
                      {t(`treatmentPlan.proc.${tr.procedure_type}`) !== `treatmentPlan.proc.${tr.procedure_type}`
                        ? t(`treatmentPlan.proc.${tr.procedure_type}`)
                        : tr.procedure_type}
                    </Text>
                    <View style={[styles.treatmentStatus, { backgroundColor: statusBg }]}>
                      <Text style={[styles.treatmentStatusText, { color: statusColor }]}>{statusLabel}</Text>
                    </View>
                  </View>
                  {tr.tooth_number ? (
                    <Text style={styles.treatmentSub}>{t('diagnosis.tooth') || 'Diş'}: {tr.tooth_number}</Text>
                  ) : null}
                  {tr.chair ? (
                    <Text style={styles.treatmentSub}>{t('doctor.chair') || 'Koltuk'}: {tr.chair}</Text>
                  ) : null}
                  {tr.scheduled_at ? (
                    <Text style={styles.treatmentSub}>
                      📅 {new Date(tr.scheduled_at).toLocaleString(
                        currentLanguage === 'tr' ? 'tr-TR' : currentLanguage === 'ru' ? 'ru-RU' : currentLanguage === 'ka' ? 'ka-GE' : 'en-US',
                        { dateStyle: 'short', timeStyle: 'short' }
                      )}
                    </Text>
                  ) : null}
                  {tr.notes ? <Text style={styles.treatmentNotes} numberOfLines={2}>{tr.notes}</Text> : null}
                </View>
              );
            })}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── Proceed to treatment ── */}
      <View style={styles.bottomBar}>
        <Pressable
          style={[styles.proceedBtn, proceeding && styles.proceedBtnDisabled]}
          onPress={handleProceed}
          disabled={proceeding}
        >
          {proceeding
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.proceedBtnText}>{t('diagnosis.proceedToTreatment')}</Text>
          }
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backBtnText: { fontSize: 22, color: '#111827' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },

  scroll: { flex: 1 },
  scrollContent: { padding: 14, gap: 14 },

  // ICD section
  section: { gap: 8 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#374151' },
  placeholderBox: {
    backgroundColor: '#fff', borderRadius: 10, padding: 16,
    borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center',
  },
  placeholderText: { fontSize: 14, color: '#9CA3AF' },

  // Save
  saveBtn: {
    backgroundColor: '#16A34A', borderRadius: 12, padding: 16, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#86EFAC' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  // Tanılar
  tanılarTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginTop: 4 },
  emptyBox: {
    backgroundColor: '#fff', borderRadius: 10, padding: 20, alignItems: 'center',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  emptyText: { fontSize: 14, color: '#9CA3AF' },

  diagnosisCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  diagnosisCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  diagnosisCode: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1, marginRight: 8 },
  primaryBadge: { backgroundColor: '#EF4444', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  primaryBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  diagnosisTooth: { fontSize: 12, color: '#6B7280', marginTop: 4 },

  // Treatment history
  treatmentCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  treatmentCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  treatmentProc: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1, marginRight: 8 },
  treatmentStatus: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  treatmentStatusText: { fontSize: 11, fontWeight: '700' },
  treatmentSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  treatmentNotes: { fontSize: 12, color: '#9CA3AF', marginTop: 4, fontStyle: 'italic' },

  // Bottom
  bottomBar: {
    backgroundColor: '#1F2937', padding: 14,
  },
  proceedBtn: { alignItems: 'center', paddingVertical: 4 },
  proceedBtnDisabled: { opacity: 0.5 },
  proceedBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
