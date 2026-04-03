// app/doctor/index.tsx — Doctor Dashboard
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet,
  SafeAreaView, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { apiGet } from '../../lib/api';
import { useLanguage } from '../../lib/language-context';

interface Appointment {
  appointmentId: string;
  date: string;
  time: string;          // UTC HH:MM fallback from server
  scheduledAt?: string;  // raw ISO — use this for local-timezone display
  chairNumber: string;
  patientId: string;
  patientName: string;
  procedureSummary: string;
  status: 'scheduled' | 'in_progress' | 'completed';
}

interface RecentPatient {
  id: string;
  name: string;
  hasRisk: boolean;
  riskFlags: string[];
  lastVisit: string | null;
}

interface DashboardData {
  doctor: { id: string; name: string | null };
  stats: { today: number; planned: number; in_progress: number; done: number };
  todayAppointments: Appointment[];
  tomorrowAppointments: Appointment[];
  recentPatients: RecentPatient[];
}

function greetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'doctor.greeting.morning';
  if (h < 18) return 'doctor.greeting.afternoon';
  return 'doctor.greeting.evening';
}

// Translate a procedure type key (e.g. "VENEER", "ROOT_CANAL_TREATMENT") using t()
// Falls back to the raw value if no translation key exists.
function useProcLabel() {
  const { t } = useLanguage();
  return (raw: string) => {
    if (!raw) return '';
    const key = `treatmentPlan.proc.${raw.trim().toUpperCase()}`;
    const translated = t(key);
    // t() returns the key itself when missing — return raw in that case
    return translated && translated !== key ? translated : raw;
  };
}

function fmtDate(iso: string | null) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleDateString('tr-TR'); } catch { return iso; }
}

// Display time in device-local timezone. Uses scheduledAt (ISO) when present,
// falls back to the pre-formatted UTC string from older API responses.
function fmtApptTime(appt: Appointment): string {
  if (appt.scheduledAt) {
    try {
      return new Date(appt.scheduledAt).toLocaleTimeString('tr-TR', {
        hour: '2-digit', minute: '2-digit', hour12: false,
      });
    } catch { /* fall through */ }
  }
  return appt.time || '';
}

export default function DoctorDashboard() {
  const router = useRouter();
  const { user, isAuthReady, isInitialized, signOut } = useAuth();
  const { t } = useLanguage();
  const procLabel = useProcLabel();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (!isInitialized || !isAuthReady) return;
    if (!user?.token || user.type !== 'doctor') router.replace('/');
  }, [user, isAuthReady, isInitialized, router]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiGet<any>('/api/doctor/dashboard');
      if (res?.ok) setData(res as DashboardData);
    } catch (e: any) {
      console.error('[Doctor Dashboard] load error:', e);
      const msg = String(e?.message || '');
      if (msg.includes('502') || msg.includes('503') || msg.includes('504')) {
        setLoadError('warmingUp');
      } else if (msg.includes('timeout') || msg.includes('Network request failed')) {
        setLoadError('timeout');
      } else {
        setLoadError('generic');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { if (isAuthReady && user?.type === 'doctor') load(); }, [isAuthReady, user, load]);

  // Auto-retry once after 6s when server is warming up
  useEffect(() => {
    if (loadError !== 'warmingUp') return;
    const timer = setTimeout(() => { setLoading(true); load(); }, 6000);
    return () => clearTimeout(timer);
  }, [loadError, load]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const doctorName = data?.doctor?.name || user?.name || '';
  const initial = doctorName ? doctorName.charAt(0).toUpperCase() : 'D';
  const stats = data?.stats ?? { today: 0, planned: 0, in_progress: 0, done: 0 };

  if (!isInitialized || !isAuthReady) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    );
  }

  if (!loading && loadError && !data) {
    const isWarmup = loadError === 'warmingUp';
    return (
      <SafeAreaView style={styles.center}>
        <Text style={styles.errIcon}>{isWarmup ? '⏳' : '⚠️'}</Text>
        <Text style={styles.errTitle}>
          {isWarmup ? t('login.warmingUp') : t('common.error')}
        </Text>
        <Text style={styles.errSub}>
          {isWarmup
            ? t('login.timeout')
            : t('common.pleaseRetry')}
        </Text>
        <Pressable style={styles.retryBtn} onPress={() => { setLoading(true); load(); }}>
          <Text style={styles.retryBtnText}>{t('common.retry')}</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{t(greetingKey())}</Text>
            <Text style={styles.doctorName}>Dr. {doctorName}</Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initial}</Text>
            </View>
            <Pressable
              style={styles.logoutBtn}
              onPress={() =>
                Alert.alert(t('doctor.logout'), t('doctor.logoutConfirm'), [
                  { text: t('doctor.logoutCancel'), style: 'cancel' },
                  { text: t('doctor.logout'), onPress: () => { signOut(); router.replace('/role-select'); } },
                ])
              }
            >
              <Text style={styles.logoutBtnText}>{t('doctor.logout')}</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsRow}>
          {[
            { key: 'doctor.stats.today',      value: stats.today,       color: '#2563EB' },
            { key: 'doctor.stats.planned',     value: stats.planned,     color: '#F59E0B' },
            { key: 'doctor.stats.inProgress',  value: stats.in_progress, color: '#10B981' },
            { key: 'doctor.stats.completed',   value: stats.done,        color: '#9CA3AF' },
          ].map((s) => (
            <View key={s.key} style={[styles.statCard, { borderLeftColor: s.color }]}>
              <Text style={[styles.statNum, { color: s.color }]}>{s.value}</Text>
              <Text style={styles.statLabel}>{t(s.key)}</Text>
            </View>
          ))}
        </View>

        {/* ── Quick Actions ── */}
        <Text style={styles.sectionTitle}>{t('doctor.quickActions')}</Text>
        <View style={styles.quickRow}>
          <Pressable style={styles.quickCard} onPress={() => router.push('/doctor/patients')}>
            <Text style={styles.quickIcon}>👥</Text>
            <Text style={styles.quickLabel}>{t('doctor.quickActions.patients')}</Text>
          </Pressable>
          <Pressable style={styles.quickCard} onPress={() => router.push('/doctor/patients')}>
            <Text style={styles.quickIcon}>🦷</Text>
            <Text style={styles.quickLabel}>{t('doctor.quickActions.xray')}</Text>
          </Pressable>
          <Pressable style={styles.quickCard} onPress={() => router.push('/doctor/requests')}>
            <Text style={styles.quickIcon}>📨</Text>
            <Text style={styles.quickLabel}>{t('doctor.quickActions.requests')}</Text>
          </Pressable>
        </View>

        {/* ── Today's Appointments ── */}
        {loading ? (
          <ActivityIndicator style={{ marginTop: 16 }} color="#2563EB" />
        ) : (
          <>
            <Text style={styles.sectionTitle}>
              {t('doctor.todayAppointments')} ({data?.todayAppointments?.length ?? 0})
            </Text>
            <View style={styles.card}>
              {!data?.todayAppointments?.length ? (
                <Text style={styles.emptyText}>{t('doctor.noAppointments.today')}</Text>
              ) : (
                data.todayAppointments.map((appt) => (
                  <View key={appt.appointmentId} style={styles.apptRow}>
                    <View style={styles.apptTime}>
                      <Text style={styles.apptTimeText}>{fmtApptTime(appt)}</Text>
                      {appt.chairNumber ? (
                        <Text style={styles.apptChair}>{t('doctor.chair')} {appt.chairNumber}</Text>
                      ) : null}
                    </View>
                    <View style={styles.apptInfo}>
                      <Text style={styles.apptName}>{appt.patientName}</Text>
                      {appt.procedureSummary ? (
                        <Text style={styles.apptProc} numberOfLines={1}>{procLabel(appt.procedureSummary)}</Text>
                      ) : null}
                    </View>
                    <View style={[styles.apptStatus, { backgroundColor: appt.status === 'completed' ? '#D1FAE5' : appt.status === 'in_progress' ? '#FEF3C7' : '#EFF6FF' }]}>
                      <Text style={[styles.apptStatusText, { color: appt.status === 'completed' ? '#065F46' : appt.status === 'in_progress' ? '#92400E' : '#1D4ED8' }]}>
                        {appt.status === 'completed' ? t('doctor.status.completed') : appt.status === 'in_progress' ? t('doctor.status.inProgress') : t('doctor.status.scheduled')}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* ── Tomorrow's Appointments ── */}
            <Text style={styles.sectionTitle}>
              {t('doctor.tomorrowAppointments')} ({data?.tomorrowAppointments?.length ?? 0})
            </Text>
            <View style={styles.card}>
              {!data?.tomorrowAppointments?.length ? (
                <Text style={styles.emptyText}>{t('doctor.noAppointments.tomorrow')}</Text>
              ) : (
                data.tomorrowAppointments.map((appt) => (
                  <View key={appt.appointmentId} style={styles.apptRow}>
                    <View style={styles.apptTime}>
                      <Text style={styles.apptTimeText}>{fmtApptTime(appt)}</Text>
                      {appt.chairNumber ? (
                        <Text style={styles.apptChair}>{t('doctor.chair')} {appt.chairNumber}</Text>
                      ) : null}
                    </View>
                    <View style={styles.apptInfo}>
                      <Text style={styles.apptName}>{appt.patientName}</Text>
                      {appt.procedureSummary ? (
                        <Text style={styles.apptProc} numberOfLines={1}>{procLabel(appt.procedureSummary)}</Text>
                      ) : null}
                    </View>
                    <View style={[styles.apptStatus, { backgroundColor: appt.status === 'completed' ? '#D1FAE5' : appt.status === 'in_progress' ? '#FEF3C7' : '#EFF6FF' }]}>
                      <Text style={[styles.apptStatusText, { color: appt.status === 'completed' ? '#065F46' : appt.status === 'in_progress' ? '#92400E' : '#1D4ED8' }]}>
                        {appt.status === 'completed' ? t('doctor.status.completed') : appt.status === 'in_progress' ? t('doctor.status.inProgress') : t('doctor.status.scheduled')}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* ── Recent Patients ── */}
            <Text style={styles.sectionTitle}>{t('doctor.recentPatients')}</Text>
            <View style={styles.card}>
              {!data?.recentPatients?.length ? (
                <Text style={styles.emptyText}>{t('doctor.noPatients')}</Text>
              ) : (
                data.recentPatients.map((p) => (
                  <Pressable
                    key={p.id}
                    style={styles.patientRow}
                    onPress={() => router.push('/doctor/patients')}
                  >
                    <View style={styles.patientAvatar}>
                      <Text style={styles.patientAvatarText}>
                        {p.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.patientInfo}>
                      <View style={styles.patientNameRow}>
                        <Text style={styles.patientName}>{p.name}</Text>
                        {p.hasRisk && (
                          <View style={styles.riskBadge}>
                            <Text style={styles.riskBadgeText}>⚠ Risk</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.patientSub}>
                        {t('doctor.lastVisit')}: {fmtDate(p.lastVisit)}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          </>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ── Bottom Nav ── */}
      <View style={styles.bottomNav}>
        <Pressable style={[styles.navItem, styles.navItemActive]}>
          <Text style={styles.navIcon}>🏠</Text>
          <Text style={[styles.navLabel, styles.navLabelActive]}>{t('nav.dashboard') || 'nav.dashboard'}</Text>
        </Pressable>
        <Pressable style={styles.navItem} onPress={() => router.push('/doctor/patients')}>
          <Text style={styles.navIcon}>👥</Text>
          <Text style={styles.navLabel}>{t('nav.patients') || 'nav.patients'}</Text>
        </Pressable>
        <Pressable style={styles.navItem} onPress={() => router.push('/doctor/profile')}>
          <Text style={styles.navIcon}>👤</Text>
          <Text style={styles.navLabel}>{t('nav.profile') || 'nav.profile'}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F3F4F6', padding: 24 },
  errIcon: { fontSize: 48, marginBottom: 12 },
  errTitle: { fontSize: 16, fontWeight: '700', color: '#111827', textAlign: 'center', marginBottom: 6 },
  errSub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 20 },
  retryBtn: { backgroundColor: '#2563EB', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  scroll: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  greeting: { fontSize: 13, color: '#6B7280' },
  doctorName: { fontSize: 18, fontWeight: '700', color: '#111827', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  logoutBtn: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  logoutBtnText: { color: '#EF4444', fontSize: 13, fontWeight: '600' },

  // Stats
  statsRow: { flexDirection: 'row', padding: 12, gap: 8 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 10,
    borderLeftWidth: 3, alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  statNum: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 10, color: '#6B7280', marginTop: 2, textAlign: 'center' },

  // Sections
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginHorizontal: 16, marginTop: 16, marginBottom: 8 },

  // Quick actions
  quickRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10 },
  quickCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, paddingVertical: 16,
    alignItems: 'center', gap: 6,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  quickIcon: { fontSize: 28 },
  quickLabel: { fontSize: 12, fontWeight: '600', color: '#374151' },

  // Card container
  card: {
    backgroundColor: '#fff', borderRadius: 12, marginHorizontal: 16,
    overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  emptyText: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 20, fontSize: 14 },

  // Appointments
  apptRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  apptTime: { width: 52, marginRight: 10 },
  apptTimeText: { fontSize: 14, fontWeight: '600', color: '#111827' },
  apptChair: { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  apptInfo: { flex: 1 },
  apptName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  apptProc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  apptStatus: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  apptStatusText: { fontSize: 11, fontWeight: '600' },

  // Recent patients
  patientRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  patientAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#DBEAFE', justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  patientAvatarText: { color: '#1D4ED8', fontWeight: '700', fontSize: 15 },
  patientInfo: { flex: 1 },
  patientNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  patientName: { fontSize: 15, fontWeight: '600', color: '#111827' },
  riskBadge: { backgroundColor: '#FEE2E2', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  riskBadgeText: { color: '#DC2626', fontSize: 11, fontWeight: '700' },
  patientSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },

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
