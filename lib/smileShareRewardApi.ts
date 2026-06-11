import { API_BASE, getAuthHeaders } from "./api";

export type SmileShareRewardStatus = {
  rewardClaimed: boolean;
  bonusAnalyses: number;
  canClaimReward: boolean;
};

export async function fetchSmileShareRewardStatus(): Promise<SmileShareRewardStatus | null> {
  try {
    const res = await fetch(`${API_BASE}/api/patient/me/smile-share-reward`, {
      headers: { ...getAuthHeaders(), Accept: "application/json" },
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !json.ok) return null;
    return {
      rewardClaimed: Boolean(json.rewardClaimed),
      bonusAnalyses: Number(json.bonusAnalyses) || 0,
      canClaimReward: Boolean(json.canClaimReward),
    };
  } catch {
    return null;
  }
}

export type ClaimSmileShareRewardResult =
  | { ok: true; bonusAnalyses: number; alreadyClaimed?: boolean }
  | { ok: false; error: string; message?: string };

export async function claimSmileFacebookShareReward(): Promise<ClaimSmileShareRewardResult> {
  try {
    const res = await fetch(`${API_BASE}/api/patient/me/smile-share-reward/claim`, {
      method: "POST",
      headers: {
        ...getAuthHeaders(),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: "facebook" }),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || !json.ok) {
      return {
        ok: false,
        error: String(json.error || "claim_failed"),
        message: json.message ? String(json.message) : undefined,
      };
    }
    return {
      ok: true,
      bonusAnalyses: Number(json.bonusAnalyses) || 0,
      alreadyClaimed: Boolean(json.alreadyClaimed),
    };
  } catch (e) {
    return { ok: false, error: "network", message: String((e as Error)?.message || e) };
  }
}
