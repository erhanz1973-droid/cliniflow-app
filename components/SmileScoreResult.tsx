import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLanguage } from "../lib/language-context";
import { formatSmileScore, type SmileScoreData } from "../lib/smileScore";
import { buildSmileAiSummaryLines } from "../lib/smileAiSummary";
import type { SmileCategoryScores } from "../lib/smileScoreTypes";

function ScoreRow({
  emoji,
  label,
  score,
  prominent,
}: {
  emoji: string;
  label: string;
  score: number | null | undefined;
  prominent?: boolean;
}) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  return (
    <View style={[styles.scoreRow, prominent && styles.scoreRowProminent]}>
      <Text style={styles.scoreRowEmoji}>{emoji}</Text>
      <View style={styles.scoreRowTextCol}>
        <Text style={[styles.scoreRowLabel, prominent && styles.scoreRowLabelProminent]}>
          {label}
        </Text>
        <Text style={[styles.scoreRowValue, prominent && styles.scoreRowValueProminent]}>
          {formatSmileScore(score)} / 10
        </Text>
      </View>
    </View>
  );
}

function CategoryScoreRow({
  emoji,
  label,
  score,
}: {
  emoji: string;
  label: string;
  score: number | null | undefined;
}) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  return (
    <View style={styles.categoryRow}>
      <Text style={styles.categoryEmoji}>{emoji}</Text>
      <Text style={styles.categoryLabel}>{label}</Text>
      <Text style={styles.categoryValue}>{formatSmileScore(score)} / 10</Text>
    </View>
  );
}

function hasSubCategoryScores(cats?: SmileCategoryScores | null): boolean {
  if (!cats) return false;
  return [cats.whiteness, cats.alignment, cats.symmetry, cats.aesthetics].some(
    (v) => v != null && Number.isFinite(Number(v)),
  );
}

type AiSummaryProps = {
  data: SmileScoreData;
  summary?: string;
  recommendation?: string;
  insights?: string[];
};

function AiSummaryBlock({ data, summary, recommendation, insights }: AiSummaryProps) {
  const { t } = useLanguage();
  const lines = buildSmileAiSummaryLines(data, { summary, recommendation, insights });

  if (!lines.length) return null;

  return (
    <View style={styles.aiSummaryBox}>
      <Text style={styles.sectionTitle}>{t("smileScore.aiSummaryTitle")}</Text>
      {lines.map((line, i) => (
        <Text key={`ai-${i}`} style={styles.aiSummaryLine}>
          {line.emoji} {line.text}
        </Text>
      ))}
    </View>
  );
}

type Props = {
  data: SmileScoreData;
  compact?: boolean;
  summary?: string;
  recommendation?: string;
  insights?: string[];
  showNotes?: boolean;
};

export function SmileScoreResult({
  data,
  compact,
  summary,
  recommendation,
  insights,
  showNotes = true,
}: Props) {
  const { t } = useLanguage();
  const scoreLabel = formatSmileScore(data.smileScore);
  const potentialLabel = formatSmileScore(data.potentialScore);
  const hasPrimaryScores =
    (data.dentalSmileScore != null && Number.isFinite(Number(data.dentalSmileScore))) ||
    (data.facialHarmonyScore != null && Number.isFinite(Number(data.facialHarmonyScore)));
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.scoreHero}>
        <Text style={styles.scoreEmoji}>😁</Text>
        <View style={styles.scoreTextCol}>
          <Text style={styles.scoreTitle}>{t("smileScore.overallTitle")}</Text>
          <Text style={styles.scoreValue}>
            {t("smileScore.overall", { score: scoreLabel })}
          </Text>
        </View>
      </View>

      {hasPrimaryScores ? (
        <View style={styles.primaryScoresBox}>
          <ScoreRow
            emoji="🦷"
            label={t("smileScore.dentalTitle")}
            score={data.dentalSmileScore}
            prominent
          />
          <ScoreRow
            emoji="😊"
            label={t("smileScore.facialHarmonyTitle")}
            score={data.facialHarmonyScore}
            prominent
          />
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

      <AiSummaryBlock
        data={data}
        summary={summary}
        recommendation={recommendation}
        insights={insights}
      />

      {hasSubCategoryScores(data.categoryScores) ? (
        <View style={styles.categoryBox}>
          <Text style={styles.sectionTitle}>{t("smileScore.subCategoryTitle")}</Text>
          <CategoryScoreRow
            emoji="⚪"
            label={t("smileScore.categoryWhiteness")}
            score={data.categoryScores?.whiteness}
          />
          <CategoryScoreRow
            emoji="📏"
            label={t("smileScore.categoryAlignment")}
            score={data.categoryScores?.alignment}
          />
          <CategoryScoreRow
            emoji="😊"
            label={t("smileScore.categorySymmetry")}
            score={data.categoryScores?.symmetry}
          />
          <CategoryScoreRow
            emoji="✨"
            label={t("smileScore.categoryAesthetics")}
            score={data.categoryScores?.aesthetics}
          />
        </View>
      ) : null}

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

      {showNotes ? (
        <View style={styles.notesBox}>
          <Text style={styles.notesTitle}>{t("smileScore.notesTitle")}</Text>
          <Text style={styles.noteLine}>• {t("smileScore.noteAesthetic")}</Text>
          <Text style={styles.noteLine}>• {t("smileScore.noteNotDiagnosis")}</Text>
          <Text style={styles.noteLine}>• {t("smileScore.noteNoDisease")}</Text>
        </View>
      ) : null}
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
  aiSummaryBox: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  aiSummaryLine: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 21,
  },
  primaryScoresBox: {
    backgroundColor: "#f0f9ff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#bae6fd",
    gap: 10,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  scoreRowProminent: {
    paddingVertical: 2,
  },
  scoreRowEmoji: { fontSize: 22, width: 28, textAlign: "center" },
  scoreRowTextCol: { flex: 1, gap: 2 },
  scoreRowLabel: { fontSize: 13, fontWeight: "700", color: "#334155" },
  scoreRowLabelProminent: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  scoreRowValue: { fontSize: 16, fontWeight: "800", color: "#0369a1" },
  scoreRowValueProminent: { fontSize: 18, color: "#0c4a6e" },
  categoryBox: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  categoryEmoji: { fontSize: 16, width: 22, textAlign: "center" },
  categoryLabel: { flex: 1, fontSize: 14, color: "#334155", fontWeight: "600" },
  categoryValue: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
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
