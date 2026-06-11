import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLanguage } from "../../lib/language-context";

const HERO_STEP_KEYS = [
  "smilePhotoGuide.heroStep1",
  "smilePhotoGuide.heroStep2",
  "smilePhotoGuide.heroStep3",
] as const;

const SAMPLE_SMILE_SCORE = "7.2";
const SAMPLE_POTENTIAL_SCORE = "8.6";

type Props = {
  compact?: boolean;
};

export function SmilePhotoCaptureMotivation({ compact }: Props) {
  const { t } = useLanguage();

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>
        {t("smilePhotoGuide.heroTitle")}
      </Text>

      <View style={styles.steps}>
        {HERO_STEP_KEYS.map((key) => (
          <Text key={key} style={[styles.stepLine, compact && styles.stepLineCompact]}>
            {t(key)}
          </Text>
        ))}
      </View>

      <View style={[styles.sampleCard, compact && styles.sampleCardCompact]}>
        <Text style={styles.sampleLabel}>{t("smilePhotoGuide.sampleLabel")}</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.scoreMain}>
            {t("smileScore.title")}: {SAMPLE_SMILE_SCORE} / 10
          </Text>
        </View>
        <Text style={styles.potentialLine}>
          ✨ {t("smileScore.potentialValue", { score: SAMPLE_POTENTIAL_SCORE })}
        </Text>
        <Text style={styles.sampleDisclaimer}>{t("smilePhotoGuide.sampleOnly")}</Text>
      </View>

      <Text style={[styles.durationLine, compact && styles.durationLineCompact]}>
        {t("smilePhotoGuide.analysisDuration")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: "#34d399",
    gap: 12,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  wrapCompact: { padding: 14, gap: 10, borderRadius: 14 },
  heroTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#065f46",
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  heroTitleCompact: { fontSize: 19, lineHeight: 25 },
  steps: { gap: 6 },
  stepLine: { fontSize: 15, color: "#334155", lineHeight: 22, fontWeight: "600" },
  stepLineCompact: { fontSize: 14, lineHeight: 20 },
  sampleCard: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    gap: 6,
  },
  sampleCardCompact: { padding: 12, gap: 5 },
  sampleLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  scoreRow: { marginTop: 2 },
  scoreMain: { fontSize: 20, fontWeight: "800", color: "#047857" },
  potentialLine: { fontSize: 14, fontWeight: "700", color: "#0369a1", lineHeight: 20 },
  sampleDisclaimer: {
    fontSize: 12,
    color: "#94a3b8",
    fontStyle: "italic",
    marginTop: 2,
  },
  durationLine: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563eb",
    textAlign: "center",
  },
  durationLineCompact: { fontSize: 13 },
});
