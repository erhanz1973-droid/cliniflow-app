import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLanguage } from "../lib/language-context";
import {
  groupHistoryByMonth,
  smileScoreDelta,
  type SmileScoreHistoryEntry,
} from "../lib/smileScoreHistory";
import { formatSmileScore } from "../lib/smileScore";

type Props = {
  history: SmileScoreHistoryEntry[];
  compact?: boolean;
};

export function SmileProgressSection({ history, compact }: Props) {
  const { t, currentLanguage } = useLanguage();

  const monthly = useMemo(
    () => groupHistoryByMonth(history, currentLanguage),
    [history, currentLanguage],
  );
  const delta = useMemo(() => smileScoreDelta(history), [history]);

  if (history.length < 1) return null;

  const maxScore = Math.max(...monthly.map((m) => m.score), 1);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={styles.title}>{t("smileProgress.title")}</Text>

      {delta ? (
        <View style={styles.deltaRow}>
          <Text style={styles.deltaCurrent}>
            {formatSmileScore(delta.current)} / 10
          </Text>
          {delta.delta != null ? (
            <Text
              style={[
                styles.deltaBadge,
                delta.delta >= 0 ? styles.deltaUp : styles.deltaDown,
              ]}
            >
              {delta.delta >= 0 ? "+" : ""}
              {delta.delta.toFixed(1)} {t("smileProgress.vsLast")}
            </Text>
          ) : (
            <Text style={styles.deltaFirst}>{t("smileProgress.firstScore")}</Text>
          )}
        </View>
      ) : null}

      {monthly.length > 0 ? (
        <View style={styles.chart}>
          {monthly.map((m) => (
            <View key={`${m.label}-${m.analyzedAt}`} style={styles.barCol}>
              <Text style={styles.barScore}>{formatSmileScore(m.score)}</Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { height: `${Math.max(12, (m.score / maxScore) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.barLabel} numberOfLines={1}>
                {m.label}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.timeline}>
        {monthly.map((m) => (
          <Text key={`tl-${m.analyzedAt}`} style={styles.timelineLine}>
            {m.label}: {formatSmileScore(m.score)}
          </Text>
        ))}
      </View>
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
    gap: 12,
  },
  wrapCompact: { padding: 12, gap: 10 },
  title: { fontSize: 15, fontWeight: "800", color: "#0f172a" },
  deltaRow: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  deltaCurrent: { fontSize: 22, fontWeight: "800", color: "#065f46" },
  deltaBadge: {
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  deltaUp: { backgroundColor: "#dcfce7", color: "#166534" },
  deltaDown: { backgroundColor: "#fef3c7", color: "#92400e" },
  deltaFirst: { fontSize: 13, color: "#64748b", fontWeight: "600" },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    minHeight: 120,
    paddingTop: 8,
  },
  barCol: { flex: 1, alignItems: "center", gap: 4, minWidth: 44 },
  barScore: { fontSize: 11, fontWeight: "700", color: "#047857" },
  barTrack: {
    width: "100%",
    maxWidth: 36,
    height: 72,
    backgroundColor: "#ecfdf5",
    borderRadius: 8,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barFill: {
    width: "100%",
    backgroundColor: "#34d399",
    borderRadius: 8,
  },
  barLabel: { fontSize: 10, color: "#64748b", fontWeight: "600", textAlign: "center" },
  timeline: { gap: 4, borderTopWidth: 1, borderTopColor: "#f1f5f9", paddingTop: 8 },
  timelineLine: { fontSize: 13, color: "#475569", lineHeight: 20 },
});
