/** Maps clinic referral tiers + successful invites-as-inviter to UI milestones (aligned with referrals screen). */

export type ReferralLevels = {
  level1?: number | null;
  level2?: number | null;
  level3?: number | null;
};

export type Milestone = { friends: number; percent: number };

export function buildMilestones(levels: ReferralLevels | null | undefined): Milestone[] {
  const l1 = levels?.level1 ?? 5;
  const l2 = levels?.level2 ?? 10;
  const l3 = levels?.level3 ?? 15;
  const l5 = Math.max(l3, 25);
  return [
    { friends: 1, percent: l1 },
    { friends: 2, percent: l2 },
    { friends: 3, percent: l3 },
    { friends: 5, percent: l5 },
  ];
}

export function personalDiscountPercent(
  approvedAsInviter: number,
  levels: ReferralLevels | null | undefined
): number {
  const l1 = levels?.level1 ?? 5;
  const l2 = levels?.level2 ?? 10;
  const l3 = levels?.level3 ?? 15;
  if (approvedAsInviter <= 0) return 0;
  if (approvedAsInviter === 1) return l1;
  if (approvedAsInviter === 2) return l2;
  return l3;
}

export function nextUnlockHint(
  approvedAsInviter: number,
  milestones: Milestone[]
): { need: number; percent: number } | null {
  const next = milestones.find((m) => m.friends > approvedAsInviter);
  if (!next) return null;
  return { need: next.friends - approvedAsInviter, percent: next.percent };
}

export function progressRatio(approvedAsInviter: number, milestones: Milestone[]): number {
  if (milestones.length === 0) return 0;
  const maxFriends = milestones[milestones.length - 1].friends;
  return Math.min(1, approvedAsInviter / maxFriends);
}
