/**
 * Rule-based treatment / capture hints on top of AI tooth detections + FDI mapping.
 * AI finds teeth; this layer adds human-readable guidance only.
 */

import type { ToothBBoxWithFDI } from "./mapTeethToFDI";

export type TreatmentSuggestionType =
  | "missing_view"
  | "full_view"
  | "missing_molars";

export type TreatmentSuggestion = {
  type: TreatmentSuggestionType;
  message: string;
};

/** MVP FDI bands: üst arka azı 16–18, alt arka azı 36–38 */
function hasMolarsInView(teeth: Pick<ToothBBoxWithFDI, "toothNumber">[]): boolean {
  return teeth.some(
    (t) =>
      (t.toothNumber >= 16 && t.toothNumber <= 18) ||
      (t.toothNumber >= 36 && t.toothNumber <= 38)
  );
}

/**
 * @param teeth — `mapTeethToFDI` çıktısı (toothNumber ile)
 */
export function getTreatmentSuggestions(
  teeth: ToothBBoxWithFDI[]
): TreatmentSuggestion[] {
  const suggestions: TreatmentSuggestion[] = [];

  if (teeth.length < 8) {
    suggestions.push({
      type: "missing_view",
      message: "Tüm dişler görünmüyor, farklı açıdan foto çekin",
    });
  }

  if (teeth.length > 16) {
    suggestions.push({
      type: "full_view",
      message: "Tüm dişler net şekilde görünüyor",
    });
  }

  if (teeth.length > 0 && !hasMolarsInView(teeth)) {
    suggestions.push({
      type: "missing_molars",
      message: "Arka dişler görünmüyor, ağız daha fazla açılmalı",
    });
  }

  return suggestions;
}
