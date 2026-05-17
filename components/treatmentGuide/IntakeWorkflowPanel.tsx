import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useLanguage } from "../../lib/language-context";
import { JourneyStepper } from "./JourneyStepper";
import { IntakeChecklist } from "./IntakeChecklist";
import type { IntakeJourneyPayload, OperationalIntakeFlags } from "../../lib/treatmentGuide/types";

type Props = {
  loading?: boolean;
  intakeJourney: IntakeJourneyPayload | null;
  flags: OperationalIntakeFlags | null;
};

/**
 * Single operational progress surface — stepper + checklist from backend only.
 */
export function IntakeWorkflowPanel({ loading, intakeJourney, flags }: Props) {
  const { t } = useLanguage();

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
      <JourneyStepper intakeJourney={intakeJourney} embedded />
      <View style={styles.checklistWrap}>
        <IntakeChecklist flags={flags} embedded />
      </View>
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
    backgroundColor: "#f1f5f9",
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  panelTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  panelHint: { fontSize: 12, color: "#64748b", lineHeight: 17, marginBottom: 12 },
  checklistWrap: { marginTop: 4 },
});
