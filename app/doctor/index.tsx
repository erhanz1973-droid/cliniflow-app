/**
 * Doctor dashboard home — tek kaynak: GET /api/doctor/dashboard (timeline: todayAppointments / tomorrowAppointments).
 * Route: /doctor
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
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
  /** Set only for merge/dedup (stripped before state) */
  _sourceBucket?: "today" | "tomorrow" | "legacy";
};

type RecentRiskFlag = { type?: string; code: string; label?: string };

type RecentPatient = {
  id: string;
  name: string;
  hasRisk?: boolean;
  riskFlags?: RecentRiskFlag[];
  lastVisit?: string | null;
};

/** API: { code } (preferred) or legacy Turkish string — always show via i18n risk.* */
function normalizeRecentRiskFlags(raw: unknown): RecentRiskFlag[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentRiskFlag[] = [];
  for (const x of raw) {
    if (x && typeof x === "object" && "code" in x) {
      const code = String((x as RecentRiskFlag).code || "").trim();
      if (code) out.push({ ...(x as RecentRiskFlag), code });
      continue;
    }
    const s = String(x || "").trim();
    if (!s) continue;
    if (/İlaç|ilac/i.test(s)) out.push({ code: "MEDICATION", type: "relevant" });
    else if (/Allerji|Alerji|alerji/i.test(s)) out.push({ code: "DRUG_ALLERGY", type: "critical" });
    else if (/Kanama|bleeding/i.test(s)) out.push({ code: "BLEEDING_RISK", type: "critical" });
    else if (/Kalp|heart/i.test(s)) out.push({ code: "HEART_DISEASE", type: "relevant" });
    else if (/Diyabet|diabetes/i.test(s)) out.push({ code: "DIABETES", type: "relevant" });
    else out.push({ code: s });
  }
  const seen = new Set<string>();
  return out.filter((f) => {
    if (seen.has(f.code)) return false;
    seen.add(f.code);
    return true;
  });
}

function labelForRecentRiskFlag(flag: RecentRiskFlag, t: (key: string) => string): string {
  const k = `risk.${flag.code}`;
  const tr = t(k);
  if (tr !== k) return tr;
  return flag.label || flag.code;
}

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

/** `YYYY-MM-DD` only — local calendar, no UTC-midnight shift */
function parseYmdLocal(ymd: string): Date | null {
  const t = ymd.trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const out = new Date(y, mo, d);
  if (out.getFullYear() !== y || out.getMonth() !== mo || out.getDate() !== d) return null;
  return out;
}

/**
 * Unambiguous only: YYYY-MM-DD, ISO-8601 (…T…), or explicit Z/offset; YYYY-MM-DD HH:mm in local;
 * Rejects e.g. DD/MM/YYYY.
 */
function parseIsoOrLocalDateTime(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return parseYmdLocal(t);
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t)) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {
    const inst = new Date(t);
    return Number.isFinite(inst.getTime()) ? inst : null;
  }
  const m2 = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(t);
  if (m2) {
    const y = Number(m2[1]);
    const mo = Number(m2[2]) - 1;
    const d = Number(m2[3]);
    const h = Number(m2[4]);
    const min = Number(m2[5]);
    const sec = m2[6] != null ? Number(m2[6]) : 0;
    const out = new Date(y, mo, d, h, min, sec);
    if (out.getFullYear() !== y || out.getMonth() !== mo || out.getDate() !== d) return null;
    return out;
  }
  if (/\bGMT\b|Z$|[+-]\d{2}:?\d{2}\s*$/.test(t)) {
    const inst = new Date(t);
    return Number.isFinite(inst.getTime()) ? inst : null;
  }
  return null;
}

function parseScheduleLocal(sched: string | undefined | null): Date | null {
  if (sched == null) return null;
  return parseIsoOrLocalDateTime(String(sched).trim());
}

function warnUnparseableSchedule(context: string, raw: string | undefined, planId: string, extra?: Record<string, unknown>) {
  if (!__DEV__) return;
  const s = (raw ?? "").trim();
  if (!s) return;
  if (parseScheduleLocal(s)) return;
  console.warn("[DoctorDashboard] unparseable schedule — using raw in UI", context, {
    planId,
    raw: s,
    ...extra,
  });
}

/** Unparseable / fallback schedule text in the card — cap length to avoid layout overflow */
function truncateForUi(s: string, max = 40): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function applyI18nVars(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  let out = s;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(String(v));
  }
  return out;
}

function isMissingTranslation(resolved: unknown, key: string): boolean {
  if (resolved == null) return true;
  if (typeof resolved !== "string") return true;
  const s = resolved.trim();
  if (s === "") return true;
  if (s === key) return true;
  if (s === `[${key}]`) return true;
  return false;
}

/** If `t` fails or returns a missing string, use fallback; supports `{{name}}` placeholders. */
function translateOrFallback(
  t: (key: string) => string,
  key: string,
  fallback: string,
  vars?: Record<string, string | number>
): string {
  let resolved: unknown;
  try {
    resolved = t(key);
  } catch {
    resolved = null;
  }
  const base = isMissingTranslation(resolved, key) ? fallback : String(resolved);
  return applyI18nVars(base, vars);
}

function normalizeApptRaw(raw: unknown): DashboardAppt {
  const r = asObj(raw) ?? {};
  const patient = asObj(r.patient);
  /** Öncelik: API start_at; yoksa encounter / visit zamanı (treatment_plans + patient_encounters kaynağı) */
  const startInst =
    r.start_at ??
    r.startAt ??
    r.encounter_scheduled_at ??
    r.encounterScheduledAt ??
    r.encounter_date ??
    r.encounterDate ??
    r.visit_date ??
    r.visitDate ??
    r.scheduled_at ??
    r.scheduledAt ??
    r.start_time ??
    r.startTime;
  let dateStr = String(r.date ?? r.appointment_date ?? "").trim();
  let timeStr = String(r.time ?? r.appointment_time ?? "09:00").trim();
  if (!dateStr && startInst != null && String(startInst).length >= 10) {
    const s = String(startInst);
    dateStr = s.slice(0, 10);
    if (!r.time && !r.appointment_time) {
      const inst = parseIsoOrLocalDateTime(s);
      if (inst) timeStr = inst.toTimeString().slice(0, 5);
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

function mapApptToPlanWithSource(
  a: DashboardAppt,
  source: "today" | "tomorrow"
): PlanRow {
  return { ...mapApptToPlan(a), _sourceBucket: source };
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
    _sourceBucket: "legacy",
  };
}

function stripInternalPlanFields(p: PlanRow): PlanRow {
  const { _sourceBucket, ...rest } = p;
  return rest;
}

/**
 * Stable ids from the API: collapse true duplicates (e.g. same row in both arrays).
 * Synthetic `appt-…` ids also include patient, schedule, procedure so distinct rows are never merged.
 */
function planDedupeKey(p: PlanRow): string {
  const id = (p.id || "").trim();
  const t = (p.scheduled_date || p.date || p.created_at || "")
    .replace(/\s+/g, " ")
    .trim();
  const name = p.patient.name.trim().toLowerCase();
  const proc = p.procedure_name.trim().toLowerCase().slice(0, 120);
  const src = p._sourceBucket ?? "u";
  if (id && !id.toLowerCase().startsWith("appt-")) {
    return `id:${id.toLowerCase()}`;
  }
  return `row|${src}|${id.toLowerCase() || "noid"}|${name}|${t}|${proc}`;
}

function dedupePlanRows(plans: PlanRow[], label: string): PlanRow[] {
  const seen = new Set<string>();
  const out: PlanRow[] = [];
  for (const p of plans) {
    const k = planDedupeKey(p);
    if (seen.has(k)) {
      if (__DEV__) {
        console.log(`[DoctorDashboard] dedupe skipped duplicate (${label})`, k, p.id, p.patient.name);
      }
      continue;
    }
    seen.add(k);
    out.push(p);
  }
  return out;
}

function getPlanSortKeyMs(p: PlanRow): number {
  const t = parseScheduleLocal(p.scheduled_date || p.date || p.created_at);
  return t && Number.isFinite(t.getTime()) ? t.getTime() : Number.MAX_SAFE_INTEGER;
}

function sortPlansByStart(plans: PlanRow[]): PlanRow[] {
  return [...plans].sort((a, b) => getPlanSortKeyMs(a) - getPlanSortKeyMs(b));
}

/**
 * Re-split merged API rows by device-local calendar (display only; backend is source of truth for membership).
 * Does not place overdue (non–calendar-today) items into the today list.
 */
function rebucketByLocalZone(
  plans: PlanRow[],
  localToday: Date,
  localTomorrow: Date
): {
  today: PlanRow[];
  tomorrow: PlanRow[];
  other: PlanRow[];
  unparseableCount: number;
  otherDayCount: number;
} {
  const today: PlanRow[] = [];
  const tomorrow: PlanRow[] = [];
  const other: PlanRow[] = [];
  let unparseableCount = 0;
  let otherDayCount = 0;

  for (const p of plans) {
    const rawS = p.scheduled_date || p.date;
    const d = parseScheduleLocal(rawS);
    if (!d) {
      unparseableCount += 1;
      warnUnparseableSchedule("rebucket", rawS, p.id, { sourceBucket: p._sourceBucket });
      other.push(p);
      continue;
    }
    if (isSameDay(d, localToday)) {
      today.push(p);
    } else if (isSameDay(d, localTomorrow)) {
      tomorrow.push(p);
    } else {
      otherDayCount += 1;
      other.push(p);
    }
  }
  const otherSorted = sortPlansByStart(other);
  return {
    today,
    tomorrow,
    other: otherSorted,
    unparseableCount,
    otherDayCount,
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
  /** Internal: count of rows from API rebucket "other" (hint only; not on PlanRow) */
  const [rebucketFromApiOtherCount, setRebucketFromApiOtherCount] = useState(0);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [scheduleTextModal, setScheduleTextModal] = useState<{ open: boolean; text: string }>({
    open: false,
    text: "",
  });
  const openScheduleTextModal = useCallback((text: string) => {
    setScheduleTextModal({ open: true, text });
  }, []);
  const closeScheduleTextModal = useCallback(() => {
    setScheduleTextModal((prev) => ({ ...prev, open: false }));
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setAuthToken(token);
      const _ld = new Date();
      const pad2 = (n: number) => String(n).padStart(2, '0');
      const localToday = `${_ld.getFullYear()}-${pad2(_ld.getMonth() + 1)}-${pad2(_ld.getDate())}`;
      const _lt = new Date(_ld.getFullYear(), _ld.getMonth(), _ld.getDate() + 1);
      const localTomorrow = `${_lt.getFullYear()}-${pad2(_lt.getMonth() + 1)}-${pad2(_lt.getDate())}`;
      const res = await fetch(
        `${API_BASE}/api/doctor/dashboard?localToday=${localToday}&localTomorrow=${localTomorrow}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = (await res.json()) as Record<string, unknown>;
      if (!data?.ok) throw new Error(String(data?.error || data?.message || `HTTP ${res.status}`));

      const apiPayload = data as {
        todayAppointments?: unknown[] | null;
        tomorrowAppointments?: unknown[] | null;
      };
      if (__DEV__) {
        console.log("🧪 API todayAppointments:", apiPayload.todayAppointments?.length);
        console.log("🧪 API tomorrowAppointments:", apiPayload.tomorrowAppointments?.length);
        console.log("🧪 API sample:", apiPayload.todayAppointments?.[0]);
      }

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
      const mergedMapped = [
        ...rawToday.map((row) => mapApptToPlanWithSource(normalizeApptRaw(row), "today")),
        ...rawTomorrow.map((row) => mapApptToPlanWithSource(normalizeApptRaw(row), "tomorrow")),
      ];
      const afterDedup = dedupePlanRows(mergedMapped, "api merge");

      if (__DEV__) {
        console.log(
          "[DoctorDashboard] stats.today:",
          st.today,
          "raw today:",
          rawToday.length,
          "tomorrow:",
          rawTomorrow.length,
          "after dedup:",
          afterDedup.length,
          "keys:",
          Object.keys(data).slice(0, 20)
        );
      }
      const upcomingList: PlanRow[] = [];

      const _now = new Date();
      const today0 = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());
      const tomorrow0 = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() + 1);

      const {
        today: todayLocal,
        tomorrow: tomorrowLocal,
        other: apiOther,
        unparseableCount: otherUnparseable,
        otherDayCount: otherCalendarDay,
      } = rebucketByLocalZone(afterDedup, today0, tomorrow0);
      if (__DEV__) {
        console.log("🧪 [DoctorDashboard] other bucket (rebucket)", {
          total: apiOther.length,
          unparseable: otherUnparseable,
          otherCalendarDay: otherCalendarDay,
        });
      }
      setRebucketFromApiOtherCount(apiOther.length);
      for (const p of apiOther) {
        upcomingList.push(p);
      }
      let todayList = sortPlansByStart(todayLocal);
      let tomorrowList = sortPlansByStart(tomorrowLocal);

      const legacyRaw = Array.isArray(data.recentTreatmentPlans)
        ? data.recentTreatmentPlans
        : Array.isArray(data.recent_treatment_plans)
          ? data.recent_treatment_plans
          : [];
      const legacy = legacyRaw.map((x: Record<string, unknown>) => normalizeLegacyPlan(x));

      if (todayList.length === 0 && tomorrowList.length === 0 && legacy.length > 0) {
        legacy.forEach((plan) => {
          const dateStr = plan.scheduled_date || plan.date || plan.created_at;
          if (!dateStr) {
            upcomingList.push(plan);
            return;
          }
          const planDate = parseScheduleLocal(dateStr);
          if (!planDate) {
            warnUnparseableSchedule("legacy (fill today/tomorrow)", dateStr, plan.id, { procedure: plan.procedure_name });
            upcomingList.push(plan);
            return;
          }
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
          const planDate = parseScheduleLocal(dateStr);
          if (!planDate) {
            warnUnparseableSchedule("legacy (upcoming path)", dateStr, plan.id, { procedure: plan.procedure_name });
            upcomingList.push(plan);
            return;
          }
          if (isSameDay(planDate, today0) || isSameDay(planDate, tomorrow0)) return;
          if (planDate > tomorrow0) upcomingList.push(plan);
        });
      }

      todayList = sortPlansByStart(dedupePlanRows(todayList, "today list")).map(stripInternalPlanFields);
      tomorrowList = sortPlansByStart(dedupePlanRows(tomorrowList, "tomorrow list")).map(
        stripInternalPlanFields
      );

      const topTodayLen = apiPayload.todayAppointments?.length ?? 0;
      const topTomorrowLen = apiPayload.tomorrowAppointments?.length ?? 0;
      if (__DEV__) {
        if (topTodayLen > 0 && todayList.length === 0) {
          console.log("⚠️ UI EMPTY BUT DATA EXISTS (todayAppointments from API, mapped today list empty)");
        }
        if (topTomorrowLen > 0 && tomorrowList.length === 0) {
          console.log("⚠️ UI EMPTY BUT DATA EXISTS (tomorrowAppointments from API, mapped tomorrow list empty)");
        }
        if (todayList.length === 0 && Number(st.today) > 0) {
          console.log("⚠️ UI EMPTY BUT DATA EXISTS (stats.today > 0 but today list is empty)");
        }
      }

      setTodayPlans(todayList);
      setTomorrowPlans(tomorrowList);
      setUpcomingPlans(upcomingList.map(stripInternalPlanFields));

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
          riskFlags: normalizeRecentRiskFlags(p.riskFlags),
          lastVisit: p.lastVisit != null ? String(p.lastVisit) : null,
        }))
      );

      // Pending (unanswered) treatment request count for dashboard badge
      try {
        const reqRes = await fetch(`${API_BASE}/api/doctor/treatment-requests`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const reqData = await reqRes.json();
        const pending = (reqData?.requests ?? []).filter(
          (r: { status?: string }) => r.status === "pending"
        ).length;
        setPendingRequestCount(pending);
      } catch {
        // non-critical — badge stays at 0
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Dashboard error");
      setTodayPlans([]);
      setTomorrowPlans([]);
      setUpcomingPlans([]);
      setRebucketFromApiOtherCount(0);
      setRecentPatients([]);
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

  useEffect(() => {
    if (__DEV__) {
      console.log("🧪 UI todayAppointments (mapped → todayPlans):", todayPlans);
    }
  }, [todayPlans]);

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
    const fullScheduleRaw = dateStr ? String(dateStr).replace(/\s+/g, " ").trim() : "";
    const parsed = dateStr ? parseScheduleLocal(dateStr) : null;
    const isScheduleTruncated = Boolean(dateStr && !parsed && fullScheduleRaw.length > 40);

    if (dateStr) {
      const date = parsed;
      if (date) {
        if (isToday) dateLabel = `📅 ${translateOrFallback(t, "doctor.stats.today", "Today")}`;
        else if (isTomorrow) dateLabel = `📅 ${translateOrFallback(t, "timeline.tomorrow", "Tomorrow")}`;
        else
          dateLabel = `📅 ${date.toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}`;
        if (!Number.isNaN(date.getTime())) {
          timeLabel = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        }
      } else {
        const raw = truncateForUi(fullScheduleRaw);
        dateLabel = `📅 ${raw}`;
        timeLabel = raw;
      }
    }

    const isPlanned =
      plan.status === "planned" || plan.status === "scheduled" || plan.status === "SCHEDULED";

    const showPatientAlert = () =>
      Alert.alert(plan.patient.name, plan.procedure_name, [
        { text: translateOrFallback(t, "common.ok", "OK") },
      ], { cancelable: true });

    const dateBadgeEl = (
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
    );

    const bodyEl = (
      <>
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
              {isPlanned ? translateOrFallback(t, "doctor.status.scheduled", "Scheduled") : plan.status}
            </Text>
          </View>
        </View>
      </>
    );

    if (isScheduleTruncated) {
      return (
        <View style={styles.planCard}>
          <Pressable
            onPress={() => openScheduleTextModal(fullScheduleRaw)}
            style={({ pressed }) => [styles.scheduleBadgePress, pressed && styles.planPressablePressed]}
            accessibilityRole="button"
            accessibilityLabel={translateOrFallback(
              t,
              "doctor.scheduleExpandA11y",
              "View full schedule text"
            )}
          >
            {dateBadgeEl}
          </Pressable>
          <Pressable
            onPress={showPatientAlert}
            style={({ pressed }) => [styles.planCardBodyTap, pressed && styles.planPressablePressed]}
            accessibilityLabel={plan.patient.name}
            accessibilityRole="button"
          >
            {bodyEl}
          </Pressable>
        </View>
      );
    }

    return (
      <Pressable
        onPress={showPatientAlert}
        style={({ pressed }) => [styles.planCard, pressed && styles.planPressablePressed]}
        accessibilityLabel={`${plan.patient.name}, ${plan.procedure_name}`}
        accessibilityRole="button"
      >
        {dateBadgeEl}
        {bodyEl}
      </Pressable>
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
            <View style={styles.actionIconWrap}>
              <Text style={styles.actionIcon}>📨</Text>
              {pendingRequestCount > 0 && (
                <View style={styles.requestsBadge}>
                  <Text style={styles.requestsBadgeTxt}>
                    {pendingRequestCount > 99 ? "99+" : pendingRequestCount}
                  </Text>
                </View>
              )}
            </View>
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
            onPress={() => router.push("/doctor/tasks")}
          >
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={styles.actionLabel}>{t("doctor.quickActions.tasks")}</Text>
          </TouchableOpacity>
        </View>
      </View>

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
            {translateOrFallback(t, "doctor.upcomingPlans", "Upcoming")} ({upcomingPlans.length})
          </Text>
          {rebucketFromApiOtherCount > 0 ? (
            <Text style={styles.otherBucketHint} numberOfLines={4}>
              {translateOrFallback(
                t,
                "doctor.upcomingRebucketOtherHint",
                "{{count}} visit(s) below are outside the Today/Tomorrow window (or the time could not be parsed on this device).",
                { count: rebucketFromApiOtherCount }
              )}
            </Text>
          ) : null}
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
                          ⚠{" "}
                          {p.riskFlags
                            .slice(0, 2)
                            .map((f) => labelForRecentRiskFlag(f, t))
                            .join(", ")}
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

      <Modal
        visible={scheduleTextModal.open}
        transparent
        animationType="fade"
        onRequestClose={closeScheduleTextModal}
      >
        <View style={styles.scheduleModalRoot}>
          <Pressable
            style={styles.scheduleModalBackdrop}
            onPress={closeScheduleTextModal}
            accessibilityLabel={translateOrFallback(t, "doctor.scheduleModalDismissA11y", "Dismiss")}
            accessibilityRole="button"
          />
          <View
            style={[styles.scheduleModalCard, { marginBottom: Math.max(insets.bottom, 12), maxHeight: "85%" }]}
          >
            <Text style={styles.scheduleModalTitle}>
              {translateOrFallback(t, "doctor.scheduleFullTitle", "Schedule")}
            </Text>
            <ScrollView
              style={styles.scheduleModalScroll}
              contentContainerStyle={styles.scheduleModalScrollContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.scheduleModalBody} selectable>
                {scheduleTextModal.text}
              </Text>
            </ScrollView>
            <Pressable
              onPress={closeScheduleTextModal}
              style={({ pressed }) => [styles.scheduleModalButton, pressed && styles.planPressablePressed]}
              accessibilityRole="button"
            >
              <Text style={styles.scheduleModalButtonText}>
                {translateOrFallback(t, "common.ok", "OK")}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  otherBucketHint: {
    fontSize: 12,
    lineHeight: 16,
    color: "#64748b",
    marginBottom: 8,
    marginTop: 2,
    paddingHorizontal: 2,
  },
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
  actionIconWrap: { position: "relative", alignItems: "center", marginBottom: 4 },
  actionIcon: { fontSize: 22 },
  requestsBadge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  requestsBadgeTxt: { color: "#fff", fontSize: 10, fontWeight: "800" },
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
  planPressablePressed: {
    opacity: 0.88,
  },
  scheduleBadgePress: {
    alignSelf: "flex-start",
  },
  planCardBodyTap: {
    alignSelf: "stretch",
    marginTop: 0,
  },
  scheduleModalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  scheduleModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  scheduleModalCard: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 16,
    width: "100%",
    maxWidth: 420,
    alignSelf: "center",
    zIndex: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  scheduleModalTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 10,
  },
  scheduleModalScroll: {
    flexGrow: 0,
    maxHeight: 420,
  },
  scheduleModalScrollContent: {
    paddingBottom: 8,
  },
  scheduleModalBody: {
    fontSize: 14,
    lineHeight: 20,
    color: "#374151",
  },
  scheduleModalButton: {
    marginTop: 14,
    alignSelf: "flex-end",
    paddingVertical: 10,
    paddingHorizontal: 18,
    backgroundColor: "#2563eb",
    borderRadius: 8,
  },
  scheduleModalButtonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 15,
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
  rowBorder: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  patientRow: { flexDirection: "row", alignItems: "center", padding: 14, gap: 12 },
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
});
