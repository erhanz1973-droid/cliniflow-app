import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import type { DiscoveryFilterState } from "../../lib/clinicDiscoveryTypes";
import {
  DISCOVERY_LANGUAGE_OPTIONS,
  DISCOVERY_SPECIALTY_OPTIONS,
} from "../../lib/clinicDiscoveryTypes";

type Props = {
  filters: DiscoveryFilterState;
  onChange: (next: DiscoveryFilterState) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function DiscoveryFilterBar({ filters, onChange, t }: Props) {
  const set = (patch: Partial<DiscoveryFilterState>) => onChange({ ...filters, ...patch });

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t("discovery.filtersTitle")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rowScroll}>
        <View style={styles.row}>
          <Chip
            label={t("discovery.filterRating45")}
            active={filters.minGoogleRating === 4.5}
            onPress={() =>
              set({
                minGoogleRating: filters.minGoogleRating === 4.5 ? null : 4.5,
              })
            }
          />
          <Chip
            label={t("discovery.filterRating48")}
            active={filters.minGoogleRating === 4.8}
            onPress={() =>
              set({
                minGoogleRating: filters.minGoogleRating === 4.8 ? null : 4.8,
              })
            }
          />
          <Chip
            label={t("discovery.filterReviews100")}
            active={filters.minGoogleReviews === 100}
            onPress={() =>
              set({
                minGoogleReviews: filters.minGoogleReviews === 100 ? null : 100,
              })
            }
          />
          <Chip
            label={t("discovery.filterReviews500")}
            active={filters.minGoogleReviews === 500}
            onPress={() =>
              set({
                minGoogleReviews: filters.minGoogleReviews === 500 ? null : 500,
              })
            }
          />
          <Chip
            label={t("discovery.filterVerified")}
            active={filters.verifiedOnly}
            onPress={() => set({ verifiedOnly: !filters.verifiedOnly })}
          />
        </View>
      </ScrollView>

      <Text style={styles.subTitle}>{t("discovery.filterSpecialty")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          <Chip
            label={t("discovery.filterAny")}
            active={!filters.specialty}
            onPress={() => set({ specialty: "" })}
          />
          {DISCOVERY_SPECIALTY_OPTIONS.map((s) => (
            <Chip
              key={s}
              label={s}
              active={filters.specialty === s}
              onPress={() => set({ specialty: filters.specialty === s ? "" : s })}
            />
          ))}
        </View>
      </ScrollView>

      <Text style={styles.subTitle}>{t("discovery.filterLanguage")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          <Chip
            label={t("discovery.filterAny")}
            active={!filters.language}
            onPress={() => set({ language: "" })}
          />
          {DISCOVERY_LANGUAGE_OPTIONS.map((lang) => (
            <Chip
              key={lang}
              label={lang}
              active={filters.language === lang}
              onPress={() => set({ language: filters.language === lang ? "" : lang })}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  title: { fontSize: 13, fontWeight: "700", color: "#374151", marginBottom: 8, paddingHorizontal: 16 },
  subTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 16,
  },
  rowScroll: { marginBottom: 4 },
  row: { flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  chipActive: { backgroundColor: "#DBEAFE", borderColor: "#93C5FD" },
  chipText: { fontSize: 12, fontWeight: "600", color: "#4B5563" },
  chipTextActive: { color: "#1D4ED8" },
});
