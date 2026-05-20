import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DOCTOR_DASHBOARD_SECONDARY_CACHE_KEY,
  DOCTOR_DASHBOARD_VM_CACHE_KEY,
  type DashboardSecondarySnapshot,
  type DoctorDashboardViewModel,
} from "./doctorDashboardViewModel";
import { setCachedResource } from "./resourceCache";
import { recordCacheMetric } from "./cacheMetrics";

const DISK_VM_KEY = "doctor.dashboard.vm.v1";
const DISK_SECONDARY_KEY = "doctor.dashboard.secondary.v1";

let writeVmTimer: ReturnType<typeof setTimeout> | null = null;
let writeSecondaryTimer: ReturnType<typeof setTimeout> | null = null;

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Restore last dashboard snapshot from disk into memory (cold app kill). */
export async function hydrateDoctorDashboardFromDisk(): Promise<{
  vm: DoctorDashboardViewModel | null;
  secondary: DashboardSecondarySnapshot | null;
}> {
  try {
    const [vmRaw, secRaw] = await AsyncStorage.multiGet([DISK_VM_KEY, DISK_SECONDARY_KEY]);
    const vm = safeParse<DoctorDashboardViewModel>(vmRaw[1]);
    const secondary = safeParse<DashboardSecondarySnapshot>(secRaw[1]);

    if (vm) {
      setCachedResource(DOCTOR_DASHBOARD_VM_CACHE_KEY, vm);
      recordCacheMetric("dashboard_cache_hit", { key: "disk", source: "hydrate" });
    }
    if (secondary) {
      setCachedResource(DOCTOR_DASHBOARD_SECONDARY_CACHE_KEY, secondary);
    }

    return { vm, secondary };
  } catch {
    return { vm: null, secondary: null };
  }
}

export function persistDoctorDashboardVm(vm: DoctorDashboardViewModel): void {
  setCachedResource(DOCTOR_DASHBOARD_VM_CACHE_KEY, vm);
  if (writeVmTimer) clearTimeout(writeVmTimer);
  writeVmTimer = setTimeout(() => {
    writeVmTimer = null;
    void AsyncStorage.setItem(DISK_VM_KEY, JSON.stringify(vm)).catch(() => {});
  }, 400);
}

export function persistDoctorDashboardSecondary(secondary: DashboardSecondarySnapshot): void {
  setCachedResource(DOCTOR_DASHBOARD_SECONDARY_CACHE_KEY, secondary);
  if (writeSecondaryTimer) clearTimeout(writeSecondaryTimer);
  writeSecondaryTimer = setTimeout(() => {
    writeSecondaryTimer = null;
    void AsyncStorage.setItem(DISK_SECONDARY_KEY, JSON.stringify(secondary)).catch(() => {});
  }, 400);
}

export async function clearDoctorDashboardDiskCache(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([DISK_VM_KEY, DISK_SECONDARY_KEY]);
  } catch {
    /* ignore */
  }
}
