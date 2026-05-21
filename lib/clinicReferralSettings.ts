import { API_BASE } from "@/lib/api";

export type ClinicSettingsPayload = {
  id?: string | null;
  name?: string | null;
  referral_discount_percent?: number | null;
};

/** 0–100; missing/invalid → 0 per product spec. */
export function normalizeReferralDiscountPercent(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function formatReferralDiscountText(percent: number): string {
  return `%${normalizeReferralDiscountPercent(percent)}`;
}

export async function fetchClinicReferralSettings(
  token: string,
): Promise<{ settings: ClinicSettingsPayload | null; percent: number }> {
  try {
    const res = await fetch(`${API_BASE}/api/clinic/settings`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { settings: null, percent: 0 };
    }
    const json = await res.json();
    const data = (json?.data ?? json) as ClinicSettingsPayload;
    const percent = normalizeReferralDiscountPercent(data?.referral_discount_percent);
    return { settings: data, percent };
  } catch {
    return { settings: null, percent: 0 };
  }
}
