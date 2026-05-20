import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import { useLanguage } from "../../lib/language-context";
import { JourneyStepper } from "./JourneyStepper";
import { IntakeChecklist } from "./IntakeChecklist";
import type { IntakeJourneyPayload, OperationalIntakeFlags } from "../../lib/treatmentGuide/types";

const PIPELINE_I18N: Record<string, string> = {
  goals: "treatmentGuide.pipeline.goals",
  photos: "treatmentGuide.pipeline.photos",
  xray: "treatmentGuide.pipeline.xray",
  doctor_review: "treatmentGuide.pipeline.doctorReview",
  coordinator: "treatmentGuide.pipeline.coordinator",
  consultation: "treatmentGuide.pipeline.consultation",
};

type Props = {
  loading?: boolean;
  intakeJourney: IntakeJourneyPayload | null;
  flags: OperationalIntakeFlags | null;
};

/**
 * Calm, guided progress — compact by default; full stepper on expand.
 */
export function IntakeWorkflowPanel({ loading, intakeJourney, flags }: Props) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  const currentStageLabel = useMemo(() => {
    const steps = intakeJourney?.steps || [];
    const current = steps.find((s) => s.status === "current");
    if (current) {
      const key = PIPELINE_I18N[current.key];
      if (key) return t(key);
      if (current.title) return current.title;
    }
    return flags?.journeyStageLabel || null;
  }, [intakeJourney, flags, t]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color="#2563eb" />
        <Text style={styles.loadingText}>{t("treatmentGuide.loadingIntake")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.panelTitle}>{t("treatmentGuide.workflow.title")}</Text>
      <Text style={styles.panelHint}>{t("treatmentGuide.workflow.hint")}</Text>

      {currentStageLabel ? (
        <View style={styles.stageChip}>
          <Text style={styles.stageChipLabel}>{t("treatmentGuide.workflow.currentStage")}</Text>
          <Text style={styles.stageChipValue}>{currentStageLabel}</Text>
        </View>
      ) : null}

      <IntakeChecklist flags={flags} embedded maxVisible={4} />

      <TouchableOpacity
        style={styles.expandBtn}
        onPress={() => setExpanded((v) => !v)}
        accessibilityRole="button"
      >
        <Text style={styles.expandBtnText}>
          {expanded ? t("treatmentGuide.workflow.hideDetails") : t("treatmentGuide.workflow.showDetails")}
        </Text>
      </TouchableOpacity>

      {expanded ? <JourneyStepper intakeJourney={intakeJourney} embedded /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    paddingVertical: 12,
  },
  loadingText: { fontSize: 13, color: "#64748b", fontWeight: "600" },
  panel: {
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  panelTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  panelHint: { fontSize: 12, color: "#64748b", lineHeight: 17, marginBottom: 12 },
  stageChip: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  stageChipLabel: { fontSize: 11, fontWeight: "700", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 },
  stageChipValue: { fontSize: 14, fontWeight: "700", color: "#0f172a", marginTop: 4 },
  expandBtn: { marginTop: 8, paddingVertical: 6 },
  expandBtnText: { fontSize: 13, fontWeight: "700", color: "#2563eb" },
});
