import React from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useLanguage } from "../../lib/language-context";
import type { IntakeJourneyPayload, IntakeStepStatus } from "../../lib/treatmentGuide/types";

const PIPELINE_I18N: Record<string, string> = {
  goals: "treatmentGuide.pipeline.goals",
  photos: "treatmentGuide.pipeline.photos",
  xray: "treatmentGuide.pipeline.xray",
  doctor_review: "treatmentGuide.pipeline.doctorReview",
  coordinator: "treatmentGuide.pipeline.coordinator",
  consultation: "treatmentGuide.pipeline.consultation",
};

const STATUS_I18N: Record<IntakeStepStatus, string> = {
  complete: "treatmentGuide.stepStatus.complete",
  current: "treatmentGuide.stepStatus.current",
  pending: "treatmentGuide.stepStatus.pending",
  skipped: "treatmentGuide.stepStatus.skipped",
};

type Props = {
  intakeJourney: IntakeJourneyPayload | null;
  /** When true, omit outer card (nested in IntakeWorkflowPanel). */
  embedded?: boolean;
};

export function JourneyStepper({ intakeJourney, embedded }: Props) {
  const { t } = useLanguage();
  const steps = intakeJourney?.steps || [];
  if (!steps.length) return null;

  return (
    <View style={[styles.wrap, embedded && styles.wrapEmbedded]}>
      {!embedded ? (
        <Text style={styles.title}>{t("treatmentGuide.stepper.title")}</Text>
      ) : null}
      {!embedded && intakeJourney?.readinessPercent != null ? (
        <Text style={styles.readiness}>
          {t("treatmentGuide.checklist.readiness", {
            percent: String(intakeJourney.readinessPercent),
          })}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {steps.map((step, index) => {
          const labelKey = PIPELINE_I18N[step.key] || null;
          const label = labelKey ? t(labelKey) : step.title;
          const statusKey = STATUS_I18N[step.status] || STATUS_I18N.pending;
          const isComplete = step.status === "complete";
          const isCurrent = step.status === "current";
          const isSkipped = step.status === "skipped";

          return (
            <View key={step.key || String(index)} style={styles.step}>
              <View
                style={[
                  styles.dot,
                  isComplete && styles.dotComplete,
                  isCurrent && styles.dotActive,
                  isSkipped && styles.dotSkipped,
                ]}
              >
                <Text style={[styles.dotText, (isComplete || isCurrent) && styles.dotTextActive]}>
                  {isComplete ? "✓" : isSkipped ? "–" : index + 1}
                </Text>
              </View>
              <Text
                style={[styles.stepLabel, isCurrent && styles.stepLabelActive]}
                numberOfLines={2}
              >
                {label}
              </Text>
              <Text style={styles.statusLabel} numberOfLines={1}>
                {t(statusKey)}
              </Text>
              {index < steps.length - 1 ? (
                <View
                  style={[styles.connector, (isComplete || isCurrent) && styles.connectorDone]}
                />
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 16,
  },
  wrapEmbedded: {
    backgroundColor: "#fff",
    marginBottom: 12,
  },
  title: { fontSize: 15, fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  readiness: { fontSize: 12, color: "#64748b", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "flex-start", paddingRight: 8 },
  step: { width: 112, alignItems: "center", position: "relative", paddingBottom: 4 },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#f1f5f9",
    borderWidth: 2,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
  },
  dotComplete: { backgroundColor: "#ecfdf5", borderColor: "#6ee7b7" },
  dotActive: { backgroundColor: "#eff6ff", borderColor: "#2563eb" },
  dotSkipped: { backgroundColor: "#f8fafc", borderColor: "#cbd5e1" },
  dotText: { fontSize: 12, fontWeight: "800", color: "#94a3b8" },
  dotTextActive: { color: "#1e40af" },
  stepLabel: {
    fontSize: 11,
    color: "#64748b",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 14,
    fontWeight: "600",
  },
  stepLabelActive: { color: "#1d4ed8", fontWeight: "800" },
  statusLabel: {
    fontSize: 9,
    color: "#94a3b8",
    marginTop: 4,
    textAlign: "center",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  connector: {
    position: "absolute",
    top: 13,
    left: 86,
    width: 48,
    height: 2,
    backgroundColor: "#e2e8f0",
  },
  connectorDone: { backgroundColor: "#6ee7b7" },
});
