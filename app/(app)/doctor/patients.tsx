// app/doctor/patients.tsx — Doctor Patients Screen
import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  View, Text, FlatList, RefreshControl, Pressable,
  TextInput, StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth, useAuthToken } from '../../../lib/auth';
import { useLanguage } from '../../../lib/language-context';
import { apiGet, classifyApiError, TIMEOUT_GET_LONG } from '../../../lib/api';
import { ErrorScreen } from '../../../components/ScreenFeedback';
import { doctorPatientPrimaryKey, resolveDoctorPatientRouteId } from '../../../lib/doctorPatientId';
import { fetchDoctorThreadSummary } from '../../../lib/doctorMessaging';
import { useDeferredFocusRefresh } from '../../../hooks/use-deferred-focus-refresh';
import { focusPerfStart } from '../../../lib/perfFocus';
import { markPatientChatNav } from '../../../lib/patientChatNavPerf';
import { openDoctorPatientChat } from '../../../lib/navigateCanonicalChat';
import { peekCachedResource, setCachedResource } from '../../../lib/resourceCache';
import {
  doctorPatientArchivedLabel,
  doctorPatientCanReceiveMessages,
  type DoctorPatientLifecycleFields,
} from '../../../lib/doctorPatientLifecycle';

const PAGE_SIZE = 20;
/** First load pulls full roster (backend max 100) so assigned leads are not stuck on page 2+. */
const INITIAL_FETCH_LIMIT = 100;

interface RiskFlag {
  type: 'critical' | 'relevant';
  code: string;
  label: string;
}

interface Patient extends DoctorPatientLifecycleFields {
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

type RosterTab = "active" | "archived";
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

/** Match `thread-summary` `patientDbId` (patients.id UUID, lowercased). */
function patientRowDbKey(p: Patient): string {
  return String(p.id || '').trim().toLowerCase();
}

type PatientsPageCache = {
  patients: Patient[];
  page: number;
  total: number;
  hasMore: boolean;
  rosterTab: RosterTab;
};

function patientsCacheKey(rosterTab: RosterTab): string {
  return rosterTab === "archived" ? "doctor:patients:archived:page1" : "doctor:patients:page1";
}

const PatientCard = memo(function PatientCard({
  p,
  t,
  doctorClinicId,
  allowMessaging,
  msgActivity,
  onDiagnosis,
  onFiles,
  onChat,
}: {
  p: Patient;
  t: (key: string) => string;
  doctorClinicId?: string | null;
  allowMessaging: boolean;
  msgActivity?: { unread: number; hasClinicSideActivity: boolean; enrolledSharedThread?: boolean };
  onDiagnosis: (p: Patient) => void;
  onFiles: (p: Patient) => void;
  onChat: (p: Patient) => void;
}) {
  const name = patientDisplayName(p);
  const bucket = patientStatusBucket(p);
  const statusLabel = t(patientStatusKey(p));
  const sc = statusColor(bucket);
  const initial = name.charAt(0).toUpperCase();
  const shared = Boolean(msgActivity?.enrolledSharedThread);
  const canMessage = allowMessaging && doctorPatientCanReceiveMessages(p, doctorClinicId);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: sc.bg }]}>
            <Text style={[styles.statusBadgeText, { color: sc.text }]}>{statusLabel}</Text>
          </View>
        </View>
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.cardName}>{name}</Text>
            {p.hasRisk && (
              <View style={styles.riskBadge}>
                <Text style={styles.riskBadgeText}>⚠️ Risk</Text>
              </View>
            )}
          </View>
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
          {p.phone ? <Text style={styles.cardSub}>📱 {p.phone}</Text> : null}
          {p.email ? <Text style={styles.cardSub} numberOfLines={1}>✉️ {p.email}</Text> : null}
          {(p.created_at || p.createdAt) ? (
            <Text style={styles.cardSub}>📅 {fmtDate(p.created_at || p.createdAt)}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.cardActions}>
        <Pressable style={[styles.actionBtn, styles.actionBtnGreen]} onPress={() => onDiagnosis(p)}>
          <Text style={styles.actionBtnText}>{t('doctor.patients.newTreatment')}</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.actionBtnGray]} onPress={() => onDiagnosis(p)}>
          <Text style={[styles.actionBtnText, { color: '#fff' }]}>{t('doctor.patients.history')}</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.actionBtnPurple]} onPress={() => onFiles(p)}>
          <Text style={styles.actionBtnText}>{t('doctor.patients.files')}</Text>
        </Pressable>
        {(p.patient_id || p.patientId || p.id) ? (
          canMessage ? (
            <Pressable
              style={[styles.actionBtn, styles.actionBtnMsg, styles.actionBtnMsgWrap, shared && styles.actionBtnMsgShared]}
              onPress={() => onChat(p)}
              accessibilityLabel={
                shared
                  ? `${t('doctor.patients.messages')} — ${t('doctor.patients.sharedThreadA11y')}`
                  : t('doctor.patients.messages')
              }
            >
              <View style={styles.msgBtnLabelRow}>
                <Text style={[styles.actionBtnText, { color: '#fff' }]}>
                  💬 {t('doctor.patients.messages') || 'Messages'}
                </Text>
                {shared ? (
                  <Text style={styles.msgSharedInline}> · {t('doctor.patients.sharedThreadShort')}</Text>
                ) : null}
              </View>
              {msgActivity && msgActivity.unread > 0 ? (
                <View style={styles.msgUnreadBadge} accessibilityLabel={t('doctor.patients.unreadA11y')}>
                  <Text style={styles.msgUnreadBadgeTxt}>
                    {msgActivity.unread > 99 ? '99+' : String(msgActivity.unread)}
                  </Text>
                </View>
              ) : null}
              {msgActivity && msgActivity.unread === 0 && msgActivity.hasClinicSideActivity ? (
                <View style={styles.msgActivityDot} accessibilityLabel={t('doctor.patients.activityDotA11y')} />
              ) : null}
              {shared && (msgActivity?.unread ?? 0) === 0 && !msgActivity?.hasClinicSideActivity ? (
                <View style={styles.msgSharedDot} accessibilityLabel={t('doctor.patients.sharedThreadA11y')} />
              ) : null}
            </Pressable>
          ) : (
            <View style={[styles.actionBtn, styles.actionBtnArchived, styles.actionBtnMsgWrap]}>
              <Text style={styles.actionBtnArchivedText}>💬 {doctorPatientArchivedLabel(p, t)}</Text>
            </View>
          )
        ) : null}
      </View>
    </View>
  );
});

export default function DoctorPatientsScreen() {
  const { user } = useAuth();
  const token = useAuthToken();
  const router = useRouter();
  const { t } = useLanguage();
  const doctorClinicId = user?.clinicId ?? null;

  const [rosterTab, setRosterTab] = useState<RosterTab>("active");
  const cachedPage = peekCachedResource<PatientsPageCache>(patientsCacheKey(rosterTab));
  const hasDisplayedContentRef = useRef((cachedPage?.patients?.length ?? 0) > 0);
  const [allPatients, setAllPatients] = useState<Patient[]>(cachedPage?.patients ?? []);
  const [loading, setLoading] = useState(!cachedPage);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(cachedPage?.page ?? 1);
  const [hasMore, setHasMore] = useState(cachedPage?.hasMore ?? false);
  const [total, setTotal] = useState(cachedPage?.total ?? 0);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterTab>('All');
  /** Per patient: unread patient messages + indicator when last activity is clinic/admin side. */
  const [msgActivityByPatientId, setMsgActivityByPatientId] = useState<
    Record<string, { unread: number; hasClinicSideActivity: boolean; enrolledSharedThread?: boolean }>
  >({});

  const loadThreadHints = useCallback(async () => {
    const authToken = token.trim();
    if (!authToken) return;
    const endFetch = focusPerfStart('doctor:patients:thread-hints');
    try {
      const data = await fetchDoctorThreadSummary(authToken, { refresh: false, onlyActive: false });
      const next: Record<
        string,
        { unread: number; hasClinicSideActivity: boolean; enrolledSharedThread?: boolean }
      > = {};
      for (const row of data.threads || []) {
        const id = String(row.patientDbId || '').trim().toLowerCase();
        if (!id) continue;
        const unread = Math.max(0, Number(row.unreadFromPatient) || 0);
        const fromUp = String(row.lastMessage?.from || '').toUpperCase();
        const hasClinicSideActivity = Boolean(row.lastMessage && fromUp !== '' && fromUp !== 'PATIENT');
        const la = row.leadPrimaryResponder;
        const enrolledSharedThread = Boolean(la && la.threadIsLead === false);
        next[id] = { unread, hasClinicSideActivity, enrolledSharedThread };
      }
      setMsgActivityByPatientId(next);
    } catch (e) {
      console.warn('[DoctorPatients] thread-summary hints:', e);
    } finally {
      endFetch();
    }
  }, [token]);

  useDeferredFocusRefresh(
    'doctor:patients:focus',
    () => loadThreadHints(),
    { enabled: !!token, minIntervalMs: 30_000 },
  );

  const filterIncomingForTab = useCallback(
    (rows: Patient[], tab: RosterTab) =>
      (rows ?? []).filter((row) =>
        tab === "archived"
          ? !doctorPatientCanReceiveMessages(row, doctorClinicId)
          : doctorPatientCanReceiveMessages(row, doctorClinicId),
      ),
    [doctorClinicId],
  );

  const fetchPage = useCallback(async (pageNum: number, append: boolean, tab: RosterTab) => {
    const endFetch = focusPerfStart(append ? 'doctor:patients:fetch-page-next' : 'doctor:patients:fetch');
    const scope = tab === "archived" ? "archived" : "active";
    try {
      let combined: Patient[] = [];
      let lastPage = pageNum;
      let lastTotal = 0;
      let lastHasMore = false;
      let cursor = pageNum;
      let totalPagesCap = 1;
      let ok = false;

      do {
        const pageLimit =
          !append && cursor === pageNum && pageNum === 1 ? INITIAL_FETCH_LIMIT : PAGE_SIZE;
        const res = await apiGet<{
          ok: boolean;
          patients?: Patient[];
          page?: number;
          total?: number;
          totalPages?: number;
          hasMore?: boolean;
        }>(
          `/api/doctor/patients?page=${cursor}&limit=${pageLimit}&includeHealth=1&scope=${scope}`,
          { timeoutMs: TIMEOUT_GET_LONG },
        );
        if (!res?.ok) break;
        ok = true;

        combined.push(...filterIncomingForTab(res.patients ?? [], tab));
        lastPage = res.page ?? cursor;
        lastTotal = Math.max(Number(res.total) || 0, combined.length);
        lastHasMore = res.hasMore === true;
        totalPagesCap = Math.max(1, Number(res.totalPages) || 1);
        if (!lastHasMore || append) break;
        cursor += 1;
      } while (cursor <= totalPagesCap && cursor <= pageNum + 19);

      if (ok) {
        setAllPatients((prev) => {
          const next = append ? [...prev, ...combined] : combined;
          if (!append) {
            setCachedResource(patientsCacheKey(tab), {
              patients: next,
              page: lastPage,
              total: lastTotal || next.length,
              hasMore: lastHasMore,
              rosterTab: tab,
            } satisfies PatientsPageCache);
            hasDisplayedContentRef.current = next.length > 0;
          }
          return next;
        });
        setPage(lastPage);
        setTotal(lastTotal || combined.length);
        setHasMore(lastHasMore);
      }
    } catch (e) {
      console.error('[DoctorPatients] load error:', e);
      if (!append) setLoadError(classifyApiError(e));
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
      endFetch();
    }
  }, [doctorClinicId, filterIncomingForTab]);

  const load = useCallback((opts?: { blocking?: boolean; tab?: RosterTab }) => {
    const tab = opts?.tab ?? rosterTab;
    setLoadError(null);
    if (opts?.blocking !== false && !hasDisplayedContentRef.current) {
      setLoading(true);
    }
    fetchPage(1, false, tab);
  }, [fetchPage, rosterTab]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    fetchPage(page + 1, true, rosterTab);
  }, [loadingMore, hasMore, page, fetchPage, rosterTab]);

  const switchRosterTab = useCallback(
    (tab: RosterTab) => {
      if (tab === rosterTab) return;
      const cached = peekCachedResource<PatientsPageCache>(patientsCacheKey(tab));
      setRosterTab(tab);
      setFilter("All");
      setSearch("");
      setPage(cached?.page ?? 1);
      setTotal(cached?.total ?? 0);
      setHasMore(cached?.hasMore ?? false);
      setAllPatients(cached?.patients ?? []);
      hasDisplayedContentRef.current = (cached?.patients?.length ?? 0) > 0;
      setLoading(!cached?.patients?.length);
      load({ blocking: !cached?.patients?.length, tab });
    },
    [rosterTab, load],
  );

  const didInitialLoadRef = useRef(false);
  useEffect(() => {
    if (!user || didInitialLoadRef.current) return;
    didInitialLoadRef.current = true;
    if (hasDisplayedContentRef.current) {
      void loadThreadHints();
      return;
    }
    load({ blocking: true });
  }, [user, load, loadThreadHints]);
  const onRefresh = () => {
    setRefreshing(true);
    void (async () => {
      await fetchPage(1, false);
      await loadThreadHints();
    })();
  };

  const visible = allPatients.filter((p) => {
    const archived = !doctorPatientCanReceiveMessages(p, doctorClinicId);
    if (rosterTab === "active" && archived) return false;
    if (rosterTab === "archived" && !archived) return false;
    const name = patientDisplayName(p).toLowerCase();
    const matchSearch = !search || name.includes(search.toLowerCase())
      || (p.phone || '').includes(search);
    const bucket = patientStatusBucket(p);
    const matchFilter = filter === 'All' || bucket === filter;
    return matchSearch && matchFilter;
  });

  const openDiagnosis = useCallback(
    (p: Patient) => {
      const pk = encodeURIComponent(doctorPatientPrimaryKey(p));
      router.push(`/doctor/diagnosis?patientId=${pk}&patientName=${encodeURIComponent(p.name || '')}`);
    },
    [router],
  );

  const openFiles = useCallback(
    (p: Patient) => {
      router.push({
        pathname: '/doctor/patient-files',
        params: {
          patientId: p.patient_id || p.patientId || p.id,
          patientName: encodeURIComponent(p.name || ''),
        },
      });
    },
    [router],
  );

  const openChat = useCallback(
    (p: Patient) => {
      if (!doctorPatientCanReceiveMessages(p, doctorClinicId)) return;
      const patientId = resolveDoctorPatientRouteId({
        id: p.id,
        patient_id: p.patient_id,
        patientId: p.patientId,
      }) || doctorPatientPrimaryKey(p);
      markPatientChatNav('press', { patientId: patientId.slice(0, 12) });
      openDoctorPatientChat(router, {
        patientId,
        patientName: patientDisplayName(p),
      }, { source: 'doctor/patients' });
      markPatientChatNav('router_called', { patientId: patientId.slice(0, 12) });
    },
    [router, doctorClinicId],
  );

  const renderPatient = useCallback(
    ({ item: p }: { item: Patient }) => (
      <PatientCard
        p={p}
        t={t}
        doctorClinicId={doctorClinicId}
        allowMessaging={rosterTab === "active"}
        msgActivity={
          rosterTab === "active" ? msgActivityByPatientId[patientRowDbKey(p)] : undefined
        }
        onDiagnosis={openDiagnosis}
        onFiles={openFiles}
        onChat={openChat}
      />
    ),
    [t, doctorClinicId, rosterTab, msgActivityByPatientId, openDiagnosis, openFiles, openChat],
  );

  const listHeader = (
    <>
      {total > 0 || allPatients.length > 0 ? (
        <Text style={styles.countLabel}>
          {search || filter !== "All"
            ? String(visible.length)
            : `${allPatients.length} / ${total || allPatients.length}`}
        </Text>
      ) : null}
    </>
  );

  const listEmpty = (
    <View style={styles.emptyBox}>
      <Text style={styles.emptyIcon}>👥</Text>
      <Text style={styles.emptyTitle}>
        {search
          ? t('doctor.patients.noResults')
          : rosterTab === "archived"
            ? t('doctor.patients.noArchivedYet')
            : t('doctor.patients.noPatientsYet')}
      </Text>
      <Text style={styles.emptySub}>
        {search
          ? t('doctor.patients.noResultsSub')
          : rosterTab === "archived"
            ? t('doctor.patients.noArchivedYetSub')
            : t('doctor.patients.noPatientsYetSub')}
      </Text>
    </View>
  );

  const showBlockingLoader = loading && allPatients.length === 0;

  return (
    <SafeAreaView style={styles.root}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('nav.patients')}</Text>
        <View style={styles.headerBtns}>
          <Pressable style={styles.refreshBtn} onPress={onRefresh}>
            <Text style={styles.refreshBtnText}>{t('doctor.patients.refresh')}</Text>
          </Pressable>
          <Pressable style={styles.refreshBtn} onPress={() => router.push('/doctor/inbox')}>
            <Text style={styles.refreshBtnText}>
              💬{' '}
              {t('doctor.inbox.title') !== 'doctor.inbox.title' ? t('doctor.inbox.title') : 'Leads Inbox'}
            </Text>
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

      {/* ── Active / Archived roster ── */}
      <View style={styles.rosterTabRow}>
        {(["active", "archived"] as RosterTab[]).map((tab) => (
          <Pressable
            key={tab}
            style={[styles.rosterTab, rosterTab === tab && styles.rosterTabActive]}
            onPress={() => switchRosterTab(tab)}
          >
            <Text style={[styles.rosterTabText, rosterTab === tab && styles.rosterTabTextActive]}>
              {tab === "active" ? t("doctor.patients.rosterActive") : t("doctor.patients.rosterArchived")}
            </Text>
          </Pressable>
        ))}
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
      {showBlockingLoader ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : loadError && !allPatients.length ? (
        <ErrorScreen
          kind={loadError}
          onRetry={() => load({ blocking: true })}
          inline
        />
      ) : (
        <FlatList
          style={styles.scroll}
          contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
          data={visible}
          keyExtractor={(p) => String(p.id || doctorPatientPrimaryKey(p))}
          renderItem={renderPatient}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          removeClippedSubviews
          windowSize={8}
          maxToRenderPerBatch={8}
          initialNumToRender={10}
          ListFooterComponent={
            hasMore && !search ? (
              <Pressable
                style={[styles.loadMoreBtn, loadingMore && styles.loadMoreBtnDisabled]}
                onPress={loadMore}
                disabled={loadingMore}
              >
                {loadingMore
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.loadMoreBtnText}>{t('doctor.patients.loadMore')}</Text>}
              </Pressable>
            ) : null
          }
        />
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

  rosterTabRow: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  rosterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  rosterTabActive: { backgroundColor: '#111827' },
  rosterTabText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  rosterTabTextActive: { color: '#fff' },
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
  actionBtnArchived: {
    backgroundColor: '#E5E7EB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  actionBtnArchivedText: {
    color: '#6B7280',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  actionBtnMsgWrap: { position: 'relative' },
  actionBtnMsgShared: {
    borderWidth: 2,
    borderColor: '#c4b5fd',
    backgroundColor: '#4f46e5',
  },
  msgBtnLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
  msgSharedInline: { fontSize: 10, fontWeight: '700', color: '#e9d5ff' },
  msgUnreadBadge: {
    position: 'absolute',
    top: 4,
    right: 6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  msgUnreadBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
  msgSharedDot: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#a78bfa',
    borderWidth: 1,
    borderColor: '#fff',
  },
  msgActivityDot: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FDE047',
    borderWidth: 1,
    borderColor: '#CA8A04',
  },
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
