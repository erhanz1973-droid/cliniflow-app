/**
 * Doctor dashboard home — tam panel (GET /api/doctor/dashboard).
 * Route: /doctor
 */
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth";
import { useLanguage } from "../../lib/language-context";
import { API_BASE, setAuthToken } from "../../lib/api";

type DashboardAppt = {
  appointmentId?: string;
  date?: string;
  time?: string;
  patientName?: string;
  procedureSummary?: string;
  status?: string;
  planId?: string | null;
  chairNumber?: string;
};

type PlanRow = {
  id: string;
  status: string;
  procedure_name: string;
  scheduled_date?: string;
  date?: string;
  created_at?: string;
  patient: { name: string };
};

type RecentPatient = {
  id: string;
  name: string;
  hasRisk?: boolean;
  riskFlags?: string[];
  lastVisit?: string | null;
};

type DashboardNotify = {
  id?: string;
  title?: string;
  message?: string;
  created_at?: string;
};

type Stats = {
  planned: number;
  in_progress: number;
  done: number;
  today: number;
  waiting: number;
};

function isSameDay(d1: Date, d2: Date): boolean {
  return (
    d1.getDate() === d2.getDate() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getFullYear() === d2.getFullYear()
  );
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Bazı istemciler dizi yerine { rows: [...] } döner */
function coerceArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  const o = asObj(v);
  if (o) {
    if (Array.isArray(o.rows)) return o.rows;
    if (Array.isArray(o.items)) return o.items;
    if (Array.isArray(o.data)) return o.data;
  }
  return [];
}

/** API camelCase veya snake_case; bazı proxy'ler data içinde döner */
function pickAppointmentArrays(data: Record<string, unknown>): {
  today: unknown[];
  tomorrow: unknown[];
} {
  const nested = asObj(data.data) ?? asObj(data.payload) ?? asObj(data.result);
  const pick = (top: unknown, nest: unknown, snakeTop: unknown, snakeNest: unknown) => {
    const a = coerceArray(top);
    if (a.length) return a;
    const b = coerceArray(nest);
    if (b.length) return b;
    const c = coerceArray(snakeTop);
    if (c.length) return c;
    return coerceArray(snakeNest);
  };
  const today = pick(
    data.todayAppointments,
    nested?.todayAppointments,
    data.today_appointments,
    nested?.today_appointments
  );
  const tomorrow = pick(
    data.tomorrowAppointments,
    nested?.tomorrowAppointments,
    data.tomorrow_appointments,
    nested?.tomorrow_appointments
  );
  return { today, tomorrow };
}

function normalizeApptRaw(raw: unknown): DashboardAppt {
  const r = asObj(raw) ?? {};
  const patient = asObj(r.patient);
  const startInst = r.start_at ?? r.startAt ?? r.start_time ?? r.startTime;
  let dateStr = String(r.date ?? r.appointment_date ?? "").trim();
  let timeStr = String(r.time ?? r.appointment_time ?? "09:00").trim();
  if (!dateStr && startInst != null && String(startInst).length >= 10) {
    const s = String(startInst);
    dateStr = s.slice(0, 10);
    if (!r.time && !r.appointment_time) {
      const d = new Date(s);
      if (Number.isFinite(d.getTime())) timeStr = d.toTimeString().slice(0, 5);
    }
  }
  return {
    appointmentId: String(r.appointmentId ?? r.appointment_id ?? r.id ?? "").trim(),
    date: dateStr,
    time: timeStr,
    patientName: String(r.patientName ?? r.patient_name ?? patient?.name ?? "").trim(),
    procedureSummary: String(
      r.procedureSummary ?? r.procedure_summary ?? r.notes ?? r.procedure ?? ""
    ).trim(),
    status: r.status != null ? String(r.status) : undefined,
    planId: (r.planId ?? r.plan_id ?? null) as string | null,
    chairNumber: String(r.chairNumber ?? r.chair_number ?? r.chair ?? "").trim(),
  };
}

function mapApptToPlan(a: DashboardAppt): PlanRow {
  const datePart = String(a?.date || "").trim();
  const timePart = String(a?.time || "09:00").trim();
  let sched: string | undefined;
  if (datePart) {
    if (datePart.includes("T")) {
      sched = datePart;
    } else {
      sched =
        timePart.length === 5
          ? `${datePart}T${timePart}:00`
          : timePart
            ? `${datePart}T${timePart}`
            : `${datePart}T09:00:00`;
    }
  }
  const encId = String(a?.planId || "").trim();
  const apptId = String(a?.appointmentId || "").trim();
  return {
    id: encId || apptId || `appt-${datePart}-${timePart}`,
    status: String(a?.status || "scheduled"),
    procedure_name: String(a?.procedureSummary || "Randevu"),
    scheduled_date: sched,
    date: sched,
    patient: { name: String(a?.patientName || "Hasta") },
  };
}

function normalizeLegacyPlan(raw: Record<string, unknown>): PlanRow {
  const patient = raw.patient as { name?: string } | undefined;
  return {
    id: String(raw.id ?? ""),
    status: String(raw.status ?? "planned"),
    procedure_name: String(raw.procedure_name ?? raw.procedure ?? "Plan"),
    scheduled_date: raw.scheduled_date != null ? String(raw.scheduled_date) : undefined,
    date: raw.date != null ? String(raw.date) : undefined,
    created_at: raw.created_at != null ? String(raw.created_at) : undefined,
    patient: { name: patient?.name ?? "Hasta" },
  };
}

export default function DoctorDashboardHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const token = user?.token ?? "";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState("");
  const [stats, setStats] = useState<Stats>({
    planned: 0,
    in_progress: 0,
    done: 0,
    today: 0,
    waiting: 0,
  });
  const [todayPlans, setTodayPlans] = useState<PlanRow[]>([]);
  const [tomorrowPlans, setTomorrowPlans] = useState<PlanRow[]>([]);
  const [upcomingPlans, setUpcomingPlans] = useState<PlanRow[]>([]);
  const [recentPatients, setRecentPatients] = useState<RecentPatient[]>([]);
  const [notifications, setNotifications] = useState<DashboardNotify[]>([]);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setAuthToken(token);
      const res = await fetch(`${API_BASE}/api/doctor/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!data?.ok) throw new Error(String(data?.error || data?.message || `HTTP ${res.status}`));

      const d = asObj(data.doctor) ?? {};
      setDoctorName(String(d.name ?? user?.name ?? "Doctor"));

      const st = asObj(data.stats) ?? {};
      setStats({
        planned: Number(st.planned) || 0,
        in_progress: Number(st.in_progress ?? st.inProgress) || 0,
        done: Number(st.done) || 0,
        today: Number(st.today) || 0,
        waiting: Number(st.waiting) || 0,
      });

      const { today: rawToday, tomorrow: rawTomorrow } = pickAppointmentArrays(data);
      let todayList = rawToday.map((row) => mapApptToPlan(normalizeApptRaw(row)));
      let tomorrowList = rawTomorrow.map((row) => mapApptToPlan(normalizeApptRaw(row)));

      if (__DEV__) {
        console.log(
          "[DoctorDashboard] stats.today:",
          st.today,
          "raw today:",
          rawToday.length,
          "tomorrow:",
          rawTomorrow.length,
          "keys:",
          Object.keys(data).slice(0, 20)
        );
      }
      const upcomingList: PlanRow[] = [];

      const legacyRaw = Array.isArray(data.recentTreatmentPlans)
        ? data.recentTreatmentPlans
        : Array.isArray(data.recent_treatment_plans)
          ? data.recent_treatment_plans
          : [];
      const legacy = legacyRaw.map((x: Record<string, unknown>) => normalizeLegacyPlan(x));

      const today0 = new Date();
      today0.setHours(0, 0, 0, 0);
      const tomorrow0 = new Date(today0);
      tomorrow0.setDate(today0.getDate() + 1);

      if (todayList.length === 0 && tomorrowList.length === 0 && legacy.length > 0) {
        legacy.forEach((plan) => {
          const dateStr = plan.scheduled_date || plan.date || plan.created_at;
          if (!dateStr) {
            upcomingList.push(plan);
            return;
          }
          const planDate = new Date(dateStr);
          if (isSameDay(planDate, today0)) todayList.push(plan);
          else if (isSameDay(planDate, tomorrow0)) tomorrowList.push(plan);
          else if (planDate > today0) upcomingList.push(plan);
        });
      } else {
        legacy.forEach((plan) => {
          const dateStr = plan.scheduled_date || plan.date || plan.created_at;
          if (!dateStr) {
            upcomingList.push(plan);
            return;
          }
          const planDate = new Date(dateStr);
          if (isSameDay(planDate, today0) || isSameDay(planDate, tomorrow0)) return;
          if (planDate > tomorrow0) upcomingList.push(plan);
        });
      }

      setTodayPlans(todayList);
      setTomorrowPlans(tomorrowList);
      setUpcomingPlans(upcomingList);

      const rp = Array.isArray(data.recentPatients)
        ? data.recentPatients
        : Array.isArray(data.recent_patients)
          ? data.recent_patients
          : [];
      setRecentPatients(
        rp.map((p: Record<string, unknown>) => ({
          id: String(p.id ?? ""),
          name: String(p.name ?? "Hasta"),
          hasRisk: Boolean(p.hasRisk),
          riskFlags: Array.isArray(p.riskFlags) ? (p.riskFlags as string[]) : [],
          lastVisit: p.lastVisit != null ? String(p.lastVisit) : null,
        }))
      );

      const n = Array.isArray(data.notifications) ? data.notifications : [];
      setNotifications(n.slice(0, 8));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Dashboard error");
      setTodayPlans([]);
      setTomorrowPlans([]);
      setUpcomingPlans([]);
      setRecentPatients([]);
      setNotifications([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, user?.name]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return t("doctor.greeting.morning");
    if (h < 18) return t("doctor.greeting.afternoon");
    return t("doctor.greeting.evening");
  };

  const handleLogout = () => {
    Alert.alert(t("doctor.logout"), t("doctor.logoutConfirm"), [
      { text: t("doctor.logoutCancel"), style: "cancel" },
      {
        text: t("doctor.logout"),
        style: "destructive",
        onPress: () => {
          void signOut();
        },
      },
    ]);
  };

  const showSoon = (title: string) => {
    Alert.alert(title, t("doctor.moduleWebHint") || "This section is available on the clinic web panel.");
  };

  const renderPlanCard = (plan: PlanRow, isToday: boolean, isTomorrow: boolean) => {
    const dateStr = plan.scheduled_date || plan.date || plan.created_at;
    let dateLabel = "—";
    let timeLabel = "";
    if (dateStr) {
      const date = new Date(dateStr);
      if (isToday) dateLabel = `📅 ${t("doctor.stats.today")}`;
      else if (isTomorrow) dateLabel = `📅 ${t("timeline.tomorrow")}`;
      else
        dateLabel = `📅 ${date.toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}`;
      if (!Number.isNaN(date.getTime())) {
        timeLabel = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      }
    }

    const isPlanned =
      plan.status === "planned" || plan.status === "scheduled" || plan.status === "SCHEDULED";

    return (
      <TouchableOpacity
        style={styles.planCard}
        activeOpacity={0.75}
        onPress={() =>
          Alert.alert(plan.patient.name, plan.procedure_name, [{ text: "OK" }], { cancelable: true })
        }
      >
        <View
          style={[
            styles.dateBadge,
            isToday && styles.dateBadgeToday,
            isTomorrow && styles.dateBadgeTomorrow,
          ]}
        >
          <Text
            style={[
              styles.dateBadgeText,
              (isToday || isTomorrow) && styles.dateBadgeTextHighlight,
            ]}
          >
            {dateLabel}
          </Text>
          {timeLabel ? <Text style={styles.timeText}>{timeLabel}</Text> : null}
        </View>
        <Text style={styles.planPatient}>{plan.patient.name}</Text>
        <Text style={styles.planProcedure}>{plan.procedure_name}</Text>
        <View style={styles.planFooter}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: isPlanned ? "#dbeafe" : "#dcfce7" },
            ]}
          >
            <Text
              style={[
                styles.statusBadgeText,
                { color: isPlanned ? "#1e40af" : "#166534" },
              ]}
            >
              {isPlanned ? t("doctor.status.scheduled") : plan.status}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const isDoctor = user?.type === "doctor" || user?.role === "DOCTOR";
  if (!user || !isDoctor) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.muted}>{t("common.unauthorized") || "Unauthorized"}</Text>
      </View>
    );
  }

  const hasUpcoming = upcomingPlans.length > 0;

  if (loading) {
    return (
      <View style={[styles.screen, styles.loadingWrap, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>{t("common.loading")}</Text>
      </View>
    );
  }

  const displayName = doctorName || user?.name || "Doctor";

  return (
    <View style={styles.rootWithTabs}>
      <ScrollView
        style={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 72 }}
      >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>{greeting()}</Text>
          <Text style={styles.doctorName}>
            Dr. {displayName}
          </Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>{t("doctor.logout")}</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errBanner}>
          <Text style={styles.errBannerTxt}>{error}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); void load(); }}>
            <Text style={styles.retry}>{t("requests.retry") || "Retry"}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.statsRow}>
        <View style={[styles.statCard, { borderLeftColor: "#2563eb" }]}>
          <Text style={styles.statValue}>{stats.planned}</Text>
          <Text style={styles.statTitle}>{t("doctor.stats.planned")}</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: "#f59e0b" }]}>
          <Text style={styles.statValue}>{stats.today}</Text>
          <Text style={styles.statTitle}>{t("doctor.stats.appointmentsToday")}</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: "#16a34a" }]}>
          <Text style={styles.statValue}>{stats.in_progress}</Text>
          <Text style={styles.statTitle}>{t("doctor.stats.inProgress")}</Text>
        </View>
        <View style={[styles.statCard, { borderLeftColor: "#9ca3af" }]}>
          <Text style={styles.statValue}>{stats.done}</Text>
          <Text style={styles.statTitle}>{t("doctor.stats.completed")}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("doctor.quickActions")}</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => router.push("/doctor/requests")}>
            <Text style={styles.actionIcon}>📨</Text>
            <Text style={styles.actionLabel}>{t("doctor.quickActions.requests")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push("/doctor/patients")}
          >
            <Text style={styles.actionIcon}>👥</Text>
            <Text style={styles.actionLabel}>{t("doctor.quickActions.patients")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => showSoon(t("doctor.quickActions.xray"))}
          >
            <Text style={styles.actionIcon}>🩻</Text>
            <Text style={styles.actionLabel}>{t("doctor.quickActions.xray")}</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.actionsRow, { marginTop: 10 }]}>
          <TouchableOpacity
            style={[styles.actionBtn, { flex: 1 }]}
            onPress={() => showSoon(t("doctor.quickActions.tasks"))}
          >
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={styles.actionLabel}>{t("doctor.quickActions.tasks")}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {notifications.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t("doctor.notifications") || "Notifications"}
          </Text>
          <View style={styles.card}>
            {notifications.map((n, i) => (
              <View
                key={String(n.id || i)}
                style={[styles.notifyRow, i < notifications.length - 1 && styles.rowBorder]}
              >
                <Text style={styles.notifyTitle}>{n.title || "—"}</Text>
                {n.message ? <Text style={styles.notifyMsg}>{n.message}</Text> : null}
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t("doctor.todayAppointments")} ({todayPlans.length})
          {stats.today > 0 && todayPlans.length === 0 ? (
            <Text style={styles.syncHint}> · API {stats.today}</Text>
          ) : null}
        </Text>
        <View style={styles.card}>
          {todayPlans.length === 0 ? (
            <Text style={styles.emptyText}>{t("doctor.noAppointments.today")}</Text>
          ) : (
            todayPlans.map((p, i) => (
              <View key={`td-${p.id}-${i}`}>{renderPlanCard(p, true, false)}</View>
            ))
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {t("doctor.tomorrowAppointments")} ({tomorrowPlans.length})
        </Text>
        <View style={styles.card}>
          {tomorrowPlans.length === 0 ? (
            <Text style={styles.emptyText}>{t("doctor.noAppointments.tomorrow")}</Text>
          ) : (
            tomorrowPlans.map((p, i) => (
              <View key={`tm-${p.id}-${i}`}>{renderPlanCard(p, false, true)}</View>
            ))
          )}
        </View>
      </View>

      {hasUpcoming ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {t("doctor.upcomingPlans") || "Upcoming"} ({upcomingPlans.length})
          </Text>
          <View style={styles.card}>{upcomingPlans.map((p) => renderPlanCard(p, false, false))}</View>
        </View>
      ) : null}

      {recentPatients.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("doctor.recentPatients")}</Text>
          <View style={styles.card}>
            {recentPatients.map((p, idx) => (
              <View
                key={p.id || idx}
                style={[styles.patientRow, idx < recentPatients.length - 1 && styles.rowBorder]}
              >
                <View style={styles.patientAvatar}>
                  <Text style={styles.patientAvatarText}>
                    {(p.name || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <Text style={styles.patientName}>{p.name}</Text>
                    {p.hasRisk && p.riskFlags && p.riskFlags.length > 0 ? (
                      <View style={styles.riskBadge}>
                        <Text style={styles.riskBadgeText}>
                          ⚠ {p.riskFlags.slice(0, 2).join(", ")}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  {p.lastVisit ? <Text style={styles.patientMeta}>{p.lastVisit}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ height: 16 }} />
    </ScrollView>

      <View style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <TouchableOpacity style={[styles.navItem, styles.navItemActive]} activeOpacity={0.7}>
          <Text style={styles.navIcon}>🏠</Text>
          <Text style={[styles.navLabel, styles.navLabelActive]}>
            {t("nav.dashboard") || "Dashboard"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => router.push("/doctor/patients")}
        >
          <Text style={styles.navIcon}>👥</Text>
          <Text style={styles.navLabel}>{t("nav.patients") || "Patients"}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.navItem}
          activeOpacity={0.7}
          onPress={() => router.push("/doctor/profile")}
        >
          <Text style={styles.navIcon}>👤</Text>
          <Text style={styles.navLabel}>{t("nav.profile") || "Profile"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#f3f4f6" },
  rootWithTabs: { flex: 1, backgroundColor: "#f3f4f6" },
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
    paddingTop: 6,
  },
  navItem: { flex: 1, alignItems: "center", paddingVertical: 4 },
  navItemActive: {},
  navIcon: { fontSize: 22, marginBottom: 2 },
  navLabel: { fontSize: 11, color: "#6b7280", fontWeight: "500" },
  navLabelActive: { color: "#2563eb", fontWeight: "700" },
  loadingWrap: { justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 10, color: "#6b7280", fontSize: 14 },
  muted: { padding: 24, color: "#64748b" },
  errBanner: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    backgroundColor: "#fee2e2",
    borderRadius: 10,
  },
  errBannerTxt: { color: "#991b1b", fontSize: 13 },
  retry: { color: "#2563eb", fontWeight: "700", marginTop: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  greeting: { fontSize: 13, color: "#6b7280" },
  doctorName: { fontSize: 20, fontWeight: "700", color: "#111827", marginTop: 2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 12,
  },
  avatarText: { fontSize: 16, fontWeight: "700", color: "#ffffff" },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  logoutText: { color: "#dc2626", fontWeight: "600", fontSize: 13 },
  statsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 16 },
  statCard: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statValue: { fontSize: 20, fontWeight: "700", color: "#111827" },
  statTitle: { fontSize: 10, color: "#6b7280", marginTop: 2 },
  section: { paddingHorizontal: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#374151", marginBottom: 10 },
  syncHint: { fontSize: 13, fontWeight: "500", color: "#d97706" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    padding: 12,
  },
  actionsRow: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionIcon: { fontSize: 22, marginBottom: 4 },
  actionLabel: { fontSize: 11, fontWeight: "600", color: "#374151", textAlign: "center" },
  emptyText: { padding: 16, fontSize: 14, color: "#6b7280", textAlign: "center" },
  planCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  dateBadge: {
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  dateBadgeToday: { backgroundColor: "#dcfce7" },
  dateBadgeTomorrow: { backgroundColor: "#dbeafe" },
  dateBadgeText: { fontSize: 11, color: "#6b7280", fontWeight: "600" },
  dateBadgeTextHighlight: { color: "#111827", fontWeight: "700" },
  timeText: { fontSize: 10, color: "#9ca3af", marginTop: 2 },
  planPatient: { fontSize: 15, fontWeight: "700", color: "#111827" },
  planProcedure: { fontSize: 13, color: "#6b7280", marginTop: 2 },
  planFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  statusBadgeText: { fontSize: 10, fontWeight: "600" },
  patientRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  patientAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
  },
  patientAvatarText: { fontSize: 14, fontWeight: "700", color: "#2563eb" },
  patientName: { fontSize: 14, fontWeight: "600", color: "#111827" },
  patientMeta: { fontSize: 12, color: "#9ca3af", marginTop: 1 },
  riskBadge: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  riskBadgeText: { color: "#b91c1c", fontSize: 10, fontWeight: "700" },
  notifyRow: { paddingVertical: 10 },
  notifyTitle: { fontSize: 14, fontWeight: "600", color: "#111827" },
  notifyMsg: { fontSize: 13, color: "#6b7280", marginTop: 4 },
});
