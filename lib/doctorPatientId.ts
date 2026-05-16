export type DoctorPatientListRow = {
  id?: string | null;
  patient_id?: string | null;
  patientId?: string | null;
};

/**
 * API lists `id` before slug; prefer UUID when backend sends both.
 * Order: patients.id → patient_id → patientId (same as formatted list semantics).
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function doctorPatientPrimaryKey(p: DoctorPatientListRow): string {
  const id = String(p?.id ?? "").trim();
  const slug =
    String(p?.patient_id ?? "").trim() || String(p?.patientId ?? "").trim();
  return id || slug;
}

/** Prefer patients.id UUID so Requests + Patients open the same chat route key. */
export function resolveDoctorPatientRouteId(input: {
  id?: string | null;
  patientId?: string | null;
  patient_id?: string | null;
}): string {
  const candidates = [input.id, input.patientId, input.patient_id]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  const uuid = candidates.find((c) => UUID_RE.test(c));
  return uuid || candidates[0] || "";
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
