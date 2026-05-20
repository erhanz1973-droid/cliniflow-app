import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DOCTOR_REQUESTS_LIST_CACHE_KEY,
  type DoctorRequestRow,
  stripRequestPhotosForPaint,
} from "./doctorRequestsCache";
import { setCachedResource } from "./resourceCache";
import { recordCacheMetric } from "./cacheMetrics";

const DISK_KEY = "doctor.requests.list.v1";

let writeTimer: ReturnType<typeof setTimeout> | null = null;

function safeParse(raw: string | null): DoctorRequestRow[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as DoctorRequestRow[]) : null;
  } catch {
    return null;
  }
}

/** Cold start: show last requests list before network (stale-while-revalidate). */
export async function hydrateDoctorRequestsFromDisk(): Promise<DoctorRequestRow[] | null> {
  try {
    const raw = await AsyncStorage.getItem(DISK_KEY);
    const rows = safeParse(raw);
    if (!rows?.length) return null;
    setCachedResource(DOCTOR_REQUESTS_LIST_CACHE_KEY, rows);
    recordCacheMetric("requests_cache_hit", { key: "disk", source: "hydrate" });
    return rows;
  } catch {
    return null;
  }
}

/** Debounced disk write — photos stripped to keep payload small. */
export function persistDoctorRequestsList(rows: DoctorRequestRow[]): void {
  setCachedResource(DOCTOR_REQUESTS_LIST_CACHE_KEY, rows);
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    const lean = stripRequestPhotosForPaint(rows);
    void AsyncStorage.setItem(DISK_KEY, JSON.stringify(lean)).catch(() => {});
  }, 400);
}
