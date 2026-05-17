import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useLanguage } from "../../lib/language-context";
import { isHotLead, leadDataHasSignals, type AiLeadData } from "../../lib/aiCoordinator";

type Props = {
  leadData: AiLeadData;
  /** Hides travel/country chips on the patient Treatment Guide. */
  variant?: "coordinator" | "treatment_guide";
};

function Chip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function LeadInsightsBar({ leadData, variant = "coordinator" }: Props) {
  const { t } = useLanguage();
  const isGuide = variant === "treatment_guide";

  if (!leadDataHasSignals(leadData)) return null;

  const chips: string[] = [];

  if (leadData.treatmentInterest) {
    chips.push(`${t("aiCoordinator.lead.treatment")}: ${leadData.treatmentInterest}`);
  }
  if (!isGuide && leadData.country) {
    chips.push(`${t("aiCoordinator.lead.country")}: ${leadData.country}`);
  }
  if (leadData.language) {
    chips.push(`${t("aiCoordinator.lead.language")}: ${leadData.language.toUpperCase()}`);
  }
  if (!isGuide && leadData.travelTimeline) {
    chips.push(`${t("aiCoordinator.lead.travel")}: ${leadData.travelTimeline}`);
  }
  if (leadData.urgency) {
    chips.push(`${t("aiCoordinator.lead.urgency")}: ${leadData.urgency}`);
  }
  if (leadData.bookingIntent) {
    chips.push(`${t("aiCoordinator.lead.booking")}: ${leadData.bookingIntent}`);
  }
  if (leadData.budgetSignal) {
    chips.push(`${t("aiCoordinator.lead.budget")}: ${leadData.budgetSignal}`);
  }

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
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {chips.map((label) => (
          <Chip key={label} label={label} />
        ))}
      </ScrollView>
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
  title: { fontSize: 11, fontWeight: "700", color: "#047857", textTransform: "uppercase", letterSpacing: 0.4 },
  hotBadge: {
    backgroundColor: "#dc2626",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hotText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  chipRow: { flexDirection: "row", gap: 8, paddingRight: 8 },
  chip: {
    backgroundColor: "#fff",
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    maxWidth: 220,
  },
  chipText: { fontSize: 12, fontWeight: "600", color: "#065f46" },
});
