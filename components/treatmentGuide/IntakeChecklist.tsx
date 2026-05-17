import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLanguage } from "../../lib/language-context";
import { buildIntakeChecklist } from "../../lib/treatmentGuide/checklist";
import type { OperationalIntakeFlags } from "../../lib/treatmentGuide/types";

type Props = {
  flags: OperationalIntakeFlags | null;
  embedded?: boolean;
};

function StatusIcon({ status }: { status: "done" | "pending" | "optional" }) {
  if (status === "done") return <Text style={styles.iconDone}>✓</Text>;
  if (status === "optional") return <Text style={styles.iconOptional}>–</Text>;
  return <Text style={styles.iconPending}>○</Text>;
}

export function IntakeChecklist({ flags, embedded }: Props) {
  const { t } = useLanguage();
  const items = useMemo(() => buildIntakeChecklist(flags), [flags]);

  if (!items.length) return null;

  return (
    <View style={[styles.card, embedded && styles.cardEmbedded]}>
      <Text style={styles.title}>{t("treatmentGuide.checklist.title")}</Text>
      {flags?.readinessPercent != null ? (
        <Text style={styles.percent}>
          {t("treatmentGuide.checklist.readiness", { percent: String(flags.readinessPercent) })}
        </Text>
      ) : null}
      {items.map((item) => (
        <View key={item.id} style={styles.row}>
          <StatusIcon status={item.status} />
          <View style={styles.rowText}>
            <Text
              style={[
                styles.label,
                item.status === "done" && styles.labelDone,
                item.status === "pending" && styles.labelPending,
              ]}
            >
              {t(item.labelKey)}
            </Text>
            {item.hintKey ? <Text style={styles.hint}>{t(item.hintKey)}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardEmbedded: {
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingTop: 0,
    backgroundColor: "transparent",
  },
  title: { fontSize: 15, fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  percent: { fontSize: 12, color: "#64748b", marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  iconDone: { fontSize: 16, fontWeight: "800", color: "#059669", width: 20, marginTop: 1 },
  iconPending: { fontSize: 16, fontWeight: "700", color: "#94a3b8", width: 20, marginTop: 1 },
  iconOptional: { fontSize: 16, color: "#cbd5e1", width: 20, marginTop: 1 },
  rowText: { flex: 1 },
  label: { fontSize: 14, color: "#334155", lineHeight: 20, fontWeight: "600" },
  labelDone: { color: "#047857" },
  labelPending: { color: "#475569" },
  hint: { fontSize: 12, color: "#64748b", marginTop: 2, lineHeight: 17 },
});
