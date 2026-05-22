// app/doctor/diagnosis.tsx — Doctor ICD-10 Diagnosis Screen
import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  ActivityIndicator, Alert, InteractionManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthSession } from '../../../lib/auth';
import { useLanguage } from '../../../lib/language-context';
import { getIcdDescription } from '../../../lib/icdLabels';
import { API_ROUTES } from '../../../lib/api-routes';
import { secureGet, securePost } from '../../../lib/secure-fetch';
import { classifyApiError } from '../../../lib/api';
import TeethFDISelector from '../../../components/TeethFDISelector';
import ToothNumberingChart from '../../../components/ToothNumberingChart';
import ICD10Dropdown from '../../../components/ICD10Dropdown';
import { ErrorScreen, EmptyState } from '../../../components/ScreenFeedback';
import { normalizeRouteParam } from '../../../lib/doctorPatientId';
import { focusPerfMark, focusPerfStart } from '../../../lib/perfFocus';
import {
  peekDiagnosisScreenCache,
  writeDiagnosisScreenCache,
  type DiagnosisScreenCache,
} from '../../../lib/treatmentPlanCache';
import { useDeferredFocusRefresh } from '../../../hooks/use-deferred-focus-refresh';

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

const DiagnosisListCard = memo(function DiagnosisListCard({
  item,
  label,
  primaryLabel,
  toothLabel,
}: {
  item: DiagnosisItem;
  label: string;
  primaryLabel: string;
  toothLabel: string;
}) {
  return (
    <View style={styles.diagnosisCard}>
      <View style={styles.diagnosisCardTop}>
        <Text style={styles.diagnosisCode} numberOfLines={2}>{label}</Text>
        {item.is_primary ? (
          <View style={styles.primaryBadge}>
            <Text style={styles.primaryBadgeText}>{primaryLabel}</Text>
          </View>
        ) : null}
      </View>
      {item.tooth_number ? (
        <Text style={styles.diagnosisTooth}>{toothLabel}</Text>
      ) : null}
    </View>
  );
});

const TreatmentHistoryCard = memo(function TreatmentHistoryCard({
  tr,
  procLabel,
  statusBg,
  statusColor,
  statusLabel,
  toothLine,
  chairLine,
  scheduledLine,
  notes,
}: {
  tr: TreatmentItem;
  procLabel: string;
  statusBg: string;
  statusColor: string;
  statusLabel: string;
  toothLine: string | null;
  chairLine: string | null;
  scheduledLine: string | null;
  notes: string | null;
}) {
  return (
    <View style={styles.treatmentCard}>
      <View style={styles.treatmentCardTop}>
        <Text style={styles.treatmentProc} numberOfLines={2}>{procLabel}</Text>
        <View style={[styles.treatmentStatus, { backgroundColor: statusBg }]}>
          <Text style={[styles.treatmentStatusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
      </View>
      {toothLine ? <Text style={styles.treatmentSub}>{toothLine}</Text> : null}
      {chairLine ? <Text style={styles.treatmentSub}>{chairLine}</Text> : null}
      {scheduledLine ? <Text style={styles.treatmentSub}>{scheduledLine}</Text> : null}
      {notes ? <Text style={styles.treatmentNotes} numberOfLines={2}>{notes}</Text> : null}
    </View>
  );
});

export default function DoctorDiagnosisScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ patientId?: string; encounterId?: string; patientName?: string }>();
  const patientId = normalizeRouteParam(params.patientId);
  const encounterId = normalizeRouteParam(params.encounterId);
  const patientName = typeof params.patientName === "string" ? params.patientName : Array.isArray(params.patientName) ? params.patientName[0] : "";
  const { token } = useAuthSession();
  const { t, currentLanguage } = useLanguage();
  const insets = useSafeAreaInsets();

  const initialCache = patientId ? peekDiagnosisScreenCache(patientId) : null;
  const hasDisplayedContentRef = useRef(Boolean(initialCache));
  const firstPaintLoggedRef = useRef(false);

  const [loadingCritical, setLoadingCritical] = useState(!initialCache);
  const [loadingTreatments, setLoadingTreatments] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [proceeding, setProceeding] = useState(false);
  const [diagnoses, setDiagnoses] = useState<DiagnosisItem[]>(
    (initialCache?.diagnoses as DiagnosisItem[]) ?? [],
  );
  const [treatments, setTreatments] = useState<TreatmentItem[]>(
    (initialCache?.treatments as TreatmentItem[]) ?? [],
  );
  const [showTreatmentHistory, setShowTreatmentHistory] = useState(
    (initialCache?.treatments?.length ?? 0) > 0,
  );
  const [selectedTooth, setSelectedTooth] = useState('');
  const [selectedCode, setSelectedCode] = useState('');
  const [selectedDescription, setSelectedDescription] = useState('');
  const [activeEncounterId, setActiveEncounterId] = useState(
    encounterId || initialCache?.encounterId || '',
  );

  const diagnosesRef = useRef(diagnoses);
  const treatmentsRef = useRef(treatments);
  diagnosesRef.current = diagnoses;
  treatmentsRef.current = treatments;

  const persistCache = useCallback(
    (patch: Partial<DiagnosisScreenCache>) => {
      if (!patientId) return;
      writeDiagnosisScreenCache(patientId, {
        diagnoses: diagnosesRef.current,
        treatments: treatmentsRef.current,
        encounterId: activeEncounterId || patch.encounterId,
        ...patch,
      });
    },
    [patientId, activeEncounterId],
  );

  useEffect(() => {
    if (encounterId) setActiveEncounterId(encounterId);
  }, [encounterId]);

  useEffect(() => {
    if (!patientId || !token) return;
    if (!firstPaintLoggedRef.current) {
      firstPaintLoggedRef.current = true;
      focusPerfMark('doctor:diagnosis:first_paint', {
        patientId,
        cached: Boolean(initialCache),
        diagnoses: diagnoses.length,
        treatments: treatments.length,
      });
    }
  }, [patientId, token, initialCache, diagnoses.length, treatments.length]);

  const loadCritical = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!patientId || !token) return;
      const silent = opts?.silent === true;
      if (!silent && !hasDisplayedContentRef.current) setLoadingCritical(true);
      setLoadError(null);
      const endFetch = focusPerfStart(
        silent ? 'doctor:diagnosis:fetch-silent' : 'doctor:diagnosis:fetch',
      );
      try {
        const diagRes = await secureGet(API_ROUTES.doctor.patientDiagnoses(patientId), token);
        const nextDx = diagRes?.diagnoses || [];
        setDiagnoses(nextDx);
        hasDisplayedContentRef.current = nextDx.length > 0 || hasDisplayedContentRef.current;
        persistCache({ diagnoses: nextDx });
        focusPerfMark('doctor:diagnosis:data_ready', {
          diagnoses: nextDx.length,
          treatments: treatmentsRef.current.length,
        });
      } catch (err) {
        console.error('[Diagnosis] load critical:', err);
        if (!hasDisplayedContentRef.current) setLoadError(classifyApiError(err));
      } finally {
        setLoadingCritical(false);
        endFetch();
      }
    },
    [patientId, token, persistCache],
  );

  const loadTreatmentsSecondary = useCallback(
    async () => {
      if (!patientId || !token) return;
      const endFetch = focusPerfStart('doctor:diagnosis:treatments');
      setLoadingTreatments(true);
      try {
        const treatRes = await secureGet(
          API_ROUTES.doctor.patientTreatments(patientId),
          token,
        ).catch(() => null);
        const nextTx = treatRes?.treatments || [];
        setTreatments(nextTx);
        setShowTreatmentHistory(nextTx.length > 0);
        persistCache({ treatments: nextTx });
      } catch {
        /* non-critical */
      } finally {
        setLoadingTreatments(false);
        endFetch();
      }
    },
    [patientId, token, persistCache],
  );

  const scheduleSecondaryHydration = useCallback(() => {
    InteractionManager.runAfterInteractions(() => {
      void loadTreatmentsSecondary();
    });
  }, [loadTreatmentsSecondary]);

  const ensureEncounter = useCallback(async (): Promise<string> => {
    if (activeEncounterId) return activeEncounterId;
    if (!patientId || !token) return '';
    try {
      const existing = await secureGet(
        API_ROUTES.doctor.encountersByPatient(patientId),
        token,
      );
      const list: unknown[] = existing?.encounters || [];
      if (list.length > 0) {
        const sorted = [...list].sort(
          (a: { created_at?: string }, b: { created_at?: string }) =>
            new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
        );
        const id = String((sorted[0] as { id?: string })?.id || '');
        setActiveEncounterId(id);
        persistCache({ encounterId: id });
        return id;
      }
      const res = await securePost(
        API_ROUTES.doctor.encounters,
        { patient_id: patientId, notes: 'Diagnosis session' },
        token,
      );
      const id = res?.encounter?.id || res?.id || '';
      setActiveEncounterId(id);
      persistCache({ encounterId: id });
      return id;
    } catch (err) {
      console.error('[Diagnosis] ensureEncounter error:', err);
      return '';
    }
  }, [activeEncounterId, patientId, token, persistCache]);

  useEffect(() => {
    if (!token || !patientId) return;
    if (hasDisplayedContentRef.current) {
      void loadCritical({ silent: true });
      scheduleSecondaryHydration();
    } else {
      void loadCritical({ silent: false }).then(() => scheduleSecondaryHydration());
    }
    if (!activeEncounterId) {
      InteractionManager.runAfterInteractions(() => {
        void ensureEncounter();
      });
    }
  }, [token, patientId, loadCritical, scheduleSecondaryHydration, activeEncounterId, ensureEncounter]);

  useDeferredFocusRefresh(
    'doctor:diagnosis:focus',
    () => {
      void loadCritical({ silent: true });
      scheduleSecondaryHydration();
    },
    { enabled: !!token && !!patientId, minIntervalMs: 45_000 },
  );

  const handleToothChange = useCallback((id: string) => {
    setSelectedTooth(id);
    setSelectedCode('');
    setSelectedDescription('');
  }, []);

  const teethDiagnosesProp = useMemo(
    () =>
      diagnoses.map((d) => ({
        id: String(d.id || d.icd10_code),
        tooth_number: d.tooth_number,
      })),
    [diagnoses],
  );

  const chartHighlightedTeeth = useMemo(() => {
    const ids = new Set<string>();
    for (const d of diagnoses) {
      if (d.tooth_number != null && String(d.tooth_number).trim()) {
        ids.add(String(d.tooth_number).trim());
      }
    }
    if (selectedTooth) ids.add(selectedTooth);
    return [...ids];
  }, [diagnoses, selectedTooth]);

  const handleSave = async () => {
    if (saving) return;
    if (!selectedTooth) {
      Alert.alert('', t('diagnosis.selectToothFirst'));
      return;
    }
    if (!selectedCode) {
      Alert.alert('', t('diagnosis.selectICD10First'));
      return;
    }

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
        token,
      );

      setDiagnoses((prev) => {
        const next = [...prev, newItem];
        diagnosesRef.current = next;
        persistCache({ diagnoses: next });
        return next;
      });
      setSelectedCode('');
      setSelectedDescription('');
      Alert.alert('', t('diagnosis.saved'));
      void loadCritical({ silent: true });
    } catch (err) {
      console.error('[Diagnosis] save error:', err);
      Alert.alert(t('common.error'), t('diagnosis.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleProceed = () => {
    if (proceeding) return;
    if (diagnoses.length === 0) {
      Alert.alert('', t('diagnosis.noDiagnosisYet'));
      return;
    }
    if (!patientId) {
      Alert.alert(t('common.error'), t('diagnosis.encounterError'));
      return;
    }

    setProceeding(true);
    const endNav = focusPerfStart('treatment_plan_nav');
    focusPerfMark('treatment_plan_nav:press', { patientId });

    writeDiagnosisScreenCache(patientId, {
      diagnoses,
      treatments,
      encounterId: activeEncounterId,
    });

    router.replace({
      pathname: '/treatment-plan',
      params: {
        patientId,
        encounterId: activeEncounterId || '',
        patientName: patientName || '',
      },
    });

    focusPerfMark('treatment_plan_nav:router_called');
    requestAnimationFrame(() => {
      endNav();
      focusPerfMark('treatment_plan_nav:frame_after_router');
      setProceeding(false);
    });

    if (!activeEncounterId) {
      void ensureEncounter();
    }
  };

  const showListBlockingLoader =
    loadingCritical && !hasDisplayedContentRef.current && diagnoses.length === 0;

  const diagnosisCards = useMemo(() => {
    const toothWord = t('diagnosis.tooth');
    const primaryWord = t('diagnosis.primary');
    return diagnoses.map((d, i) => {
      const localDesc = getIcdDescription(d.icd10_code, d.icd10_description, currentLanguage);
      const label = d.icd10_code ? `${d.icd10_code} - ${localDesc}` : localDesc || '—';
      return (
        <DiagnosisListCard
          key={d.id || `${d.icd10_code}-${d.tooth_number}-${i}`}
          item={d}
          label={label}
          primaryLabel={primaryWord}
          toothLabel={d.tooth_number ? `${toothWord}: ${d.tooth_number}` : ''}
        />
      );
    });
  }, [diagnoses, currentLanguage, t]);

  const treatmentCards = useMemo(() => {
    if (!showTreatmentHistory || treatments.length === 0) return null;
    const locale =
      currentLanguage === 'tr'
        ? 'tr-TR'
        : currentLanguage === 'ru'
          ? 'ru-RU'
          : currentLanguage === 'ka'
            ? 'ka-GE'
            : 'en-US';
    return treatments.map((tr, i) => {
      const st = String(tr.status || '').toLowerCase();
      const isCompleted = st === 'completed' || st === 'done';
      const isInProgress = st === 'in_progress' || st === 'active';
      const statusBg = isCompleted ? '#D1FAE5' : isInProgress ? '#FEF3C7' : '#EFF6FF';
      const statusColor = isCompleted ? '#065F46' : isInProgress ? '#92400E' : '#1D4ED8';
      const statusLabel = isCompleted
        ? t('doctor.status.completed') || 'Tamamlandı'
        : isInProgress
          ? t('doctor.status.inProgress') || 'Devam Ediyor'
          : t('doctor.status.scheduled') || 'Planlandı';
      const procKey = `treatmentPlan.proc.${tr.procedure_type}`;
      const procTr = t(procKey);
      const procLabel = procTr !== procKey ? procTr : tr.procedure_type;
      return (
        <TreatmentHistoryCard
          key={tr.id || `tx-${i}`}
          tr={tr}
          procLabel={procLabel}
          statusBg={statusBg}
          statusColor={statusColor}
          statusLabel={statusLabel}
          toothLine={tr.tooth_number ? `${t('diagnosis.tooth') || 'Diş'}: ${tr.tooth_number}` : null}
          chairLine={tr.chair ? `${t('doctor.chair') || 'Koltuk'}: ${tr.chair}` : null}
          scheduledLine={
            tr.scheduled_at
              ? `📅 ${new Date(tr.scheduled_at).toLocaleString(locale, {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}`
              : null
          }
          notes={tr.notes || null}
        />
      );
    });
  }, [showTreatmentHistory, treatments, currentLanguage, t]);

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/doctor/patients');
          }}
        >
          <Text style={styles.backBtnText}>←</Text>
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('diagnosis.addNew')}</Text>
          {patientName ? (
            <Text style={styles.headerSub}>{decodeURIComponent(patientName)}</Text>
          ) : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <ToothNumberingChart
          compact
          showLegend={false}
          title={t('diagnosis.toothChart')}
          selectedTooth={selectedTooth || null}
          highlightedTeeth={chartHighlightedTeeth}
          onHighlightedToothPress={handleToothChange}
          style={styles.chartReference}
        />

        <TeethFDISelector
          value={selectedTooth || undefined}
          onChange={handleToothChange}
          diagnoses={teethDiagnosesProp}
          title={t('diagnosis.tooth')}
        />

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('diagnosis.selectICD10')}</Text>
          {!selectedTooth ? (
            <View style={styles.placeholderBox}>
              <Text style={styles.placeholderText}>{t('diagnosis.selectToothFirst')}</Text>
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

        <Pressable
          style={[styles.saveBtn, (!selectedTooth || !selectedCode || saving) && styles.saveBtnDisabled]}
          onPress={handleSave}
          disabled={!selectedTooth || !selectedCode || saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>{t('common.save')}</Text>
          )}
        </Pressable>

        <Text style={styles.tanılarTitle}>{t('diagnosis.list')}</Text>

        {showListBlockingLoader ? (
          <ActivityIndicator style={{ marginVertical: 16 }} color="#2563EB" />
        ) : loadError && diagnoses.length === 0 ? (
          <ErrorScreen kind={loadError} onRetry={() => loadCritical({ silent: false })} inline />
        ) : diagnoses.length === 0 ? (
          <EmptyState icon="🦷" titleKey="common.noDiagnoses" subKey="common.noDiagnosesSub" />
        ) : (
          diagnosisCards
        )}

        {(showTreatmentHistory || loadingTreatments) && (
          <>
            <Text style={styles.tanılarTitle}>{t('diagnosis.treatmentHistory')}</Text>
            {loadingTreatments && treatments.length === 0 ? (
              <ActivityIndicator style={{ marginVertical: 8 }} color="#94A3B8" size="small" />
            ) : (
              treatmentCards
            )}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable
          style={[styles.proceedBtn, proceeding && styles.proceedBtnDisabled]}
          onPress={handleProceed}
          disabled={proceeding}
        >
          {proceeding ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.proceedBtnText}>{t('diagnosis.proceedToTreatment')}</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backBtnText: { fontSize: 22, color: '#111827' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280', marginTop: 1 },
  chartReference: {
    marginBottom: 4,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 14, gap: 14 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: '#374151' },
  placeholderBox: {
    backgroundColor: '#fff', borderRadius: 10, padding: 16,
    borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center',
  },
  placeholderText: { fontSize: 14, color: '#9CA3AF' },
  saveBtn: {
    backgroundColor: '#16A34A', borderRadius: 12, padding: 16, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#86EFAC' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  tanılarTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginTop: 4 },
  diagnosisCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  diagnosisCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  diagnosisCode: { fontSize: 14, fontWeight: '600', color: '#111827', flex: 1, marginRight: 8 },
  primaryBadge: { backgroundColor: '#EF4444', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  primaryBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  diagnosisTooth: { fontSize: 12, color: '#6B7280', marginTop: 4 },
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
  bottomBar: {
    backgroundColor: '#1F2937',
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  proceedBtn: { alignItems: 'center', paddingVertical: 4 },
  proceedBtnDisabled: { opacity: 0.5 },
  proceedBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
