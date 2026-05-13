export type DoctorPatientListRow = {
  id?: string | null;
  patient_id?: string | null;
  patientId?: string | null;
};

/**
 * API lists `id` before slug; prefer UUID when backend sends both.
 * Order: patients.id → patient_id → patientId (same as formatted list semantics).
 */
export function doctorPatientPrimaryKey(p: DoctorPatientListRow): string {
  const id = String(p?.id ?? "").trim();
  const slug =
    String(p?.patient_id ?? "").trim() || String(p?.patientId ?? "").trim();
  return id || slug;
}

/** Normalize expo-router params: arrays, bogus "undefined"/"null" literals. Safe decode for deep links. */
export function normalizeRouteParam(
  value: string | string[] | undefined | null,
): string {
  if (Array.isArray(value)) return normalizeRouteParam(value[0]);
  if (value === undefined || value === null || value === "undefined") return "";
  const raw = String(value).trim();
  if (!raw || raw === "undefined" || raw === "null") return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
