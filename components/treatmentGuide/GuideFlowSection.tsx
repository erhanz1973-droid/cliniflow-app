import React from "react";
import { View, Text, StyleSheet } from "react-native";

type Props = {
  step: 1 | 2 | 3 | 4;
  title: string;
  hint?: string;
  children: React.ReactNode;
  isLast?: boolean;
};

/**
 * Unified numbered section for the Treatment Support guided journey.
 */
export function GuideFlowSection({ step, title, hint, children, isLast }: Props) {
  return (
    <View style={[styles.section, isLast && styles.sectionLast]}>
      <View style={styles.headerRow}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepNum}>{step}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>{title}</Text>
          {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingBottom: 28,
    marginBottom: 28,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  sectionLast: {
    borderBottomWidth: 0,
    marginBottom: 8,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    marginBottom: 16,
  },
  stepBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  stepNum: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "800",
  },
  headerText: { flex: 1, minWidth: 0, paddingTop: 2 },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0f172a",
    lineHeight: 24,
    marginBottom: 4,
  },
  hint: {
    fontSize: 14,
    color: "#64748b",
    lineHeight: 20,
  },
  body: {},
});
