import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/language-context";

export type GuideEntryPath = "photos" | "concern" | "clinic" | "learn";

type EntryDef = {
  id: GuideEntryPath;
  icon: React.ComponentProps<typeof Ionicons>["name"];
  titleKey: string;
  hintKey: string;
};

const ENTRIES: EntryDef[] = [
  { id: "photos", icon: "camera-outline", titleKey: "treatmentGuide.entry.photosTitle", hintKey: "treatmentGuide.entry.photosHint" },
  { id: "concern", icon: "create-outline", titleKey: "treatmentGuide.entry.concernTitle", hintKey: "treatmentGuide.entry.concernHint" },
  { id: "clinic", icon: "chatbubble-ellipses-outline", titleKey: "treatmentGuide.entry.clinicTitle", hintKey: "treatmentGuide.entry.clinicHint" },
  { id: "learn", icon: "book-outline", titleKey: "treatmentGuide.entry.learnTitle", hintKey: "treatmentGuide.entry.learnHint" },
];

type Props = {
  onSelect: (path: GuideEntryPath) => void;
  activePath?: GuideEntryPath | null;
};

export function GuideEntryPicker({ onSelect, activePath }: Props) {
  const { t } = useLanguage();

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{t("treatmentGuide.entry.heading")}</Text>
      <Text style={styles.intro}>{t("treatmentGuide.entry.intro")}</Text>

      {ENTRIES.map((entry) => {
        const active = activePath === entry.id;
        return (
          <TouchableOpacity
            key={entry.id}
            style={[styles.card, active && styles.cardActive]}
            onPress={() => onSelect(entry.id)}
            activeOpacity={0.88}
            accessibilityRole="button"
          >
            <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
              <Ionicons name={entry.icon} size={22} color={active ? "#1d4ed8" : "#475569"} />
            </View>
            <View style={styles.textCol}>
              <Text style={styles.cardTitle}>{t(entry.titleKey)}</Text>
              <Text style={styles.cardHint}>{t(entry.hintKey)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  heading: { fontSize: 20, fontWeight: "800", color: "#0f172a", marginBottom: 8, lineHeight: 26 },
  intro: { fontSize: 14, color: "#64748b", lineHeight: 21, marginBottom: 16 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardActive: { borderColor: "#93c5fd", backgroundColor: "#f8fafc" },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapActive: { backgroundColor: "#eff6ff" },
  textCol: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  cardHint: { fontSize: 13, color: "#64748b", lineHeight: 18 },
});
