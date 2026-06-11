import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import type { SmileScoreData } from "../../lib/smileScore";
import { getShareCardDisplayLines } from "../../lib/smileShareCard";

type Props = {
  data: SmileScoreData;
  compact?: boolean;
};

export function SmileShareCardPreview({ data, compact }: Props) {
  const lines = useMemo(() => getShareCardDisplayLines(data), [data]);

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Text style={styles.primary}>{lines.primary}</Text>
      <Text style={styles.evaluated}>{lines.evaluated}</Text>
      {lines.scoreLine ? <Text style={styles.score}>{lines.scoreLine}</Text> : null}
      <View style={styles.divider} />
      <Text style={styles.footer}>{lines.footerCta}</Text>
      <Text style={styles.brand}>{lines.brand}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ecfdf5",
    borderRadius: 18,
    padding: 20,
    borderWidth: 2,
    borderColor: "#6ee7b7",
    alignItems: "center",
    gap: 8,
  },
  cardCompact: { padding: 16, borderRadius: 14 },
  primary: {
    fontSize: 20,
    fontWeight: "800",
    color: "#065f46",
    textAlign: "center",
    lineHeight: 28,
  },
  evaluated: {
    fontSize: 14,
    fontWeight: "600",
    color: "#047857",
    textAlign: "center",
  },
  score: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0369a1",
    textAlign: "center",
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: "#a7f3d0",
    width: "100%",
    marginVertical: 6,
  },
  footer: {
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    textAlign: "center",
    lineHeight: 20,
  },
  brand: {
    fontSize: 13,
    fontWeight: "800",
    color: "#64748b",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});
