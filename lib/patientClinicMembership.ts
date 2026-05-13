/**
 * Single place for “is this patient linked to a clinic?” used by Home + Profile parity.
 * Profile historically used JWT `clinicId` / `clinicCode`; some Home screens used only
 * GET /api/patient/me fields — when those disagree, UI showed Find/Join while Profile showed Leave.
 */

export type PatientMeClinicFields = {
  clinicId?: string | null;
  clinic_id?: string | null;
  clinic?: { id?: string | null; name?: string | null; logo?: string | null } | null;
  clinicName?: string | null;
  clinicCode?: string | null;
  branding?: {
    clinicName?: string;
    clinicLogoUrl?: string;
    phone?: string;
    address?: string;
  } | null;
};

export function patientHasClinicFromJwt(user: unknown): boolean {
  const u = user as { clinicId?: string; clinicCode?: string } | null | undefined;
  return !!(
    String(u?.clinicId || "").trim() ||
    String(u?.clinicCode || "").trim()
  );
}

/** True when /me-shaped payload clearly indicates a clinic link (ids, embed, branding, or clinic code). */
export function patientHasClinicFromMeRecord(
  rec: PatientMeClinicFields | null | undefined
): boolean {
  if (!rec) return false;
  const fromIds =
    String(rec.clinicId || "").trim() ||
    String(rec.clinic_id || "").trim() ||
    String(rec.clinic?.id || "").trim();
  if (fromIds) return true;

  const b = rec.branding;
  if (b && typeof b === "object") {
    const brandSignal =
      String(b.clinicName || "").trim() ||
      String(b.clinicLogoUrl || "").trim() ||
      String(b.phone || "").trim() ||
      String(b.address || "").trim();
    if (brandSignal) return true;
  }

  const code = String(rec.clinicCode || "").trim();
  if (code.length >= 2) return true;

  const nm = String(rec.clinicName || "").trim();
  if (nm.length >= 2) return true;

  return false;
}

export function derivePatientClinicMembership(args: {
  user: unknown;
  patientRecord: PatientMeClinicFields | null | undefined;
}): {
  hasClinic: boolean;
  jwtLinked: boolean;
  meLinked: boolean;
  sources: string[];
} {
  const jwtLinked = patientHasClinicFromJwt(args.user);
  const meLinked = patientHasClinicFromMeRecord(args.patientRecord);
  const sources: string[] = [];
  if (jwtLinked) sources.push("jwt");
  if (meLinked) sources.push("me");
  return {
    hasClinic: jwtLinked || meLinked,
    jwtLinked,
    meLinked,
    sources,
  };
}
