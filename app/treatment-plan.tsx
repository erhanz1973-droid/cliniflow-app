import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  ActivityIndicator, SafeAreaView, RefreshControl, Modal,
  TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { API_ROUTES } from '../lib/api-routes';
import { secureGet, securePost } from '../lib/secure-fetch';
import { API_BASE } from '../lib/api';

// ── Procedure types ────────────────────────────────────────────────────────
const PROCEDURES = [
  // Olaylar
  { type: 'CONSULT',        label: 'Konsültasyon',             category: 'Olaylar' },
  { type: 'FOLLOWUP',       label: 'Kontrol',                  category: 'Olaylar' },
  { type: 'LAB',            label: 'Laboratuvar / Tarama',     category: 'Olaylar' },
  // Protetik
  { type: 'CROWN',                          label: 'Kron',                        category: 'Protetik' },
  { type: 'TEMP_CROWN',                     label: 'Geçici Kron',                 category: 'Protetik' },
  { type: 'BRIDGE_UNIT',                    label: 'Köprü Ünitesi',               category: 'Protetik' },
  { type: 'TEMP_BRIDGE_UNIT',               label: 'Geçici Köprü',                category: 'Protetik' },
  { type: 'CROWN_REPLACEMENT',              label: 'Kron Değişimi',               category: 'Protetik' },
  { type: 'BRIDGE_REPLACEMENT_OR_REMOVAL',  label: 'Köprü Değişimi / Çıkarma',   category: 'Protetik' },
  { type: 'INLAY',                          label: 'İnley',                       category: 'Protetik' },
  { type: 'ONLAY',                          label: 'Onley',                       category: 'Protetik' },
  { type: 'OVERLAY',                        label: 'Overlay',                     category: 'Protetik' },
  { type: 'POST_AND_CORE',                  label: 'Post & Kor',                  category: 'Protetik' },
  { type: 'VENEER',                         label: 'Veneer',                      category: 'Protetik' },
  // Restoratif
  { type: 'FILLING',                            label: 'Dolgu',                    category: 'Restoratif' },
  { type: 'TEMP_FILLING',                       label: 'Geçici Dolgu',             category: 'Restoratif' },
  { type: 'FILLING_REPLACEMENT_OR_REMOVAL',     label: 'Dolgu Değişimi / Çıkarma', category: 'Restoratif' },
  // Endodontik
  { type: 'ROOT_CANAL_TREATMENT',   label: 'Kanal Tedavisi',         category: 'Endodontik' },
  { type: 'ROOT_CANAL_RETREATMENT', label: 'Kanal Retreatman',       category: 'Endodontik' },
  { type: 'CANAL_OPENING',          label: 'Kanal Açma',             category: 'Endodontik' },
  { type: 'CANAL_FILLING',          label: 'Kanal Dolgusu',          category: 'Endodontik' },
  { type: 'ROOT_CANAL',             label: 'Kanal (Genel)',          category: 'Endodontik' },
  // Cerrahi
  { type: 'EXTRACTION',          label: 'Çekim',                category: 'Cerrahi' },
  { type: 'SURGICAL_EXTRACTION', label: 'Cerrahi Çekim',        category: 'Cerrahi' },
  { type: 'APICAL_RESECTION',    label: 'Apikal Rezeksiyon',    category: 'Cerrahi' },
  { type: 'SINUS_LIFT',          label: 'Sinüs Lift',           category: 'Cerrahi' },
  { type: 'BONE_GRAFT',          label: 'Kemik Grefti',         category: 'Cerrahi' },
  // İmplant
  { type: 'IMPLANT',          label: 'İmplant',            category: 'İmplant' },
  { type: 'HEALING_ABUTMENT', label: 'Healing Abutment',   category: 'İmplant' },
  { type: 'IMPLANT_CROWN',    label: 'İmplant Kron',       category: 'İmplant' },
  // Diğer
  { type: 'CLEANING',         label: 'Temizlik',           category: 'Diğer' },
  { type: 'GUM_TREATMENT',    label: 'Diş Eti Tedavisi',   category: 'Diğer' },
  { type: 'WHITENING',        label: 'Beyazlatma',         category: 'Diğer' },
  { type: 'XRAY',             label: 'Röntgen',            category: 'Diğer' },
  { type: 'OTHER',            label: 'Diğer',              category: 'Diğer' },
];
const PROC_MAP: Record<string, string> = Object.fromEntries(
  PROCEDURES.map(p => [p.type, p.label])
);
function procLabel(type: string) {
  return PROC_MAP[String(type || '').toUpperCase()] || type || '—';
}

// ── Statuses ───────────────────────────────────────────────────────────────
const STATUSES = [
  { value: 'planned',   label: 'Planlı',       color: '#6366F1', bg: '#EEF2FF' },
  { value: 'scheduled', label: 'Planlandı',     color: '#2563EB', bg: '#DBEAFE' },
  { value: 'active',    label: 'Devam Ediyor',  color: '#F59E0B', bg: '#FEF3C7' },
  { value: 'completed', label: 'Tamamlandı',    color: '#10B981', bg: '#D1FAE5' },
  { value: 'cancelled', label: 'İptal',         color: '#EF4444', bg: '#FEE2E2' },
];
function statusInfo(s: string) {
  return STATUSES.find(x => x.value === String(s || '').toLowerCase())
    ?? { value: s, label: s || '—', color: '#6B7280', bg: '#F3F4F6' };
}

type Treatment = {
  id: string;
  tooth_number: number | null;
  procedure_type: string;
  status: string;
  assigned_doctor_id: string | null;
  assigned_doctor_name?: string;
  scheduled_at: string | null;
  chair: string | null;
};
type Doctor = { id: string; full_name?: string; name?: string; doctor_id?: string };
type Diagnosis = {
  id: string; tooth_number: string | null;
  icd10_code: string; icd10_description: string; is_primary: boolean;
};

function fmt(iso: string | null) {
  if (!iso) return null;
  try { return new Date(iso).toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric' }); }
  catch { return null; }
}

function fmtDateTime(date: Date | null) {
  if (!date) return null;
  const d = date.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const t = date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  return `${d}  ${t}`;
}

// ── Native date+time picker field ─────────────────────────────────────────
function DateTimeField({
  value, onChange,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
}) {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  const current = value ?? new Date();

  const onDateChange = (_: any, selected?: Date) => {
    if (Platform.OS === 'android') setShowDate(false);
    if (selected) {
      // Merge new date with existing time
      const merged = new Date(value ?? new Date());
      merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      onChange(merged);
      if (Platform.OS === 'android') setShowTime(true); // auto open time on Android
    }
  };

  const onTimeChange = (_: any, selected?: Date) => {
    if (Platform.OS === 'android') setShowTime(false);
    if (selected) {
      const merged = new Date(value ?? new Date());
      merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      onChange(merged);
    }
  };

  return (
    <View>
      {/* Display row */}
      <View style={styles.dtRow}>
        <TouchableOpacity style={styles.dtBtn} onPress={() => setShowDate(true)}>
          <Text style={styles.dtBtnIcon}>📅</Text>
          <Text style={styles.dtBtnText}>
            {value
              ? value.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' })
              : 'Tarih seç'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dtBtn} onPress={() => setShowTime(true)}>
          <Text style={styles.dtBtnIcon}>🕐</Text>
          <Text style={styles.dtBtnText}>
            {value
              ? value.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
              : 'Saat seç'}
          </Text>
        </TouchableOpacity>

        {value && (
          <TouchableOpacity style={styles.dtClear} onPress={() => onChange(null as any)}>
            <Text style={styles.dtClearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* iOS inline pickers inside modal */}
      {showDate && (
        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={current}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            minimumDate={new Date()}
            onChange={onDateChange}
            locale="tr-TR"
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={styles.dtDoneBtn} onPress={() => setShowDate(false)}>
              <Text style={styles.dtDoneBtnText}>Tamam</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {showTime && (
        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={current}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onTimeChange}
            locale="tr-TR"
          />
          {Platform.OS === 'ios' && (
            <TouchableOpacity style={styles.dtDoneBtn} onPress={() => setShowTime(false)}>
              <Text style={styles.dtDoneBtnText}>Tamam</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ── Add Treatment Modal ────────────────────────────────────────────────────
function AddModal({
  visible, diagnoses, doctors, token, patientId, currentDoctorId,
  onClose, onAdded,
}: {
  visible: boolean; diagnoses: Diagnosis[]; doctors: Doctor[];
  token?: string; patientId: string; currentDoctorId?: string;
  onClose: () => void; onAdded: (t: Treatment) => void;
}) {
  const [toothInput, setToothInput] = useState('');
  const [selectedProc, setSelectedProc] = useState<typeof PROCEDURES[0] | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [chair, setChair] = useState('');
  const [saving, setSaving] = useState(false);
  const [showProcList, setShowProcList] = useState(false);
  const [showDoctorList, setShowDoctorList] = useState(false);

  const diagnosedTeeth = [...new Set(diagnoses.map(d => String(d.tooth_number || '')).filter(Boolean))];

  const reset = () => {
    setToothInput(''); setSelectedProc(null); setSelectedDoctor(null);
    setSelectedDate(null); setChair(''); setShowProcList(false); setShowDoctorList(false);
  };

  const save = async () => {
    const toothNum = parseInt(toothInput, 10);
    if (isNaN(toothNum) || toothNum < 11 || toothNum > 48) {
      Alert.alert('Hata', 'Geçerli bir diş numarası girin (11-48)'); return;
    }
    if (!selectedProc) { Alert.alert('Hata', 'İşlem seçin'); return; }

    try {
      setSaving(true);
      const body: any = {
        tooth_number: toothNum,
        procedure_type: selectedProc.type,
        scheduled_at: selectedDate ? selectedDate.toISOString() : null,
        chair: chair.trim() || null,
        assigned_doctor_id: selectedDoctor?.id || null,
      };
      const res = await securePost(
        API_ROUTES.doctor.addPatientTreatment(patientId),
        body, token
      );
      if (!res?.ok) throw new Error(res?.error || 'Kaydedilemedi');
      onAdded(res.treatment);
      reset();
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Yeni İşlem Ekle</Text>
            <TouchableOpacity onPress={() => { reset(); onClose(); }}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            {/* Tooth selector */}
            <Text style={styles.fieldLabel}>Diş Numarası *</Text>
            {diagnosedTeeth.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.teethChips}>
                {diagnosedTeeth.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.teethChip, toothInput === t && styles.teethChipActive]}
                    onPress={() => setToothInput(t)}
                  >
                    <Text style={[styles.teethChipText, toothInput === t && styles.teethChipTextActive]}>
                      Diş {t}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <TextInput
              style={styles.input}
              placeholder="11-48 arası"
              keyboardType="numeric"
              value={toothInput}
              onChangeText={setToothInput}
              maxLength={2}
            />

            {/* Procedure picker */}
            <Text style={styles.fieldLabel}>İşlem Türü *</Text>
            <TouchableOpacity style={styles.picker} onPress={() => setShowProcList(!showProcList)}>
              <Text style={selectedProc ? styles.pickerValue : styles.pickerPlaceholder}>
                {selectedProc ? selectedProc.label : 'Seçin…'}
              </Text>
              <Text style={styles.pickerArrow}>{showProcList ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showProcList && (
              <View style={styles.dropDown}>
                <ScrollView nestedScrollEnabled style={{ maxHeight: 260 }}>
                  {(() => {
                    let lastCat = '';
                    return PROCEDURES.map(p => {
                      const catHeader = p.category !== lastCat ? (lastCat = p.category, p.category) : null;
                      return (
                        <React.Fragment key={p.type}>
                          {catHeader && (
                            <View style={styles.dropCatHeader}>
                              <Text style={styles.dropCatText}>{catHeader}</Text>
                            </View>
                          )}
                          <TouchableOpacity
                            style={[styles.dropItem, selectedProc?.type === p.type && styles.dropItemActive]}
                            onPress={() => { setSelectedProc(p); setShowProcList(false); }}
                          >
                            <Text style={[styles.dropItemText, selectedProc?.type === p.type && styles.dropItemTextActive]}>
                              {p.label}
                            </Text>
                          </TouchableOpacity>
                        </React.Fragment>
                      );
                    });
                  })()}
                </ScrollView>
              </View>
            )}

            {/* Doctor picker */}
            <Text style={styles.fieldLabel}>Doktor</Text>
            <TouchableOpacity style={styles.picker} onPress={() => setShowDoctorList(!showDoctorList)}>
              <Text style={selectedDoctor ? styles.pickerValue : styles.pickerPlaceholder}>
                {selectedDoctor ? (selectedDoctor.full_name || selectedDoctor.name || selectedDoctor.id) : 'Seçin…'}
              </Text>
              <Text style={styles.pickerArrow}>{showDoctorList ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showDoctorList && (
              <View style={styles.dropDown}>
                <TouchableOpacity style={styles.dropItem} onPress={() => { setSelectedDoctor(null); setShowDoctorList(false); }}>
                  <Text style={styles.dropItemText}>— Seçilmedi</Text>
                </TouchableOpacity>
                {doctors.map(d => {
                  const isSelf = currentDoctorId && (d.id === currentDoctorId || d.doctor_id === currentDoctorId);
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.dropItem, selectedDoctor?.id === d.id && styles.dropItemActive]}
                      onPress={() => { setSelectedDoctor(d); setShowDoctorList(false); }}
                    >
                      <Text style={[styles.dropItemText, selectedDoctor?.id === d.id && styles.dropItemTextActive]}>
                        {d.full_name || d.name || d.id}{isSelf ? ' (Ben)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Date + Time */}
            <Text style={styles.fieldLabel}>Tarih ve Saat</Text>
            <DateTimeField value={selectedDate} onChange={d => setSelectedDate(d)} />

            {/* Chair */}
            <Text style={styles.fieldLabel}>Koltuk No</Text>
            <View style={styles.inputRow}>
              {['1','2','3','4'].map(n => (
                <TouchableOpacity
                  key={n}
                  style={[styles.chairChip, chair === n && styles.chairChipActive]}
                  onPress={() => setChair(chair === n ? '' : n)}
                >
                  <Text style={[styles.chairChipText, chair === n && styles.chairChipTextActive]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Kaydet</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Edit Treatment Modal ───────────────────────────────────────────────────
function EditModal({
  treatment, doctors, token, currentDoctorId,
  onClose, onUpdated,
}: {
  treatment: Treatment | null; doctors: Doctor[];
  token?: string; currentDoctorId?: string;
  onClose: () => void; onUpdated: (t: Treatment) => void;
}) {
  const [status, setStatus] = useState(treatment?.status || 'planned');
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [chair, setChair] = useState(treatment?.chair || '');
  const [saving, setSaving] = useState(false);
  const [showStatusList, setShowStatusList] = useState(false);
  const [showDoctorList, setShowDoctorList] = useState(false);

  useEffect(() => {
    if (!treatment) return;
    setStatus(treatment.status || 'planned');
    setChair(treatment.chair || '');
    setSelectedDate(treatment.scheduled_at ? new Date(treatment.scheduled_at) : null);
    if (treatment.assigned_doctor_id) {
      const doc = doctors.find(d => d.id === treatment.assigned_doctor_id);
      setSelectedDoctor(doc || null);
    } else {
      setSelectedDoctor(null);
    }
  }, [treatment, doctors]);

  if (!treatment) return null;

  const save = async () => {
    try {
      setSaving(true);
      const body: any = {
        status,
        assigned_doctor_id: selectedDoctor?.id || null,
        scheduled_at: selectedDate ? selectedDate.toISOString() : null,
        chair: chair.trim() || null,
      };
      const res = await fetch(`${API_BASE}${API_ROUTES.doctor.updateTreatment(treatment.id)}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Güncellenemedi');
      onUpdated({ ...treatment, ...data.treatment });
    } catch (e: any) {
      Alert.alert('Hata', e.message || 'Güncellenemedi');
    } finally {
      setSaving(false);
    }
  };

  const si = statusInfo(status);

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>
                Diş {treatment.tooth_number} — {procLabel(treatment.procedure_type)}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalScroll} keyboardShouldPersistTaps="handled">
            {/* Status picker */}
            <Text style={styles.fieldLabel}>Durum</Text>
            <TouchableOpacity style={styles.picker} onPress={() => setShowStatusList(!showStatusList)}>
              <View style={[styles.statusDot, { backgroundColor: si.bg }]}>
                <Text style={[styles.statusDotText, { color: si.color }]}>{si.label}</Text>
              </View>
              <Text style={styles.pickerArrow}>{showStatusList ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showStatusList && (
              <View style={styles.dropDown}>
                {STATUSES.map(s => (
                  <TouchableOpacity
                    key={s.value}
                    style={[styles.dropItem, status === s.value && styles.dropItemActive]}
                    onPress={() => { setStatus(s.value); setShowStatusList(false); }}
                  >
                    <View style={[styles.statusDot, { backgroundColor: s.bg }]}>
                      <Text style={[styles.statusDotText, { color: s.color }]}>{s.label}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Doctor picker */}
            <Text style={styles.fieldLabel}>Doktor Ata</Text>
            <TouchableOpacity style={styles.picker} onPress={() => setShowDoctorList(!showDoctorList)}>
              <Text style={selectedDoctor ? styles.pickerValue : styles.pickerPlaceholder}>
                {selectedDoctor ? (selectedDoctor.full_name || selectedDoctor.name || selectedDoctor.id) : 'Seçin…'}
              </Text>
              <Text style={styles.pickerArrow}>{showDoctorList ? '▲' : '▼'}</Text>
            </TouchableOpacity>
            {showDoctorList && (
              <View style={styles.dropDown}>
                <TouchableOpacity style={styles.dropItem} onPress={() => { setSelectedDoctor(null); setShowDoctorList(false); }}>
                  <Text style={styles.dropItemText}>— Seçilmedi</Text>
                </TouchableOpacity>
                {doctors.map(d => {
                  const isSelf = currentDoctorId && (d.id === currentDoctorId || d.doctor_id === currentDoctorId);
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.dropItem, selectedDoctor?.id === d.id && styles.dropItemActive]}
                      onPress={() => { setSelectedDoctor(d); setShowDoctorList(false); }}
                    >
                      <Text style={[styles.dropItemText, selectedDoctor?.id === d.id && styles.dropItemTextActive]}>
                        {d.full_name || d.name || d.id}{isSelf ? ' (Ben)' : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Date + Time */}
            <Text style={styles.fieldLabel}>Tarih ve Saat</Text>
            <DateTimeField value={selectedDate} onChange={d => setSelectedDate(d)} />

            {/* Chair chips */}
            <Text style={styles.fieldLabel}>Koltuk No</Text>
            <View style={styles.inputRow}>
              {['1','2','3','4'].map(n => (
                <TouchableOpacity
                  key={n}
                  style={[styles.chairChip, chair === n && styles.chairChipActive]}
                  onPress={() => setChair(chair === n ? '' : n)}
                >
                  <Text style={[styles.chairChipText, chair === n && styles.chairChipTextActive]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>Güncelle</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────
export default function TreatmentPlanScreen() {
  const router = useRouter();
  const { patientId } = useLocalSearchParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [editTarget, setEditTarget] = useState<Treatment | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    if (!patientId) return;
    const [txRes, dxRes, drRes] = await Promise.allSettled([
      secureGet(API_ROUTES.doctor.patientTreatments(patientId as string), user?.token),
      secureGet(API_ROUTES.doctor.patientDiagnoses(patientId as string), user?.token),
      secureGet(API_ROUTES.doctor.doctors, user?.token),
    ]);
    if (txRes.status === 'fulfilled') setTreatments(txRes.value?.treatments || []);
    if (dxRes.status === 'fulfilled') setDiagnoses(dxRes.value?.diagnoses || []);
    if (drRes.status === 'fulfilled') {
      const raw = drRes.value;
      setDoctors(raw?.doctors || raw?.data || (Array.isArray(raw) ? raw : []));
    }
  }, [patientId, user?.token]);

  useEffect(() => {
    (async () => { setLoading(true); await load(); setLoading(false); })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await load(); setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Yükleniyor…</Text>
      </SafeAreaView>
    );
  }

  const primaryDx = diagnoses.find(d => d.is_primary) || diagnoses[0];

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace({
              pathname: '/doctor/diagnosis',
              params: { patientId: patientId as string },
            });
          }
        }}>
          <Text style={styles.backBtnText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tedavi Planı</Text>
        <TouchableOpacity style={styles.dashBtn} onPress={() => router.replace('/doctor')}>
          <Text style={styles.dashBtnText}>△ Dashboard</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Primary diagnosis badge */}
        {primaryDx && (
          <View style={styles.dxBadge}>
            <Text style={styles.dxBadgeLabel}>Birincil Tanı</Text>
            <Text style={styles.dxBadgeText}>
              {primaryDx.icd10_code ? `${primaryDx.icd10_code} — ` : ''}{primaryDx.icd10_description}
              {primaryDx.tooth_number ? `  (Diş ${primaryDx.tooth_number})` : ''}
            </Text>
          </View>
        )}

        {/* Treatment list */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>
            Tedaviler {treatments.length > 0 ? `(${treatments.length})` : ''}
          </Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
            <Text style={styles.addBtnText}>+ İşlem Ekle</Text>
          </TouchableOpacity>
        </View>

        {treatments.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🦷</Text>
            <Text style={styles.emptyText}>Henüz tedavi kaydı yok</Text>
            <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setShowAdd(true)}>
              <Text style={styles.emptyAddBtnText}>+ İşlem Ekle</Text>
            </TouchableOpacity>
          </View>
        ) : (
          treatments.map(tx => {
            const si = statusInfo(tx.status);
            const date = fmt(tx.scheduled_at);
            const docName = tx.assigned_doctor_name
              || doctors.find(d => d.id === tx.assigned_doctor_id)?.full_name
              || doctors.find(d => d.id === tx.assigned_doctor_id)?.name;
            return (
              <TouchableOpacity
                key={tx.id}
                style={styles.card}
                activeOpacity={0.75}
                onPress={() => setEditTarget(tx)}
              >
                <View style={styles.cardRow}>
                  <View style={styles.toothBadge}>
                    <Text style={styles.toothBadgeText}>
                      {tx.tooth_number ? `Diş ${tx.tooth_number}` : '—'}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: si.bg }]}>
                    <Text style={[styles.statusPillText, { color: si.color }]}>{si.label}</Text>
                  </View>
                  <Text style={styles.editHint}>›</Text>
                </View>
                <Text style={styles.procName}>{procLabel(tx.procedure_type)}</Text>
                <View style={styles.cardMeta}>
                  {date && <Text style={styles.metaText}>📅 {date}</Text>}
                  {tx.chair && <Text style={styles.metaText}>💺 Koltuk {tx.chair}</Text>}
                  {docName && <Text style={styles.metaText}>👨‍⚕️ {docName}</Text>}
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Diagnoses summary */}
        {diagnoses.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
              Tanılar ({diagnoses.length})
            </Text>
            {diagnoses.map(dx => (
              <View key={dx.id} style={[styles.card, styles.dxCard]}>
                <View style={styles.cardRow}>
                  {dx.tooth_number && (
                    <View style={[styles.toothBadge, styles.toothBadgeDx]}>
                      <Text style={[styles.toothBadgeText, { color: '#7C3AED' }]}>
                        Diş {dx.tooth_number}
                      </Text>
                    </View>
                  )}
                  {dx.is_primary && (
                    <View style={styles.primaryPill}>
                      <Text style={styles.primaryPillText}>BİRİNCİL</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.procName}>
                  {dx.icd10_code}{dx.icd10_code && dx.icd10_description ? ' — ' : ''}{dx.icd10_description}
                </Text>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Edit modal */}
      {editTarget && (
        <EditModal
          treatment={editTarget}
          doctors={doctors}
          token={user?.token}
          currentDoctorId={user?.doctorId}
          onClose={() => setEditTarget(null)}
          onUpdated={updated => {
            setTreatments(prev => prev.map(t => t.id === updated.id ? updated : t));
            setEditTarget(null);
          }}
        />
      )}

      {/* Add modal */}
      <AddModal
        visible={showAdd}
        diagnoses={diagnoses}
        doctors={doctors}
        token={user?.token}
        patientId={patientId as string}
        currentDoctorId={user?.doctorId}
        onClose={() => setShowAdd(false)}
        onAdded={t => { setTreatments(prev => [t, ...prev]); setShowAdd(false); }}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F3F4F6' },
  backBtnText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  dashBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#2563EB' },
  dashBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  scroll: { flex: 1 },
  content: { padding: 16 },

  dxBadge: {
    backgroundColor: '#EFF6FF', borderLeftWidth: 4, borderLeftColor: '#2563EB',
    borderRadius: 8, padding: 12, marginBottom: 16,
  },
  dxBadgeLabel: { fontSize: 11, fontWeight: '700', color: '#1D4ED8', textTransform: 'uppercase', marginBottom: 4 },
  dxBadgeText: { fontSize: 13, color: '#1E40AF', fontWeight: '600' },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#374151' },
  addBtn: { backgroundColor: '#2563EB', paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  emptyBox: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 36, marginBottom: 10 },
  emptyText: { fontSize: 15, fontWeight: '600', color: '#374151', marginBottom: 14 },
  emptyAddBtn: { backgroundColor: '#2563EB', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  emptyAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  dxCard: { borderLeftWidth: 3, borderLeftColor: '#7C3AED' },
  cardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  toothBadge: { backgroundColor: '#DBEAFE', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  toothBadgeDx: { backgroundColor: '#EDE9FE' },
  toothBadgeText: { fontSize: 12, fontWeight: '700', color: '#1D4ED8' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusPillText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  editHint: { marginLeft: 'auto', fontSize: 20, color: '#9CA3AF', lineHeight: 22 },
  procName: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 6 },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metaText: { fontSize: 12, color: '#6B7280' },
  primaryPill: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  primaryPillText: { fontSize: 10, fontWeight: '800', color: '#DC2626', textTransform: 'uppercase' },

  // Modals
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18, borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1 },
  modalClose: { fontSize: 18, color: '#6B7280', paddingLeft: 12 },
  modalScroll: { padding: 18 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 14 },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: '#111827',
    backgroundColor: '#FAFAFA',
  },
  picker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, backgroundColor: '#FAFAFA',
  },
  pickerValue: { fontSize: 15, color: '#111827', flex: 1 },
  pickerPlaceholder: { fontSize: 15, color: '#9CA3AF', flex: 1 },
  pickerArrow: { fontSize: 12, color: '#6B7280', marginLeft: 8 },
  dropDown: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    backgroundColor: '#fff', marginTop: 4,
  },
  dropCatHeader: { paddingHorizontal: 14, paddingVertical: 5, backgroundColor: '#F3F4F6' },
  dropCatText: { fontSize: 11, fontWeight: '700', color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  dropItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  dropItemActive: { backgroundColor: '#EFF6FF' },
  dropItemText: { fontSize: 14, color: '#374151' },
  dropItemTextActive: { color: '#2563EB', fontWeight: '700' },
  statusDot: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start' },
  statusDotText: { fontSize: 13, fontWeight: '700' },
  teethChips: { marginBottom: 8 },
  teethChip: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, backgroundColor: '#fff',
  },
  teethChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  teethChipText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  teethChipTextActive: { color: '#fff' },
  saveBtn: {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 20,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // DateTimeField
  dtRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dtBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11, backgroundColor: '#FAFAFA',
  },
  dtBtnIcon: { fontSize: 16 },
  dtBtnText: { fontSize: 14, color: '#111827', flex: 1 },
  dtClear: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  dtClearText: { fontSize: 14, color: '#6B7280' },
  pickerWrap: {
    backgroundColor: '#F9FAFB', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB', marginTop: 8, overflow: 'hidden',
  },
  dtDoneBtn: {
    backgroundColor: '#2563EB', marginHorizontal: 16, marginBottom: 12,
    borderRadius: 8, paddingVertical: 10, alignItems: 'center',
  },
  dtDoneBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Chair chips
  inputRow: { flexDirection: 'row', gap: 8 },
  chairChip: {
    width: 48, height: 48, borderRadius: 12, borderWidth: 1.5,
    borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FAFAFA',
  },
  chairChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chairChipText: { fontSize: 16, fontWeight: '700', color: '#374151' },
  chairChipTextActive: { color: '#fff' },
});
