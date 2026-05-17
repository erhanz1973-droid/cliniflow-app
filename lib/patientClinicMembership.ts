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

/** Parse GET /api/patient/me JSON into clinic membership fields. */
export function parsePatientMeClinicFields(
  meJson: Record<string, unknown> | null | undefined,
): PatientMeClinicFields | null {
  if (!meJson || meJson.ok !== true) return null;

  const cidRaw =
    meJson.clinic_id != null && String(meJson.clinic_id).trim() !== ""
      ? String(meJson.clinic_id).trim()
      : meJson.clinicId != null && String(meJson.clinicId).trim() !== ""
        ? String(meJson.clinicId).trim()
        : null;

  const clinicNameTop =
    meJson.clinic_name != null && String(meJson.clinic_name).trim() !== ""
      ? String(meJson.clinic_name).trim()
      : null;

  const brandRaw =
    meJson.branding && typeof meJson.branding === "object"
      ? (meJson.branding as Record<string, unknown>)
      : null;
  const brand = brandRaw
    ? {
        clinicLogoUrl:
          brandRaw.clinicLogoUrl != null ? String(brandRaw.clinicLogoUrl) : undefined,
        clinicName: brandRaw.clinicName != null ? String(brandRaw.clinicName) : undefined,
      }
    : null;

  const codeTop =
    meJson.clinicCode != null && String(meJson.clinicCode).trim() !== ""
      ? String(meJson.clinicCode).trim()
      : null;

  const clinicEmbed =
    meJson.clinic &&
    typeof meJson.clinic === "object" &&
    meJson.clinic != null &&
    (meJson.clinic as { id?: unknown }).id != null &&
    String((meJson.clinic as { id?: unknown }).id).trim() !== ""
      ? {
          id: String((meJson.clinic as { id: unknown }).id),
          name: String(
            (meJson.clinic as { name?: string }).name ||
              clinicNameTop ||
              brand?.clinicName ||
              "",
          ).trim(),
          logo:
            (meJson.clinic as { logo?: unknown }).logo != null &&
            String((meJson.clinic as { logo?: unknown }).logo).trim() !== ""
              ? String((meJson.clinic as { logo?: unknown }).logo).trim()
              : null,
        }
      : null;

  return {
    clinic_id: cidRaw,
    clinicId: cidRaw,
    clinicCode: codeTop,
    clinicName: clinicNameTop,
    clinic: clinicEmbed,
    branding: brand,
  };
}

/** Authoritative linked clinic id when membership is active (not route-only). */
export function resolveLinkedClinicId(args: {
  user: unknown;
  patientRecord: PatientMeClinicFields | null | undefined;
  routeClinicId?: string | null;
}): string | null {
  const membership = derivePatientClinicMembership({
    user: args.user,
    patientRecord: args.patientRecord,
  });
  if (!membership.hasClinic) return null;

  const fromMe = String(
    args.patientRecord?.clinicId ||
      args.patientRecord?.clinic_id ||
      args.patientRecord?.clinic?.id ||
      "",
  ).trim();
  if (fromMe) return fromMe;

  const u = args.user as { clinicId?: string } | null | undefined;
  const fromJwt = String(u?.clinicId || "").trim();
  if (fromJwt) return fromJwt;

  const route = String(args.routeClinicId || "").trim();
  return route || null;
}

export function resolveLinkedClinicDisplayName(
  patientRecord: PatientMeClinicFields | null | undefined,
): string {
  if (!patientRecord) return "";
  return (
    String(patientRecord.clinic?.name || "").trim() ||
    String(patientRecord.clinicName || "").trim() ||
    String(patientRecord.branding?.clinicName || "").trim() ||
    String(patientRecord.clinicCode || "").trim()
  );
}
