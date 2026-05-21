/** Shared doctor roster lifecycle — mirrors backend isPatientActiveForDoctorMessaging. */

export type DoctorPatientLifecycleFields = {
  clinicId?: string | null;
  clinic_id?: string | null;
  isLead?: boolean;
  is_lead?: boolean;
  archivedAt?: string | number | null;
  archived_at?: string | number | null;
  threadLifecycleStatus?: string | null;
  lifecycle_status?: string | null;
  messagingActive?: boolean;
  conversationArchived?: boolean;
  leftClinic?: boolean;
};

function patientClinicId(p: DoctorPatientLifecycleFields, doctorClinicId?: string | null): string {
  const raw = p.clinicId ?? p.clinic_id ?? null;
  const pc = raw != null ? String(raw).trim() : "";
  if (pc) return pc;
  const dc = doctorClinicId != null ? String(doctorClinicId).trim() : "";
  return dc;
}

function isTruthyArchivedAt(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "number") return Number.isFinite(v) && v > 0;
  return String(v).trim() !== "";
}

function threadLifecycleArchived(p: DoctorPatientLifecycleFields): boolean {
  const life = String(p.threadLifecycleStatus ?? p.lifecycle_status ?? "")
    .trim()
    .toLowerCase();
  if (life === "archived") return true;
  return false;
}

/** True when patient must not show an actionable Messages CTA. */
export function isDoctorPatientArchivedOrUnlinked(
  p: DoctorPatientLifecycleFields,
  doctorClinicId?: string | null,
): boolean {
  /** Backend roster flag (enrolled member or admin-assigned lead). */
  if (p.messagingActive === true) return false;

  if (p.messagingActive === false) return true;
  if (p.conversationArchived === true) return true;
  if (p.leftClinic === true) return true;

  const pc = patientClinicId(p, doctorClinicId);
  const dc = doctorClinicId != null ? String(doctorClinicId).trim() : "";
  if (!pc) return true;
  if (dc && pc !== dc) return true;

  const isLead = p.isLead === true || p.is_lead === true;
  if (isLead) return true;

  if (isTruthyArchivedAt(p.archivedAt) || isTruthyArchivedAt(p.archived_at)) return true;
  if (threadLifecycleArchived(p)) return true;

  return false;
}

export function doctorPatientCanReceiveMessages(
  p: DoctorPatientLifecycleFields,
  doctorClinicId?: string | null,
): boolean {
  return !isDoctorPatientArchivedOrUnlinked(p, doctorClinicId);
}

export function doctorPatientArchivedLabel(
  p: DoctorPatientLifecycleFields,
  t: (key: string) => string,
): string {
  const isLead = p.isLead === true || p.is_lead === true;
  const left =
    p.leftClinic === true ||
    !patientClinicId(p) ||
    (isLead && p.messagingActive !== true) ||
    isTruthyArchivedAt(p.archivedAt) ||
    isTruthyArchivedAt(p.archived_at);

  if (left) {
    const k = "doctor.patients.leftClinic";
    return t(k) !== k ? t(k) : "Patient left clinic";
  }
  const k = "doctor.patients.conversationArchived";
  return t(k) !== k ? t(k) : "Conversation archived";
}
