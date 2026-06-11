import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useLanguage } from "../../lib/language-context";
import { formatSmileScore } from "../../lib/smileScore";
import type { LatestSmileScoreSnapshot } from "../../lib/loadLatestSmileScore";

type Props = {
  snapshot: LatestSmileScoreSnapshot;
  onViewAnalysis: () => void;
};

export function HomeSmileScoreCard({ snapshot, onViewAnalysis }: Props) {
  const { t } = useLanguage();
  const score = formatSmileScore(snapshot.smileScore);
  const potential = formatSmileScore(snapshot.potentialScore);

  return (
    <View style={styles.wrap}>
      <View style={styles.scoreRow}>
        <Text style={styles.emoji}>😁</Text>
        <View style={styles.scoreCol}>
          <Text style={styles.label}>{t("smileScore.title")}</Text>
          <Text style={styles.score}>{score} / 10</Text>
          <Text style={styles.potential}>
            {t("home.smileScoreCardPotential", { score: potential })}
          </Text>
        </View>
      </View>
      <Pressable
        onPress={onViewAnalysis}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>{t("home.smileScoreViewAnalysis")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#ecfdf5",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#6ee7b7",
    padding: 16,
    gap: 14,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  emoji: { fontSize: 36 },
  scoreCol: { flex: 1, gap: 2 },
  label: {
    fontSize: 13,
    fontWeight: "800",
    color: "#047857",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  score: {
    fontSize: 28,
    fontWeight: "800",
    color: "#065f46",
    letterSpacing: -0.5,
  },
  potential: {
    fontSize: 14,
    fontWeight: "600",
    color: "#059669",
    marginTop: 2,
  },
  cta: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#34d399",
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaPressed: { opacity: 0.88 },
  ctaText: {
    fontSize: 15,
    fontWeight: "800",
    color: "#047857",
  },
});
