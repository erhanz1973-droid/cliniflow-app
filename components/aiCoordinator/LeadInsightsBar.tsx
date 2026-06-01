import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLanguage } from "../../lib/language-context";
import { isHotLead, leadDataHasSignals, type AiLeadData } from "../../lib/aiCoordinator";
import {
  LeadInsightsSummary,
  type LeadSummarySection,
} from "../LeadInsightsSummary";

type Props = {
  /** Session machine state (hot-lead heuristic only — not shown in UI). */
  leadData: AiLeadData;
  leadSummarySections?: LeadSummarySection[];
  leadSummaryLines?: string[];
  variant?: "coordinator" | "treatment_guide";
};

export function LeadInsightsBar({
  leadData,
  leadSummarySections = [],
  leadSummaryLines = [],
  variant = "coordinator",
}: Props) {
  const { t } = useLanguage();
  const isGuide = variant === "treatment_guide";

  const hasSections =
    leadSummarySections.length > 0 ||
    leadSummaryLines.some((line) => String(line || "").trim());
  if (!hasSections && !leadDataHasSignals(leadData)) return null;
  if (!hasSections) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>
          {isGuide ? t("treatmentGuide.lead.title") : t("aiCoordinator.lead.title")}
        </Text>
        {isHotLead(leadData) ? (
          <View style={styles.hotBadge}>
            <Text style={styles.hotText}>{t("aiCoordinator.lead.hot")}</Text>
          </View>
        ) : null}
      </View>
      <LeadInsightsSummary
        sections={leadSummarySections}
        lines={leadSummaryLines}
        compact
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#f0fdf4",
    borderBottomWidth: 1,
    borderBottomColor: "#bbf7d0",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    color: "#047857",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  hotBadge: {
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hotText: { fontSize: 10, fontWeight: "800", color: "#fff" },
});
