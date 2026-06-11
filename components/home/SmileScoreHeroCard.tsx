import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useLanguage } from "../../lib/language-context";

type Props = {
  onStart: () => void;
  compact?: boolean;
};

export function SmileScoreHeroCard({ onStart, compact }: Props) {
  const { t } = useLanguage();

  const bullets = compact
    ? []
    : [
        t("home.smileScoreHeroBullet1"),
        t("home.smileScoreHeroBullet2"),
        t("home.smileScoreHeroBullet3"),
      ];

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={styles.title}>{t("home.smileScoreHeroTitle")}</Text>
      {bullets.map((line) => (
        <Text key={line} style={styles.bullet}>
          {line}
        </Text>
      ))}
      <Pressable
        onPress={onStart}
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>{t("home.smileScoreHeroCta")}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff",
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#34d399",
    padding: 18,
    gap: 10,
    shadowColor: "#059669",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  wrapCompact: {
    padding: 14,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#065f46",
    letterSpacing: -0.3,
  },
  bullet: {
    fontSize: 15,
    color: "#334155",
    lineHeight: 22,
    fontWeight: "500",
  },
  cta: {
    marginTop: 6,
    backgroundColor: "#059669",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaPressed: { opacity: 0.9 },
  ctaText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
