/**
 * Smile Score domain types — supports future category dashboard.
 */
export type SmileCategoryScores = {
  whiteness?: number | null;
  alignment?: number | null;
  symmetry?: number | null;
  aesthetics?: number | null;
};

export type SmileScoreHistoryEntry = {
  id: string;
  analyzedAt: number;
  smileScore: number;
  dentalSmileScore?: number | null;
  facialHarmonyScore?: number | null;
  potentialScore: number;
  strengths: string[];
  improvementAreas: string[];
  recommendations: string[];
  fileUrl?: string;
  contentHash?: string;
  /** Reserved for future per-category vision output */
  categoryScores?: SmileCategoryScores;
};

/** Future: weighted overall from category scores (not used in production yet). */
export function computeOverallFromCategoryScores(
  cats: SmileCategoryScores | null | undefined,
): number | null {
  if (!cats) return null;
  const weights = [
    { v: cats.whiteness, w: 0.25 },
    { v: cats.alignment, w: 0.25 },
    { v: cats.symmetry, w: 0.25 },
    { v: cats.aesthetics, w: 0.25 },
  ];
  let sum = 0;
  let wSum = 0;
  for (const { v, w } of weights) {
    const n = Number(v);
    if (Number.isFinite(n)) {
      sum += n * w;
      wSum += w;
    }
  }
  if (wSum === 0) return null;
  return Math.round((sum / wSum) * 10) / 10;
}
