/**
 * Tracks which patient thread the doctor is actively viewing (Socket + UI).
 * Used to suppress duplicate foreground alerts/sounds for the same thread.
 */

let openPatientKey = "";

/** Normalize to compare with `thread-summary` `patientDbId` (lowercase UUID). */
export function canonicalDoctorPatientChatKey(raw: string | undefined | null): string {
  const s = String(raw ?? "").trim().toLowerCase();
  const m = /^p_([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(s);
  if (m) return m[1];
  return s;
}

export function setGlobalDoctorChatPatientIdOpen(id: string | null | undefined): void {
  openPatientKey = id ? canonicalDoctorPatientChatKey(id) : "";
}

export function getGlobalDoctorChatPatientIdOpen(): string {
  return openPatientKey;
}
