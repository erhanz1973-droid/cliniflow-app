/**
 * Future achievement badges — only show when backed by real criteria (never fake percentiles).
 */
export type SmileAchievementBadgeId =
  | "beautiful_smile"
  | "great_smile"
  | "promising_smile"
  | "smile_achievement"
  | "smile_progress";

export type SmileShareHighlight =
  | { kind: "smile"; score: number }
  | { kind: "potential"; score: number };

/** Reserved for future badge UI — returns null until real ranking/achievement rules exist. */
export function inferSmileAchievementBadge(
  _smileScore: number,
  _potentialScore: number,
): SmileAchievementBadgeId | null {
  return null;
}
