import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLanguage } from "../lib/language-context";
import { formatSmileScore, type SmileScoreData } from "../lib/smileScore";

type Props = {
  data: SmileScoreData;
  compact?: boolean;
};

export function SmileScoreResult({ data, compact }: Props) {
  const { t } = useLanguage();
  const scoreLabel = formatSmileScore(data.smileScore);
  const potentialLabel = formatSmileScore(data.potentialScore);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.scoreHero}>
        <Text style={styles.scoreEmoji}>😁</Text>
        <View style={styles.scoreTextCol}>
          <Text style={styles.scoreTitle}>{t("smileScore.title")}</Text>
          <Text style={styles.scoreValue}>
            {t("smileScore.overall", { score: scoreLabel })}
          </Text>
        </View>
      </View>

      {data.strengths.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("smileScore.strengths")}</Text>
          {data.strengths.map((line, i) => (
            <Text key={`s-${i}`} style={styles.bulletLine}>
              ✅ {line}
            </Text>
          ))}
        </View>
      ) : null}

      {data.improvementAreas.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("smileScore.improvements")}</Text>
          {data.improvementAreas.map((line, i) => (
            <Text key={`i-${i}`} style={styles.bulletLine}>
              🔹 {line}
            </Text>
          ))}
        </View>
      ) : null}

      {Number.isFinite(data.potentialScore) ? (
        <View style={styles.potentialBox}>
          <Text style={styles.potentialTitle}>{t("smileScore.potentialTitle")}</Text>
          <Text style={styles.potentialValue}>
            ✨ {t("smileScore.potentialValue", { score: potentialLabel })}
          </Text>
        </View>
      ) : null}

      {data.recommendations.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("smileScore.recommendations")}</Text>
          {data.recommendations.map((line, i) => (
            <Text key={`r-${i}`} style={styles.dotLine}>
              • {line}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.notesBox}>
        <Text style={styles.notesTitle}>{t("smileScore.notesTitle")}</Text>
        <Text style={styles.noteLine}>• {t("smileScore.noteAesthetic")}</Text>
        <Text style={styles.noteLine}>• {t("smileScore.noteNotDiagnosis")}</Text>
        <Text style={styles.noteLine}>• {t("smileScore.noteNoDisease")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 14,
  },
  wrapCompact: {
    gap: 12,
  },
  scoreHero: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ecfdf5",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  scoreEmoji: {
    fontSize: 32,
  },
  scoreTextCol: {
    flex: 1,
    gap: 4,
  },
  scoreTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: "#047857",
    letterSpacing: 0.2,
  },
  scoreValue: {
    fontSize: 22,
    fontWeight: "800",
    color: "#065f46",
    letterSpacing: -0.3,
  },
  section: {
    gap: 6,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 2,
  },
  bulletLine: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 21,
  },
  dotLine: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 21,
    paddingLeft: 2,
  },
  potentialBox: {
    backgroundColor: "#f5f3ff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ddd6fe",
    gap: 4,
  },
  potentialTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#5b21b6",
  },
  potentialValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#4c1d95",
    lineHeight: 22,
  },
  notesBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 4,
  },
  notesTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#64748b",
    marginBottom: 2,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  noteLine: {
    fontSize: 11,
    color: "#64748b",
    lineHeight: 16,
  },
});
