import { API_BASE } from "@/lib/api";

export type ClinicSettingsPayload = {
  id?: string | null;
  name?: string | null;
  referral_discount_percent?: number | null;
  referralDiscountPercent?: number | null;
  settings?: {
    referral_discount_percent?: number | null;
    referralDiscountPercent?: number | null;
    referralLevels?: { level1?: number | null };
    defaultInviterDiscountPercent?: number | null;
    defaultInvitedDiscountPercent?: number | null;
  } | null;
  referralLevels?: { level1?: number | null };
  defaultInviterDiscountPercent?: number | null;
  default_inviter_discount_percent?: number | null;
  defaultInvitedDiscountPercent?: number | null;
  default_invited_discount_percent?: number | null;
};

/** 0–100; missing/invalid → 0 per product spec. */
export function normalizeReferralDiscountPercent(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Same field priority as backend `readReferralDiscountPercentFromClinicRow`. */
export function extractReferralDiscountPercent(
  payload: ClinicSettingsPayload | Record<string, unknown> | null | undefined,
): number {
  if (!payload || typeof payload !== "object") return 0;
  const settings =
    payload.settings && typeof payload.settings === "object" ? payload.settings : {};
  const levels =
    (settings as { referralLevels?: { level1?: number | null } }).referralLevels ||
    (payload as ClinicSettingsPayload).referralLevels ||
    {};
  const candidates = [
    (payload as ClinicSettingsPayload).referral_discount_percent,
    (payload as ClinicSettingsPayload).referralDiscountPercent,
    (settings as { referral_discount_percent?: number }).referral_discount_percent,
    (settings as { referralDiscountPercent?: number }).referralDiscountPercent,
    levels.level1,
    (settings as { defaultInviterDiscountPercent?: number }).defaultInviterDiscountPercent,
    (payload as ClinicSettingsPayload).defaultInviterDiscountPercent,
    (payload as ClinicSettingsPayload).default_inviter_discount_percent,
    (settings as { default_inviter_discount_percent?: number }).default_inviter_discount_percent,
    (payload as ClinicSettingsPayload).defaultInvitedDiscountPercent,
    (payload as ClinicSettingsPayload).default_invited_discount_percent,
  ];
  for (const raw of candidates) {
    if (raw != null && String(raw).trim() !== "") {
      const n = normalizeReferralDiscountPercent(raw);
      if (n > 0) return n;
    }
  }
  return 0;
}

export function formatReferralDiscountText(percent: number): string {
  return `%${normalizeReferralDiscountPercent(percent)}`;
}

export async function fetchClinicReferralSettings(
  token: string,
): Promise<{ settings: ClinicSettingsPayload | null; percent: number }> {
  const headers = { Authorization: `Bearer ${token}` };

  try {
    const settingsRes = await fetch(`${API_BASE}/api/clinic/settings`, { headers });
    if (settingsRes.ok) {
      const json = await settingsRes.json();
      const data = (json?.data ?? json) as ClinicSettingsPayload;
      const percent = extractReferralDiscountPercent(data);
      return { settings: data, percent };
    }
  } catch {
    /* fall through */
  }

  try {
    const meRes = await fetch(`${API_BASE}/api/patient/me`, { headers });
    if (meRes.ok) {
      const me = (await meRes.json()) as Record<string, unknown>;
      const fromMe = extractReferralDiscountPercent({
        referral_discount_percent: me.referral_discount_percent,
        settings: me.settings as ClinicSettingsPayload["settings"],
        referralLevels: me.referralLevels as ClinicSettingsPayload["referralLevels"],
        defaultInviterDiscountPercent: me.defaultInviterDiscountPercent as number | undefined,
        default_inviter_discount_percent: me.default_inviter_discount_percent as number | undefined,
      });
      if (fromMe > 0) {
        return { settings: null, percent: fromMe };
      }

      const clinicCode = String(me.clinicCode || me.clinic_code || "").trim();
      if (clinicCode) {
        const clinicRes = await fetch(
          `${API_BASE}/api/clinic?code=${encodeURIComponent(clinicCode)}`,
        );
        if (clinicRes.ok) {
          const clinic = (await clinicRes.json()) as ClinicSettingsPayload;
          const fromClinic = extractReferralDiscountPercent(clinic);
          if (fromClinic > 0) {
            return { settings: clinic, percent: fromClinic };
          }
        }
      }
    }
  } catch {
    /* fall through */
  }

  return { settings: null, percent: 0 };
}
