/**
 * Parsed doctor dashboard snapshot — safe to cache and hydrate UI without re-fetching.
 */

export type DashboardStats = {
  planned: number;
  in_progress: number;
  done: number;
  today: number;
  waiting: number;
};

export type DashboardPlanRow = {
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
  _sourceBucket?: "today" | "tomorrow" | "legacy";
};

export type DashboardRecentPatient = {
  id: string;
  name: string;
  hasRisk?: boolean;
  riskFlags?: { type?: string; code: string; label?: string }[];
  lastVisit?: string | null;
};

export type DoctorDashboardViewModel = {
  doctorName: string;
  stats: DashboardStats;
  todayPlans: DashboardPlanRow[];
  tomorrowPlans: DashboardPlanRow[];
  upcomingPlans: DashboardPlanRow[];
  recentPatients: DashboardRecentPatient[];
  rebucketFromApiOtherCount: number;
};

export const DOCTOR_DASHBOARD_VM_CACHE_KEY = "doctor:dashboard:vm";

export type DashboardSecondarySnapshot = {
  pendingRequestCount: number;
  unreadMsgCount: number;
};

export const DOCTOR_DASHBOARD_SECONDARY_CACHE_KEY = "doctor:dashboard:secondary";
