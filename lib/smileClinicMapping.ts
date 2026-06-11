import type { SmileScoreData } from "./smileScore";

export type SmileClinicRecommendation = {
  id: string;
  name: string;
  specialty?: string;
  distance?: string;
};

export type SmileClinicSpecialtyHint = {
  id: string;
  labelKey: string;
  match: RegExp;
};

export const SMILE_SPECIALTY_HINTS: SmileClinicSpecialtyHint[] = [
  { id: "whitening", labelKey: "smileScore.clinicHint.whitening", match: /whiten|bleach|bright|beyaz/i },
  { id: "orthodontics", labelKey: "smileScore.clinicHint.orthodontics", match: /orthodont|align|brace|invisalign|çapra/i },
  { id: "implants", labelKey: "smileScore.clinicHint.implants", match: /implant|missing\s*tooth|eksik\s*diş/i },
  { id: "veneers", labelKey: "smileScore.clinicHint.veneers", match: /veneer|laminate|kaplama|cosmetic/i },
  { id: "cleaning", labelKey: "smileScore.clinicHint.cleaning", match: /clean|hygien|scaling|temizlik|detartr/i },
];

export function inferSmileSpecialtyHints(data: SmileScoreData | null | undefined): string[] {
  if (!data) return [];
  const blob = [
    ...data.recommendations,
    ...data.improvementAreas,
    ...data.strengths,
  ].join(" ");
  const hits: string[] = [];
  for (const h of SMILE_SPECIALTY_HINTS) {
    if (h.match.test(blob)) hits.push(h.id);
  }
  return hits;
}

export function parseClinicsFromAnalysisPayload(
  payload: Record<string, unknown> | null | undefined,
): SmileClinicRecommendation[] | undefined {
  if (!payload) return undefined;
  const raw = payload.clinics;
  if (!Array.isArray(raw)) return undefined;
  const out: SmileClinicRecommendation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const id = String(row.id || "").trim();
    const name = String(row.name || "").trim();
    if (!id || !name) continue;
    out.push({
      id,
      name,
      specialty: row.specialty ? String(row.specialty) : undefined,
      distance: row.distance ? String(row.distance) : undefined,
    });
  }
  return out.length ? out : undefined;
}
