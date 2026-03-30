import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from "react-native";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface DiagnosisItem {
  code: string;
  title: string;       // Patient-friendly label
  description?: string; // Expandable detail
}

interface Props {
  diagnoses: DiagnosisItem[];
}

function SingleDiagnosis({ item }: { item: DiagnosisItem }) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.code}>{item.code}</Text>
        </View>
        {!!item.description && (
          <TouchableOpacity onPress={toggle} style={styles.expandBtn} activeOpacity={0.7}>
            <Text style={styles.expandBtnText}>
              {expanded ? "Gizle ▲" : "Detaylı açıkla ▼"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {expanded && !!item.description && (
        <Text style={styles.description}>{item.description}</Text>
      )}
    </View>
  );
}

export default function DiagnosisCard({ diagnoses }: Props) {
  if (!diagnoses || diagnoses.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Tanı bilgisi bulunmuyor.</Text>
      </View>
    );
  }

  return (
    <View>
      {diagnoses.map((item, idx) => (
        <SingleDiagnosis key={item.code || idx} item={item} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#2563eb",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: {
    gap: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  code: {
    fontSize: 11,
    color: "#6b7280",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: "monospace",
  },
  expandBtn: {
    alignSelf: "flex-start",
  },
  expandBtnText: {
    fontSize: 12,
    color: "#2563eb",
    fontWeight: "500",
  },
  description: {
    marginTop: 10,
    fontSize: 13,
    color: "#374151",
    lineHeight: 20,
    borderTopWidth: 1,
    borderTopColor: "#f0f0f0",
    paddingTop: 10,
  },
  empty: {
    paddingVertical: 10,
  },
  emptyText: {
    fontSize: 13,
    color: "#9ca3af",
    fontStyle: "italic",
  },
});
