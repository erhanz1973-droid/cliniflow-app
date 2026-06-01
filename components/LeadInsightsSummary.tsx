import { StyleSheet, Text, View } from "react-native";

export type LeadSummarySection = {
  id: string;
  title: string;
  bullets: string[];
};

type Props = {
  sections?: LeadSummarySection[] | null;
  /** Flat fallback when only lines are available. */
  lines?: string[] | null;
  compact?: boolean;
};

export function LeadInsightsSummary({ sections, lines, compact = false }: Props) {
  const normalizedSections =
    sections?.filter((s) => s?.title && Array.isArray(s.bullets) && s.bullets.length) || [];

  if (normalizedSections.length) {
    return (
      <View style={[styles.wrap, compact && styles.wrapCompact]}>
        {normalizedSections.map((section) => (
          <View key={section.id || section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.bullets.map((bullet) => (
              <View key={bullet} style={styles.bulletRow}>
                <Text style={styles.bulletMark}>•</Text>
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  const flat = (lines || []).map((line) => String(line || "").trim()).filter(Boolean);
  if (!flat.length) return null;

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {flat.map((line) => (
        <View key={line} style={styles.bulletRow}>
          <Text style={styles.bulletMark}>•</Text>
          <Text style={styles.bulletText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    marginBottom: 6,
  },
  wrapCompact: {
    gap: 8,
    marginBottom: 0,
  },
  section: {
    gap: 4,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.35,
    color: "#047857",
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingRight: 4,
  },
  bulletMark: {
    fontSize: 12,
    lineHeight: 17,
    color: "#059669",
    marginTop: 1,
  },
  bulletText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
    color: "#374151",
  },
});
