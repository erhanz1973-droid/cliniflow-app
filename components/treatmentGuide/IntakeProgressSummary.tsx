import React, { useMemo } from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/language-context";
import { buildProgressSummaryLines } from "../../lib/treatmentGuide/progressSummary";
import type { IntakeJourneyPayload, OperationalIntakeFlags } from "../../lib/treatmentGuide/types";

type Props = {
  loading?: boolean;
  intakeJourney: IntakeJourneyPayload | null;
  flags: OperationalIntakeFlags | null;
  /** One-line progress under step 4 — no card */
  subtle?: boolean;
};

/**
 * Calm, human progress — no large stepper or operational labels by default.
 */
export function IntakeProgressSummary({ loading, intakeJourney, flags, subtle }: Props) {
  const { t } = useLanguage();

  const { completedCount, totalCount, lines } = useMemo(
    () => buildProgressSummaryLines(flags, intakeJourney),
    [flags, intakeJourney],
  );

  if (loading) {
    return (
      <View style={subtle ? styles.loadingSubtle : styles.loading}>
        <ActivityIndicator size="small" color="#64748b" />
        {!subtle ? <Text style={styles.loadingText}>{t("treatmentGuide.progress.loading")}</Text> : null}
      </View>
    );
  }

  if (completedCount === 0 && lines.every((l) => !l.done)) {
    return null;
  }

  if (subtle) {
    const doneLine = lines.find((l) => l.done);
    return (
      <Text style={styles.subtleLine}>
        {t("treatmentGuide.progress.stepsCompleted", {
          count: String(completedCount),
          total: String(totalCount),
        })}
        {doneLine ? ` · ${t(doneLine.textKey)}` : ""}
      </Text>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("treatmentGuide.progress.title")}</Text>
      <Text style={styles.summary}>
        {t("treatmentGuide.progress.stepsCompleted", {
          count: String(completedCount),
          total: String(totalCount),
        })}
      </Text>
      {lines.slice(0, 4).map((line) => (
        <View key={line.id} style={styles.row}>
          <Ionicons
            name={line.done ? "checkmark-circle" : "ellipse-outline"}
            size={18}
            color={line.done ? "#059669" : "#94a3b8"}
          />
          <Text style={[styles.rowText, line.done && styles.rowTextDone]}>{t(line.textKey)}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16, paddingVertical: 8 },
  loadingSubtle: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  loadingText: { fontSize: 13, color: "#64748b" },
  subtleLine: { fontSize: 12, color: "#94a3b8", lineHeight: 17, marginBottom: 14 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  title: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginBottom: 6 },
  summary: { fontSize: 13, color: "#475569", marginBottom: 12, lineHeight: 19 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 },
  rowText: { flex: 1, fontSize: 13, color: "#64748b", lineHeight: 18 },
  rowTextDone: { color: "#334155" },
});
