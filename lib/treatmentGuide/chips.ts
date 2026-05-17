/** Patient goal chip → existing operational tag slugs (do not invent new tags). */

export type TreatmentGoalChipId =
  | "missing_teeth"
  | "smile_aesthetics"
  | "pain"
  | "broken_tooth"
  | "chewing"
  | "whitening"
  | "orthodontics"
  | "full_mouth";

export type TreatmentGoalChipDef = {
  id: TreatmentGoalChipId;
  /** i18n key: treatmentGuide.chip.<id> */
  labelKey: string;
  tags: string[];
};

export const TREATMENT_GOAL_CHIPS: TreatmentGoalChipDef[] = [
  { id: "missing_teeth", labelKey: "treatmentGuide.chip.missingTeeth", tags: ["implant_interest"] },
  { id: "smile_aesthetics", labelKey: "treatmentGuide.chip.smileAesthetics", tags: ["cosmetic_goal"] },
  { id: "pain", labelKey: "treatmentGuide.chip.pain", tags: ["pain_signal"] },
  { id: "broken_tooth", labelKey: "treatmentGuide.chip.brokenTooth", tags: ["broken_tooth"] },
  { id: "chewing", labelKey: "treatmentGuide.chip.chewing", tags: ["chewing_problem"] },
  { id: "whitening", labelKey: "treatmentGuide.chip.whitening", tags: ["whitening_interest"] },
  { id: "orthodontics", labelKey: "treatmentGuide.chip.orthodontics", tags: ["orthodontic_interest"] },
  {
    id: "full_mouth",
    labelKey: "treatmentGuide.chip.fullMouth",
    tags: ["full_mouth_restoration_interest"],
  },
];

const CHIP_BY_TAG = new Map<string, TreatmentGoalChipId>();
for (const chip of TREATMENT_GOAL_CHIPS) {
  for (const tag of chip.tags) {
    if (!CHIP_BY_TAG.has(tag)) CHIP_BY_TAG.set(tag, chip.id);
  }
}

export function tagsToChipIds(tags: string[]): TreatmentGoalChipId[] {
  const ids = new Set<TreatmentGoalChipId>();
  for (const tag of tags) {
    const id = CHIP_BY_TAG.get(tag);
    if (id) ids.add(id);
  }
  return [...ids];
}

export function chipIdsToTags(chipIds: Iterable<TreatmentGoalChipId>): string[] {
  const out = new Set<string>();
  for (const id of chipIds) {
    const chip = TREATMENT_GOAL_CHIPS.find((c) => c.id === id);
    if (chip) chip.tags.forEach((t) => out.add(t));
  }
  return [...out];
}
