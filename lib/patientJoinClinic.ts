/**
 * Single shape for PATCH /api/patient/clinic (join / switch clinic).
 * Always use clinic_code (not clinic_id) so referral + billing paths stay aligned.
 */
export type JoinClinicPatchBody = {
  clinic_code: string;
  referral_code?: string;
};

export function buildJoinClinicPatchBody(
  clinicCode: string,
  referralCode?: string | null
): JoinClinicPatchBody {
  const code = String(clinicCode || "").trim().toUpperCase();
  if (!code) {
    throw new Error("clinic_code_required");
  }
  const out: JoinClinicPatchBody = { clinic_code: code };
  const ref = String(referralCode ?? "").trim().toUpperCase();
  if (ref) {
    out.referral_code = ref;
  }
  return out;
}
