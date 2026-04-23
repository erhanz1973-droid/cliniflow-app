// app/doctor/patients.tsx — Doctor Patients Screen
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl, Pressable,
  TextInput, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useLanguage } from '../../lib/language-context';
import { apiGet, classifyApiError, TIMEOUT_GET_LONG } from '../../lib/api';
import { ErrorScreen, EmptyState } from '../../components/ScreenFeedback';

const PAGE_SIZE = 20;

interface RiskFlag {
  type: 'critical' | 'relevant';
  code: string;
  label: string;
}

interface Patient {
  id: string;
  patient_id?: string;
  patientId?: string;
  name?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  status?: string;
  department?: string;
  created_at?: string;
  createdAt?: number;
  avatar_url?: string;
  hasRisk?: boolean;
  riskFlags?: RiskFlag[];
}

type FilterTab = 'All' | 'Approved' | 'Pending' | 'Rejected';
const FILTER_TABS: FilterTab[] = ['All', 'Approved', 'Pending', 'Rejected'];
const FILTER_KEYS: Record<FilterTab, string> = {
  All: 'doctor.patients.all',
  Approved: 'doctor.patients.approved',
  Pending: 'doctor.patients.pending',
  Rejected: 'doctor.patients.rejected',
};

// Maps raw status → translation key
const STATUS_KEY_MAP: Record<string, string> = {
  ACTIVE:   'doctor.patients.approved',
  APPROVED: 'doctor.patients.approved',
  PENDING:  'doctor.patients.pending',
  REJECTED: 'doctor.patients.rejected',
  INACTIVE: 'doctor.patients.rejected',
};

// Maps raw status → color bucket (stable, language-agnostic)
type StatusBucket = 'Approved' | 'Pending' | 'Rejected';
const STATUS_BUCKET: Record<string, StatusBucket> = {
  ACTIVE:   'Approved',
  APPROVED: 'Approved',
  PENDING:  'Pending',
  REJECTED: 'Rejected',
  INACTIVE: 'Rejected',
};

function patientDisplayName(p: Patient): string {
  return p.name || p.full_name
    || [p.first_name, p.last_name].filter(Boolean).join(' ')
    || 'Hasta';
}

function patientStatusBucket(p: Patient): StatusBucket {
  const s = String(p.status || '').toUpperCase();
  return STATUS_BUCKET[s] || 'Pending';
}

function patientStatusKey(p: Patient): string {
  const s = String(p.status || '').toUpperCase();
  return STATUS_KEY_MAP[s] || 'doctor.patients.pending';
}

function statusColor(s: StatusBucket) {
  switch (s) {
    case 'Approved': return { bg: '#D1FAE5', text: '#065F46' };
    case 'Pending':  return { bg: '#FEF3C7', text: '#92400E' };
    case 'Rejected': return { bg: '#FEE2E2', text: '#991B1B' };
    default:         return { bg: '#F3F4F6', text: '#374151' };
  }
}

function fmtDate(iso?: string | number) {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('tr-TR'); } catch { return ''; }
}

export default function DoctorPatientsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { t } = useLanguage();

  const [allPatients, setAllPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('All');

  const fetchPage = useCallback(async (pageNum: number, append: boolean) => {
    try {
      const res = await apiGet<{
        ok: boolean;
        patients?: Patient[];
        page?: number;
        total?: number;
        totalPages?: number;
        hasMore?: boolean;
      }>(`/api/doctor/patients?page=${pageNum}&limit=${PAGE_SIZE}`, { timeoutMs: TIMEOUT_GET_LONG });
      if (res?.ok) {
        const incoming = res.patients ?? [];
        setAllPatients((prev) => append ? [...prev, ...incoming] : incoming);
        setPage(res.page ?? pageNum);
        setTotal(res.total ?? incoming.length);
        setHasMore(res.hasMore ?? false);
      }
    } catch (e) {
      console.error('[DoctorPatients] load error:', e);
      if (!append) setLoadError(classifyApiError(e));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, []);

  const load = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    fetchPage(1, false);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPage(page + 1, true);
  }, [loadingMore, hasMore, page, fetchPage]);

  useEffect(() => { if (user) load(); }, [user, load]);
  const onRefresh = () => { setRefreshing(true); fetchPage(1, false); };

  const visible = allPatients.filter((p) => {
    const name = patientDisplayName(p).toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase())
      || (p.phone || '').includes(search);
    const bucket = patientStatusBucket(p);
    const matchFilter = filter === 'All' || bucket === filter;
    return matchSearch && matchFilter;
  });

  return (
    <SafeAreaView style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('nav.patients')}</Text>
        <View style={styles.headerBtns}>
          <Pressable style={styles.refreshBtn} onPress={onRefresh}>
            <Text style={styles.refreshBtnText}>{t('doctor.patients.refresh')}</Text>
          </Pressable>
          <Pressable style={styles.dashBtn} onPress={() => router.replace('/doctor')}>
            <Text style={styles.dashBtnText}>⌂ {t('nav.dashboard')}</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          placeholder={t('doctor.patients.search')}
          placeholderTextColor="#9CA3AF"
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
        />
      </View>

      {/* ── Filter Tabs ── */}
      <View style={styles.tabRow}>
        {FILTER_TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, filter === tab && styles.tabActive]}
            onPress={() => setFilter(tab)}
          >
            <Text style={[styles.tabText, filter === tab && styles.tabTextActive]}>{t(FILTER_KEYS[tab])}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── List ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : loadError && !allPatients.length ? (
        <ErrorScreen
          kind={loadError}
          onRetry={() => { setLoading(true); load(); }}
          inline
        />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Patient count */}
          {total > 0 && (
            <Text style={styles.countLabel}>
              {visible.length} / {total}
            </Text>
          )}

          {visible.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyTitle}>
                {search ? t('doctor.patients.noResults') : t('doctor.patients.noPatientsYet')}
              </Text>
              <Text style={styles.emptySub}>
                {search ? t('doctor.patients.noResultsSub') : t('doctor.patients.noPatientsYetSub')}
              </Text>
            </View>
          ) : (
            visible.map((p) => {
              const name = patientDisplayName(p);
              const bucket = patientStatusBucket(p);
              const statusLabel = t(patientStatusKey(p));
              const sc = statusColor(bucket);
              const initial = name.charAt(0).toUpperCase();
              return (
                <View key={p.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    {/* Avatar */}
                    <View style={styles.avatarWrap}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initial}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: sc.text }]}>{statusLabel}</Text>
                      </View>
                    </View>

                    {/* Info */}
                    <View style={styles.cardInfo}>
                      <View style={styles.nameRow}>
                        <Text style={styles.cardName}>{name}</Text>
                        {p.hasRisk && (
                          <View style={styles.riskBadge}>
                            <Text style={styles.riskBadgeText}>⚠️ Risk</Text>
                          </View>
                        )}
                      </View>
                      {/* Critical flags first, then relevant */}
                      {(p.riskFlags || []).map((flag, flagIdx) => {
                        const riskKey = `risk.${flag.code}`;
                        const riskLabel = t(riskKey) !== riskKey ? t(riskKey) : flag.label;
                        return (
                          <View
                            key={`${p.id}-rf-${flagIdx}-${flag.code}`}
                            style={[styles.flagRow, flag.type === 'critical' ? styles.flagRowCritical : styles.flagRowRelevant]}
                          >
                            <Text style={[styles.flagText, flag.type === 'critical' ? styles.flagTextCritical : styles.flagTextRelevant]}>
                              {flag.type === 'critical' ? '🚨' : '⚠️'} {riskLabel}
                            </Text>
                          </View>
                        );
                      })}
                      {p.phone ? (
                        <Text style={styles.cardSub}>📱 {p.phone}</Text>
                      ) : null}
                      {p.email ? (
                        <Text style={styles.cardSub} numberOfLines={1}>✉️ {p.email}</Text>
                      ) : null}
                      {(p.created_at || p.createdAt) ? (
                        <Text style={styles.cardSub}>📅 {fmtDate(p.created_at || p.createdAt)}</Text>
                      ) : null}
                    </View>
                  </View>

                  {/* Action buttons */}
                  <View style={styles.cardActions}>
                    <Pressable
                      style={[styles.actionBtn, styles.actionBtnGreen]}
                      onPress={() => router.push(`/doctor/diagnosis?patientId=${p.id}&patientName=${encodeURIComponent(p.name || '')}`)}
                    >
                      <Text style={styles.actionBtnText}>{t('doctor.patients.newTreatment')}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.actionBtnGray]}
                      onPress={() => router.push(`/doctor/diagnosis?patientId=${p.id}&patientName=${encodeURIComponent(p.name || '')}`)}
                    >
                      <Text style={[styles.actionBtnText, { color: '#fff' }]}>{t('doctor.patients.history')}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, styles.actionBtnPurple]}
                      onPress={() =>
                        router.push({
                          pathname: '/doctor/patient-files',
                          params: {
                            patientId: p.patient_id || p.patientId || p.id,
                            patientName: encodeURIComponent(p.name || ''),
                          },
                        })
                      }
                    >
                      <Text style={styles.actionBtnText}>{t('doctor.patients.files')}</Text>
                    </Pressable>
                    {/* Messages button — opens doctor-specific chat (no patient tab bar) */}
                    {(p.patient_id || p.patientId || p.id) && (
                      <Pressable
                        style={[styles.actionBtn, styles.actionBtnMsg]}
                        onPress={() =>
                          router.push({
                            pathname: '/doctor/patient-chat',
                            params: {
                              patientId: p.patient_id || p.patientId || p.id,
                              patientName: encodeURIComponent(p.name || ''),
                            },
                          })
                        }
                      >
                        <Text style={[styles.actionBtnText, { color: '#fff' }]}>💬 {t('doctor.patients.messages') || 'Messages'}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })
          )}
          {/* Load More */}
          {hasMore && !search && (
            <Pressable
              style={[styles.loadMoreBtn, loadingMore && styles.loadMoreBtnDisabled]}
              onPress={loadMore}
              disabled={loadingMore}
            >
              {loadingMore
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.loadMoreBtnText}>{t('doctor.patients.loadMore')}</Text>
              }
            </Pressable>
          )}

          <View style={{ height: 16 }} />
        </ScrollView>
      )}

      {/* ── Bottom Nav ── */}
      <View style={styles.bottomNav}>
        <Pressable style={styles.navItem} onPress={() => router.replace('/doctor')}>
          <Text style={styles.navIcon}>🏠</Text>
          <Text style={styles.navLabel}>{t('nav.dashboard')}</Text>
        </Pressable>
        <Pressable style={[styles.navItem, styles.navItemActive]}>
          <Text style={styles.navIcon}>👥</Text>
          <Text style={[styles.navLabel, styles.navLabelActive]}>{t('nav.patients')}</Text>
        </Pressable>
        <Pressable style={styles.navItem} onPress={() => router.push('/doctor/profile')}>
          <Text style={styles.navIcon}>👤</Text>
          <Text style={styles.navLabel}>{t('nav.profile')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  headerBtns: { flexDirection: 'row', gap: 8 },
  refreshBtn: { backgroundColor: '#2563EB', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
  refreshBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  dashBtn: { backgroundColor: '#10B981', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 7 },
  dashBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Search
  searchWrap: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  searchInput: {
    backgroundColor: '#F9FAFB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
    fontSize: 15, color: '#111827', borderWidth: 1, borderColor: '#E5E7EB',
  },

  // Tabs
  tabRow: { flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 12, paddingBottom: 10, paddingTop: 4, gap: 8, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F3F4F6' },
  tabActive: { backgroundColor: '#2563EB' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  tabTextActive: { color: '#fff' },

  // Patient card
  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  cardTop: { flexDirection: 'row', padding: 14, alignItems: 'flex-start' },
  avatarWrap: { alignItems: 'center', marginRight: 14, gap: 6 },
  avatar: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#E5E7EB', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '700', color: '#374151' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },
  cardInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  riskBadge: { backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  riskBadgeText: { fontSize: 11, fontWeight: '700', color: '#92400E' },
  flagRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, marginBottom: 3 },
  flagRowCritical: { backgroundColor: '#FEE2E2' },
  flagRowRelevant: { backgroundColor: '#FEF3C7' },
  flagText: { fontSize: 11, fontWeight: '600' },
  flagTextCritical: { color: '#991B1B' },
  flagTextRelevant: { color: '#92400E' },
  cardSub: { fontSize: 12, color: '#6B7280', marginBottom: 2 },

  // Action buttons
  cardActions: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  actionBtn: { flex: 1, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  actionBtnGreen: { backgroundColor: '#059669' },
  actionBtnGray: { backgroundColor: '#374151' },
  actionBtnPurple: { backgroundColor: '#7C3AED' },
  actionBtnMsg: { backgroundColor: '#2563EB' },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Empty
  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#374151', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },

  // Pagination
  countLabel: { fontSize: 12, color: '#9CA3AF', marginBottom: 8, marginLeft: 2 },
  loadMoreBtn: {
    backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', marginTop: 8, marginBottom: 4,
  },
  loadMoreBtnDisabled: { opacity: 0.6 },
  loadMoreBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Bottom nav
  bottomNav: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
    paddingBottom: 8, paddingTop: 6,
  },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  navItemActive: {},
  navIcon: { fontSize: 22, marginBottom: 2 },
  navLabel: { fontSize: 11, color: '#6B7280' },
  navLabelActive: { color: '#2563EB', fontWeight: '600' },
});
