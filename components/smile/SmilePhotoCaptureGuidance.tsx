import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useLanguage } from "../../lib/language-context";
import type { SmilePhotoCaptureMode } from "../../lib/smilePhotoCapture";

type Props = {
  mode?: SmilePhotoCaptureMode;
  compact?: boolean;
  showModeBadge?: boolean;
};

const DO_KEYS_SMILE = [
  "smilePhotoGuide.do1",
  "smilePhotoGuide.do2",
  "smilePhotoGuide.do3",
  "smilePhotoGuide.do4",
  "smilePhotoGuide.do5",
  "smilePhotoGuide.do6",
] as const;

const DO_KEYS_TEETH = [
  "smilePhotoGuide.teethDo1",
  "smilePhotoGuide.teethDo2",
  "smilePhotoGuide.teethDo3",
  "smilePhotoGuide.teethDo4",
] as const;

const AVOID_KEYS = [
  "smilePhotoGuide.avoid1",
  "smilePhotoGuide.avoid2",
  "smilePhotoGuide.avoid3",
  "smilePhotoGuide.avoid4",
  "smilePhotoGuide.avoid5",
] as const;

function ExampleCard({
  variant,
  title,
  bullets,
  emoji,
  compact,
}: {
  variant: "bad" | "good";
  title: string;
  bullets: string[];
  emoji: string;
  compact?: boolean;
}) {
  const isBad = variant === "bad";
  return (
    <View style={[styles.exampleCard, isBad ? styles.exampleBad : styles.exampleGood, compact && styles.exampleCompact]}>
      <View style={[styles.exampleBadge, isBad ? styles.badgeBad : styles.badgeGood]}>
        <Text style={styles.exampleBadgeText}>{isBad ? "✕" : "✓"}</Text>
      </View>
      <View style={[styles.exampleFrame, isBad ? styles.frameBad : styles.frameGood]}>
        <Text style={[styles.exampleEmoji, compact && styles.exampleEmojiCompact]}>{emoji}</Text>
      </View>
      <Text style={styles.exampleTitle} numberOfLines={2}>
        {title}
      </Text>
      {bullets.map((line) => (
        <Text key={line} style={styles.exampleBullet}>
          • {line}
        </Text>
      ))}
    </View>
  );
}

export function SmilePhotoCaptureGuidance({
  mode = "smile",
  compact,
  showModeBadge = true,
}: Props) {
  const { t } = useLanguage();

  const modeLabelKey =
    mode === "closeup_teeth" ? "smilePhotoGuide.modeCloseup" : "smilePhotoGuide.modeSmile";
  const titleKey =
    mode === "closeup_teeth" ? "smilePhotoGuide.teethTitle" : "smilePhotoGuide.title";
  const doKeys = mode === "closeup_teeth" ? DO_KEYS_TEETH : DO_KEYS_SMILE;

  const incorrectBullets = useMemo(
    () => [
      t("smilePhotoGuide.incorrect1"),
      t("smilePhotoGuide.incorrect2"),
      t("smilePhotoGuide.incorrect3"),
    ],
    [t],
  );

  const correctBullets = useMemo(
    () => [
      t("smilePhotoGuide.correct1"),
      t("smilePhotoGuide.correct2"),
      t("smilePhotoGuide.correct3"),
      t("smilePhotoGuide.correct4"),
    ],
    [t],
  );

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {showModeBadge ? (
        <View style={styles.modeBadge}>
          <Text style={styles.modeBadgeText}>{t(modeLabelKey)}</Text>
        </View>
      ) : null}

      <Text style={[styles.title, compact && styles.titleCompact]}>{t(titleKey)}</Text>

      <View style={styles.doSection}>
        {doKeys.map((key) => (
          <Text key={key} style={styles.doLine}>
            ✅ {t(key)}
          </Text>
        ))}
      </View>

      <Text style={styles.avoidHeading}>{t("smilePhotoGuide.avoidTitle")}</Text>
      <View style={styles.avoidSection}>
        {AVOID_KEYS.map((key) => (
          <Text key={key} style={styles.avoidLine}>
            ❌ {t(key)}
          </Text>
        ))}
      </View>

      <View style={styles.examplesRow}>
        <ExampleCard
          variant="bad"
          title={t("smilePhotoGuide.incorrectTitle")}
          bullets={incorrectBullets}
          emoji="😐"
          compact={compact}
        />
        <ExampleCard
          variant="good"
          title={t("smilePhotoGuide.correctTitle")}
          bullets={correctBullets}
          emoji="😁"
          compact={compact}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  wrapCompact: { padding: 12, gap: 8 },
  modeBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#ecfdf5",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  modeBadgeText: { fontSize: 12, fontWeight: "800", color: "#047857" },
  title: { fontSize: 15, fontWeight: "800", color: "#0f172a", lineHeight: 22 },
  titleCompact: { fontSize: 14 },
  doSection: { gap: 4 },
  doLine: { fontSize: 13, color: "#334155", lineHeight: 20, fontWeight: "500" },
  avoidHeading: { fontSize: 13, fontWeight: "800", color: "#7f1d1d", marginTop: 2 },
  avoidSection: { gap: 4 },
  avoidLine: { fontSize: 13, color: "#64748b", lineHeight: 20 },
  examplesRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  exampleCard: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1.5,
    minWidth: 0,
  },
  exampleCompact: { padding: 8 },
  exampleBad: { backgroundColor: "#fff", borderColor: "#fecaca" },
  exampleGood: { backgroundColor: "#fff", borderColor: "#bbf7d0" },
  exampleBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  badgeBad: { backgroundColor: "#fee2e2" },
  badgeGood: { backgroundColor: "#dcfce7" },
  exampleBadgeText: { fontSize: 11, fontWeight: "900", color: "#334155" },
  exampleFrame: {
    height: 72,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  frameBad: { backgroundColor: "#374151" },
  frameGood: { backgroundColor: "#ecfdf5" },
  exampleEmoji: { fontSize: 36 },
  exampleEmojiCompact: { fontSize: 30 },
  exampleTitle: { fontSize: 11, fontWeight: "800", color: "#0f172a", marginBottom: 4, paddingRight: 20 },
  exampleBullet: { fontSize: 10, color: "#64748b", lineHeight: 14 },
});
