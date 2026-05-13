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
import { useAuth } from "../../../lib/auth";
import { useLanguage } from "../../../lib/language-context";
import { API_BASE, setAuthToken } from "../../../lib/api";
import { fetchDoctorUnreadTotalOnly } from "../../../lib/doctorMessaging";

type DashboardAppt = {
  appointmentId?: string;
  /** Canonical instant from API (ISO 8601 Z) */
  scheduledAt?: string;
  /** Pre-formatted in clinic TZ (yyyy-MM-dd HH:mm) */
  displayTime?: string;
  /** IANA — clinic canonical */
  timezone?: string;
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
  scheduledAtUtc?: string;
  displayTimeClinic?: string;
  clinicTimezone?: string;
  patient: { name: string };
  /** Set only for dedup merge (stripped before state) */
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
 * Unambiguous only: legacy strings (YYYY-MM-DD, ISO offset, HH:mm space). Prefer API `scheduledAt` for new payloads.
 */
function parseIsoOrLocalDateTime(s: string): Date | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return parseYmdLocal(t);
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(t)) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {
    // With Z / offset: real instant. Without: treat as local wall clock (avoid Date("…T…") UTC quirks).
    const hasExplicitZone = /\bGMT\b|Z$|[+-]\d{2}:?\d{2}\s*$/.test(t);
    if (hasExplicitZone) {
      const inst = new Date(t);
      return Number.isFinite(inst.getTime()) ? inst : null;
    }
    const mT = /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?/.exec(t);
    if (mT) {
      const y = Number(mT[1]);
      const mo = Number(mT[2]) - 1;
      const d = Number(mT[3]);
      const h = Number(mT[4]);
      const min = Number(mT[5]);
      const sec = mT[6] != null ? Number(mT[6]) : 0;
      const out = new Date(y, mo, d, h, min, sec);
      if (out.getFullYear() !== y || out.getMonth() !== mo || out.getDate() !== d) return null;
      return out;
    }
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

/** Optional FDI / simple tooth id at end of procedure line for compact count column */
function extractTrailingToothToken(proc: string): string {
  const t = String(proc || "").trim();
  const m = /\b([1-4][0-8]|[1-9])\s*$/.exec(t);
  return m ? m[1] : "";
}

function getPlanStatusPresentation(
  plan: PlanRow,
  t: (key: string) => string
): { label: string; bg: string; fg: string } {
  const s = String(plan.status || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (s === "completed" || s === "done") {
    return {
      label: translateOrFallback(t, "doctor.status.completed", "Completed"),
      bg: "#d1fae5",
      fg: "#065f46",
    };
  }
  if (s === "in_progress" || s === "inprogress") {
    return {
      label: translateOrFallback(t, "doctor.status.inProgress", "In Progress"),
      bg: "#fef3c7",
      fg: "#92400e",
    };
  }
  if (s === "planned" || s === "scheduled") {
    return {
      label: translateOrFallback(t, "doctor.status.scheduled", "Scheduled"),
      bg: "#dbeafe",
      fg: "#1e40af",
    };
  }
  return {
    label: plan.status || "—",
    bg: "#f3f4f6",
    fg: "#374151",
  };
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
  const scheduledAt =
    r.scheduledAt != null
      ? String(r.scheduledAt).trim()
      : r.scheduled_at != null
        ? String(r.scheduled_at).trim()
        : "";
  const displayTime =
    r.displayTime != null
      ? String(r.displayTime).trim()
      : r.display_time != null
        ? String(r.display_time).trim()
        : "";
  const timezone =
    r.timezone != null
      ? String(r.timezone).trim()
      : r.time_zone != null
        ? String(r.time_zone).trim()
        : "";
  /** Legacy / fallback when canonical scheduledAt missing */
  const startInst =
    scheduledAt ||
    (r.start_at ??
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
      r.startTime);
  let dateStr = String(r.date ?? r.appointment_date ?? "").trim();
  let timeStr = String(r.time ?? r.appointment_time ?? "09:00").trim();
  if (scheduledAt && Number.isFinite(Date.parse(scheduledAt))) {
    dateStr = scheduledAt.slice(0, 10);
    timeStr = scheduledAt.slice(11, 16);
  } else if (!dateStr && startInst != null && String(startInst).length >= 10) {
    const s = String(startInst);
    dateStr = s.slice(0, 10);
    if (!r.time && !r.appointment_time) {
      const inst = parseIsoOrLocalDateTime(s);
      if (inst) timeStr = inst.toTimeString().slice(0, 5);
    }
  }
  return {
    appointmentId: String(r.appointmentId ?? r.appointment_id ?? r.id ?? "").trim(),
    scheduledAt,
    displayTime,
    timezone,
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
  const encOrPlanId = String(a?.planId || "").trim();
  const apptId = String(a?.appointmentId || "").trim();
  const canonical = String(a.scheduledAt || "").trim();
  const disp = String(a.displayTime || "").trim();
  const tz = String(a.timezone || "").trim();

  let scheduled_date: string | undefined;
  let date: string | undefined;
  if (canonical && Number.isFinite(Date.parse(canonical))) {
    scheduled_date = canonical;
    date = canonical;
  } else if (disp) {
    scheduled_date = disp.replace(" ", "T");
    date = disp;
  } else {
    const datePart = String(a?.date || "").trim();
    const timePart = String(a?.time || "09:00").trim();
    if (datePart) {
      scheduled_date =
        timePart.length === 5
          ? `${datePart}T${timePart}:00`
          : timePart
            ? `${datePart}T${timePart}`
            : `${datePart}T09:00:00`;
      date = scheduled_date;
    }
  }

  return {
    id: apptId || encOrPlanId || `appt-${a.date || ""}-${a.time || ""}`,
    status: String(a?.status || "scheduled"),
    procedure_name: String(a?.procedureSummary || "Randevu"),
    scheduled_date,
    date,
    scheduledAtUtc: canonical || undefined,
    displayTimeClinic: disp || undefined,
    clinicTimezone: tz || undefined,
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
 * Stable ids: prefer appointment/clinic row id; planId alone is often encounter_id (many treatments per encounter).
 */
function planDedupeKey(p: PlanRow): string {
  const id = (p.id || "").trim();
  const t = (p.scheduledAtUtc || p.scheduled_date || p.date || p.created_at || "")
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
  if (p.scheduledAtUtc) {
    const u = Date.parse(p.scheduledAtUtc);
    if (Number.isFinite(u)) return u;
  }
  const t = parseScheduleLocal(p.scheduled_date || p.date || p.created_at);
  return t && Number.isFinite(t.getTime()) ? t.getTime() : Number.MAX_SAFE_INTEGER;
}

function sortPlansByStart(plans: PlanRow[]): PlanRow[] {
  return [...plans].sort((a, b) => getPlanSortKeyMs(a) - getPlanSortKeyMs(b));
}

/** Calendar YYYY-MM-DD for instant in IANA zone (clinic); device-local if tz empty. */
function formatYmdInTimeZone(d: Date, ianaTz: string): string {
  const tz = String(ianaTz || "").trim();
  if (!tz) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((x) => x.type === "year")?.value;
  const m = parts.find((x) => x.type === "month")?.value;
  const day = parts.find((x) => x.type === "day")?.value;
  if (!y || !m || !day) {
    const yy = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mo}-${dd}`;
  }
  return `${y}-${m}-${day}`;
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
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
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

      const res = await fetch(`${API_BASE}/api/doctor/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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

      const dc = asObj(data.dashboardCalendar) ?? asObj(data.dashboard_calendar);
      const apiCalTz = dc ? String(dc.timezone ?? "").trim() : "";
      const todayYmdApi = dc ? String(dc.todayYmd ?? "").trim() : "";
      const tomorrowYmdApi = dc ? String(dc.tomorrowYmd ?? "").trim() : "";

      const { today: rawToday, tomorrow: rawTomorrow } = pickAppointmentArrays(data);
      const attachTz = (row: unknown) => {
        const n = normalizeApptRaw(row);
        return apiCalTz && !n.timezone ? ({ ...n, timezone: apiCalTz } as DashboardAppt) : n;
      };
      let todayList = sortPlansByStart(
        dedupePlanRows(
          rawToday.map((row) => mapApptToPlanWithSource(attachTz(row), "today")),
          "today raw"
        )
      );
      let tomorrowList = sortPlansByStart(
        dedupePlanRows(
          rawTomorrow.map((row) => mapApptToPlanWithSource(attachTz(row), "tomorrow")),
          "tomorrow raw"
        )
      );

      setRebucketFromApiOtherCount(0);

      const upcomingList: PlanRow[] = [];

      const devNow = new Date();
      const calTz = apiCalTz || Intl.DateTimeFormat().resolvedOptions().timeZone;
      const fallbackTodayYmd = todayYmdApi || formatYmdInTimeZone(devNow, calTz);
      const devTom = new Date(devNow);
      devTom.setDate(devTom.getDate() + 1);
      const fallbackTomorrowYmd = tomorrowYmdApi || formatYmdInTimeZone(devTom, calTz);

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
          const ymd = formatYmdInTimeZone(planDate, calTz);
          if (ymd === fallbackTodayYmd) todayList.push(plan);
          else if (ymd === fallbackTomorrowYmd) tomorrowList.push(plan);
          else if (ymd > fallbackTodayYmd) upcomingList.push(plan);
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
          const ymd = formatYmdInTimeZone(planDate, calTz);
          if (ymd === fallbackTodayYmd || ymd === fallbackTomorrowYmd) return;
          if (ymd > fallbackTomorrowYmd) upcomingList.push(plan);
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

      // Unread patient messages badge (deduped client-side with poll — fetchDoctorUnreadTotalOnly)
      try {
        const n = await fetchDoctorUnreadTotalOnly(token);
        setUnreadMsgCount(n);
      } catch {
        // non-critical
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

  // Poll unread message count every 30 s (lightweight — totalOnly=1)
  useEffect(() => {
    if (!token) return;
    const fetchUnread = async () => {
      try {
        const n = await fetchDoctorUnreadTotalOnly(token);
        setUnreadMsgCount(n);
      } catch { /* non-critical */ }
    };
    const id = setInterval(fetchUnread, 30_000);
    return () => clearInterval(id);
  }, [token]);

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
    const tz =
      plan.clinicTimezone && String(plan.clinicTimezone).trim().length > 0
        ? String(plan.clinicTimezone).trim()
        : Intl.DateTimeFormat().resolvedOptions().timeZone;

    let dayPillText = "—";
    let timeLabel = "";
    let fullScheduleRaw = "";

    const utcMs =
      plan.scheduledAtUtc && Number.isFinite(Date.parse(plan.scheduledAtUtc))
        ? Date.parse(plan.scheduledAtUtc)
        : null;

    if (utcMs != null) {
      const dt = new Date(utcMs);
      fullScheduleRaw =
        plan.displayTimeClinic?.replace(/\s+/g, " ").trim() || dt.toISOString();
      if (isToday) dayPillText = translateOrFallback(t, "doctor.stats.today", "Today");
      else if (isTomorrow) dayPillText = translateOrFallback(t, "timeline.tomorrow", "Tomorrow");
      else
        dayPillText = dt.toLocaleDateString(undefined, {
          timeZone: tz,
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      timeLabel = dt.toLocaleTimeString(undefined, {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (plan.displayTimeClinic) {
      const raw = String(plan.displayTimeClinic).replace(/\s+/g, " ").trim();
      fullScheduleRaw = raw;
      if (isToday) dayPillText = translateOrFallback(t, "doctor.stats.today", "Today");
      else if (isTomorrow) dayPillText = translateOrFallback(t, "timeline.tomorrow", "Tomorrow");
      else dayPillText = raw.slice(0, 10);
      timeLabel = raw.length >= 13 ? raw.slice(-5) : raw;
    } else {
      const dateStr = plan.scheduled_date || plan.date || plan.created_at;
      const parsed = dateStr ? parseScheduleLocal(String(dateStr)) : null;
      fullScheduleRaw = dateStr ? String(dateStr).replace(/\s+/g, " ").trim() : "";
      if (dateStr && parsed) {
        if (isToday) dayPillText = translateOrFallback(t, "doctor.stats.today", "Today");
        else if (isTomorrow) dayPillText = translateOrFallback(t, "timeline.tomorrow", "Tomorrow");
        else
          dayPillText = parsed.toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
            year: "numeric",
          });
        if (!Number.isNaN(parsed.getTime())) {
          timeLabel = parsed.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
        }
      } else if (dateStr) {
        const truncated = truncateForUi(fullScheduleRaw);
        dayPillText = truncated;
        timeLabel = truncated;
      }
    }

    const isScheduleTruncated = Boolean(fullScheduleRaw && fullScheduleRaw.length > 40 && !utcMs && !plan.displayTimeClinic);

    const statusUi = getPlanStatusPresentation(plan, t);
    const toothToken = extractTrailingToothToken(plan.procedure_name);

    const showPatientAlert = () =>
      Alert.alert(plan.patient.name, plan.procedure_name, [
        { text: translateOrFallback(t, "common.ok", "OK") },
      ], { cancelable: true });

    const dayPillStyle = [
      styles.planDayPill,
      isToday && styles.planDayPillToday,
      isTomorrow && styles.planDayPillTomorrow,
      (isToday || isTomorrow) && styles.planDayPillFixed,
    ];

    const rowTopEl = (
      <View style={styles.planRowTop}>
        <Text style={styles.planCalIcon} accessibilityLabel="Calendar">
          📅
        </Text>
        <View style={dayPillStyle}>
          <Text
            style={[styles.planDayPillText, (isToday || isTomorrow) && styles.planDayPillTextHighlight]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {dayPillText}
          </Text>
        </View>
        {timeLabel ? (
          <View style={styles.planTimePill}>
            <Text style={styles.planTimePillText} numberOfLines={1}>
              {timeLabel}
            </Text>
          </View>
        ) : null}
        <View style={styles.planTopDivider} />
        <Text
          style={styles.planPatientTop}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {plan.patient.name}
        </Text>
        <Text style={styles.planDot}>·</Text>
        <View style={styles.planTreatmentWrap}>
          <Text style={styles.planToothIcon} numberOfLines={1}>
            🦷
          </Text>
          <Text
            style={styles.planProcedureInline}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {plan.procedure_name}
          </Text>
        </View>
        <Text style={[styles.planToothCount, !toothToken && styles.planToothCountEmpty]}>
          {toothToken || " "}
        </Text>
      </View>
    );

    const footerEl = (
      <View style={styles.planFooter}>
        <View style={[styles.statusBadge, { backgroundColor: statusUi.bg }]}>
          <Text style={[styles.statusBadgeText, { color: statusUi.fg }]}>{statusUi.label}</Text>
        </View>
      </View>
    );

    if (isScheduleTruncated) {
      return (
        <View style={styles.planCard}>
          <View style={styles.planRowTop}>
            <Pressable
              onPress={() => openScheduleTextModal(fullScheduleRaw)}
              style={({ pressed }) => [
                styles.planScheduleTapCluster,
                pressed && styles.planPressablePressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={translateOrFallback(
                t,
                "doctor.scheduleExpandA11y",
                "View full schedule text"
              )}
            >
              <Text style={styles.planCalIcon}>📅</Text>
              <View style={dayPillStyle}>
                <Text
                  style={[styles.planDayPillText, (isToday || isTomorrow) && styles.planDayPillTextHighlight]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {dayPillText}
                </Text>
              </View>
              {timeLabel ? (
                <View style={styles.planTimePill}>
                  <Text style={styles.planTimePillText} numberOfLines={1}>
                    {timeLabel}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <View style={styles.planTopDivider} />
            <Pressable
              onPress={showPatientAlert}
              style={({ pressed }) => [styles.planPatientTapCluster, pressed && styles.planPressablePressed]}
              accessibilityLabel={plan.patient.name}
              accessibilityRole="button"
            >
              <View style={styles.planPatientTapInner}>
                <Text style={styles.planPatientTop} numberOfLines={1} ellipsizeMode="tail">
                  {plan.patient.name}
                </Text>
                <Text style={styles.planDot}>·</Text>
                <View style={styles.planTreatmentWrap}>
                  <Text style={styles.planToothIcon}>🦷</Text>
                  <Text style={styles.planProcedureInline} numberOfLines={1} ellipsizeMode="tail">
                    {plan.procedure_name}
                  </Text>
                </View>
                <Text style={[styles.planToothCount, !toothToken && styles.planToothCountEmpty]}>
                  {toothToken || " "}
                </Text>
              </View>
            </Pressable>
          </View>
          {footerEl}
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
        {rowTopEl}
        {footerEl}
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
            onPress={() => router.push("/doctor/inbox")}
          >
            <View style={styles.actionIconWrap}>
              <Text style={styles.actionIcon}>💬</Text>
              {unreadMsgCount > 0 && (
                <View style={styles.requestsBadge}>
                  <Text style={styles.requestsBadgeTxt}>
                    {unreadMsgCount > 99 ? "99+" : unreadMsgCount}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.actionLabel}>
              {t("doctor.quickActions.messages") !== "doctor.quickActions.messages"
                ? t("doctor.quickActions.messages")
                : "Leads Inbox"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push("/doctor/patients")}
          >
            <View style={styles.actionIconWrap}>
              <Text style={styles.actionIcon}>👥</Text>
            </View>
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
          <View style={styles.actionIconWrap}>
            <Text style={styles.navIcon}>👥</Text>
            {unreadMsgCount > 0 && (
              <View style={styles.requestsBadge}>
                <Text style={styles.requestsBadgeTxt}>
                  {unreadMsgCount > 99 ? "99+" : unreadMsgCount}
                </Text>
              </View>
            )}
          </View>
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
  planRowTop: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    marginBottom: 8,
    minWidth: 0,
  },
  planCalIcon: { fontSize: 13, marginRight: 2 },
  planDayPill: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#f3f4f6",
    maxWidth: "34%",
  },
  planDayPillToday: { backgroundColor: "#dcfce7" },
  planDayPillTomorrow: { backgroundColor: "#dbeafe" },
  planDayPillFixed: { minWidth: 44 },
  planDayPillText: { fontSize: 11, color: "#6b7280", fontWeight: "600" },
  planDayPillTextHighlight: { color: "#111827", fontWeight: "700" },
  planTimePill: {
    marginLeft: 4,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#f3f4f6",
  },
  planTimePillText: { fontSize: 11, color: "#374151", fontWeight: "600" },
  planTopDivider: { width: 1, height: 16, backgroundColor: "#e5e7eb", marginHorizontal: 6 },
  planPatientTop: { flexShrink: 1, maxWidth: "38%", fontSize: 14, fontWeight: "700", color: "#111827" },
  planDot: { fontSize: 13, color: "#9ca3af", marginHorizontal: 2, fontWeight: "700" },
  planTreatmentWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    maxWidth: "28%",
    minWidth: 0,
  },
  planToothIcon: { fontSize: 12, marginRight: 2 },
  planProcedureInline: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  planToothCount: { width: 24, textAlign: "right", fontSize: 12, fontWeight: "700", color: "#374151" },
  planToothCountEmpty: { color: "transparent" },
  planScheduleTapCluster: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  planPatientTapCluster: { flex: 1, flexShrink: 1, minWidth: 0 },
  planPatientTapInner: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },
  planFooter: { flexDirection: "row", justifyContent: "flex-start", alignItems: "center", marginTop: 6 },
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
