import React from "react";
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useLanguage } from "../../lib/language-context";
import { TREATMENT_GOAL_CHIPS, type TreatmentGoalChipId } from "../../lib/treatmentGuide/chips";

type Props = {
  selectedIds: TreatmentGoalChipId[];
  onToggle: (id: TreatmentGoalChipId) => void;
  saving?: boolean;
};

export function GoalChips({ selectedIds, onToggle, saving }: Props) {
  const { t } = useLanguage();
  const selected = new Set(selectedIds);

  return (
    <View>
      <Text style={styles.reportedLabel}>{t("treatmentGuide.patientReportedLabel")}</Text>
      <Text style={styles.subtitle}>{t("treatmentGuide.goalsSubtitle")}</Text>
      <View style={styles.chipRow}>
        {TREATMENT_GOAL_CHIPS.map((chip) => {
          const active = selected.has(chip.id);
          return (
            <Pressable
              key={chip.id}
              onPress={() => onToggle(chip.id)}
              disabled={saving}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t(chip.labelKey)}</Text>
            </Pressable>
          );
        })}
      </View>
      {saving ? (
        <View style={styles.savingRow}>
          <ActivityIndicator size="small" color="#2563eb" />
          <Text style={styles.savingText}>{t("treatmentGuide.savingGoals")}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  reportedLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#0369a1",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  subtitle: { fontSize: 12, color: "#64748b", lineHeight: 17, marginBottom: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  chipActive: {
    backgroundColor: "#eff6ff",
    borderColor: "#2563eb",
  },
  chipText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  chipTextActive: { color: "#1d4ed8" },
  savingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  savingText: { fontSize: 12, color: "#64748b" },
});
