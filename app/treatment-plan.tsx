import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, SafeAreaView, RefreshControl,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { API_ROUTES } from '../lib/api-routes';
import { secureGet } from '../lib/secure-fetch';

// ── Procedure type → human-readable label ────────────────────────────────────
const PROC_LABELS: Record<string, string> = {
  CROWN: 'Kron',
  TEMP_CROWN: 'Geçici Kron',
  BRIDGE_UNIT: 'Köprü Ünitesi',
  TEMP_BRIDGE: 'Geçici Köprü',
  IMPLANT: 'İmplant',
  FILLING: 'Dolgu',
  EXTRACTION: 'Çekim',
  ROOT_CANAL: 'Kanal Tedavisi',
  CLEANING: 'Temizlik',
  VENEER: 'Veneer',
  INLAY: 'İnley',
  ONLAY: 'Onley',
  SINUS_LIFT: 'Sinüs Lift',
  BONE_GRAFT: 'Kemik Grefti',
  GUM_TREATMENT: 'Diş Eti Tedavisi',
  WHITENING: 'Beyazlatma',
  XRAY: 'Röntgen',
  CONSULTATION: 'Konsültasyon',
  OTHER: 'Diğer',
};

function procLabel(type: string) {
  return PROC_LABELS[String(type || '').toUpperCase()] || type || '—';
}

// ── Status → Turkish label + color ───────────────────────────────────────────
function statusInfo(s: string) {
  const upper = String(s || '').toUpperCase();
  if (upper === 'COMPLETED' || upper === 'DONE') return { label: 'Tamamlandı', color: '#10B981', bg: '#D1FAE5' };
  if (upper === 'SCHEDULED')                    return { label: 'Planlandı',   color: '#2563EB', bg: '#DBEAFE' };
  if (upper === 'PLANNED')                      return { label: 'Planlı',      color: '#6366F1', bg: '#EEF2FF' };
  if (upper === 'ACTIVE')                       return { label: 'Aktif',       color: '#F59E0B', bg: '#FEF3C7' };
  if (upper === 'CANCELLED' || upper === 'CANCELED') return { label: 'İptal', color: '#EF4444', bg: '#FEE2E2' };
  return { label: s || 'Bekliyor', color: '#6B7280', bg: '#F3F4F6' };
}

type Treatment = {
  id: string;
  tooth_number: number | null;
  procedure_type: string;
  status: string;
  scheduled_at: string | null;
  chair: string | null;
};

export default function TreatmentPlanScreen() {
  const router = useRouter();
  const { patientId, encounterId } = useLocalSearchParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [diagnoses, setDiagnoses] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!patientId) {
      router.replace({ pathname: '/doctor/diagnosis', params: { patientId } });
      return;
    }
    try {
      setError(null);

      const [txResult, dxResult] = await Promise.allSettled([
        secureGet(API_ROUTES.doctor.patientTreatments(patientId as string), user?.token),
        secureGet(API_ROUTES.doctor.patientDiagnoses(patientId as string), user?.token),
      ]);

      if (txResult.status === 'fulfilled') {
        setTreatments(txResult.value?.treatments || []);
      } else {
        console.warn('[TreatmentPlan] treatments fetch failed:', txResult.reason?.message);
        setTreatments([]);
      }

      if (dxResult.status === 'fulfilled') {
        setDiagnoses(dxResult.value?.diagnoses || []);
      } else {
        console.warn('[TreatmentPlan] diagnoses fetch failed:', dxResult.reason?.message);
        setDiagnoses([]);
      }
    } catch (e: any) {
      console.error('[TreatmentPlan] load error:', e.message);
      setError('Veriler yüklenemedi');
    }
  }, [patientId, user?.token]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleDateString('tr-TR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    } catch { return null; }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Yükleniyor…</Text>
      </SafeAreaView>
    );
  }

  const primaryDx = diagnoses.find((d) => d.is_primary) || diagnoses[0];

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tedavi Planı</Text>
        <TouchableOpacity
          style={styles.dashBtn}
          onPress={() => router.replace('/doctor')}
        >
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
              {primaryDx.icd10_code ? `${primaryDx.icd10_code} — ` : ''}{primaryDx.icd10_description || ''}
              {primaryDx.tooth_number ? `  (Diş ${primaryDx.tooth_number})` : ''}
            </Text>
          </View>
        )}

        {/* Error */}
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Treatment list */}
        {treatments.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🦷</Text>
            <Text style={styles.emptyText}>Henüz tedavi kaydı yok</Text>
            <Text style={styles.emptySubText}>
              Admin panelinden veya doktor ekranından prosedür eklendiğinde burada görünür.
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>
              Tedaviler ({treatments.length})
            </Text>
            {treatments.map((tx) => {
              const si = statusInfo(tx.status);
              const date = formatDate(tx.scheduled_at);
              return (
                <View key={tx.id} style={styles.card}>
                  <View style={styles.cardRow}>
                    <View style={styles.toothBadge}>
                      <Text style={styles.toothBadgeText}>
                        {tx.tooth_number ? `Diş ${tx.tooth_number}` : '—'}
                      </Text>
                    </View>
                    <View style={[styles.statusPill, { backgroundColor: si.bg }]}>
                      <Text style={[styles.statusPillText, { color: si.color }]}>{si.label}</Text>
                    </View>
                  </View>

                  <Text style={styles.procName}>{procLabel(tx.procedure_type)}</Text>

                  <View style={styles.cardMeta}>
                    {date && (
                      <Text style={styles.metaText}>📅 {date}</Text>
                    )}
                    {tx.chair && (
                      <Text style={styles.metaText}>💺 Koltuk {tx.chair}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </>
        )}

        {/* Diagnoses summary */}
        {diagnoses.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
              Tanılar ({diagnoses.length})
            </Text>
            {diagnoses.map((dx) => (
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
                  {dx.icd10_code ? `${dx.icd10_code}` : ''}{dx.icd10_code && dx.icd10_description ? ' — ' : ''}{dx.icd10_description || ''}
                </Text>
              </View>
            ))}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6' },
  loadingText: { marginTop: 12, color: '#6B7280', fontSize: 14 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  backBtnText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  dashBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#2563EB',
  },
  dashBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  scroll: { flex: 1 },
  content: { padding: 16 },

  dxBadge: {
    backgroundColor: '#EFF6FF',
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  dxBadgeLabel: { fontSize: 11, fontWeight: '700', color: '#1D4ED8', textTransform: 'uppercase', marginBottom: 4 },
  dxBadgeText: { fontSize: 13, color: '#1E40AF', fontWeight: '600' },

  errorBox: { backgroundColor: '#FEE2E2', borderRadius: 8, padding: 12, marginBottom: 16 },
  errorText: { color: '#991B1B', fontSize: 13 },

  emptyBox: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#374151', marginBottom: 6 },
  emptySubText: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 18, maxWidth: 280 },

  sectionTitle: {
    fontSize: 15, fontWeight: '700', color: '#374151',
    marginBottom: 10,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  dxCard: { borderLeftWidth: 3, borderLeftColor: '#7C3AED' },

  cardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },

  toothBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  toothBadgeDx: { backgroundColor: '#EDE9FE' },
  toothBadgeText: { fontSize: 12, fontWeight: '700', color: '#1D4ED8' },

  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusPillText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },

  procName: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 6 },

  cardMeta: { flexDirection: 'row', gap: 12 },
  metaText: { fontSize: 12, color: '#6B7280' },

  primaryPill: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  primaryPillText: { fontSize: 10, fontWeight: '800', color: '#DC2626', textTransform: 'uppercase' },
});
