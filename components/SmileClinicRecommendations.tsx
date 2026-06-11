import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useLanguage } from "../lib/language-context";
import type { SmileScoreData } from "../lib/smileScore";
import { inferSmileSpecialtyHints, SMILE_SPECIALTY_HINTS } from "../lib/smileClinicMapping";

export type ClinicRecommendation = {
  id: string;
  name: string;
  specialty?: string;
  distance?: string;
};

type Props = {
  smileData: SmileScoreData;
  clinics?: ClinicRecommendation[];
};

export function SmileClinicRecommendations({ smileData, clinics }: Props) {
  const { t } = useLanguage();
  const router = useRouter();

  const hints = useMemo(() => inferSmileSpecialtyHints(smileData), [smileData]);
  const hintLabels = hints
    .map((id) => SMILE_SPECIALTY_HINTS.find((h) => h.id === id))
    .filter(Boolean)
    .map((h) => t(h!.labelKey));

  const hasClinics = Array.isArray(clinics) && clinics.length > 0;

  if (!hasClinics && hintLabels.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t("smileScore.clinicSectionTitle")}</Text>
      <Text style={styles.sub}>{t("smileScore.clinicSectionSub")}</Text>

      {hintLabels.length > 0 ? (
        <View style={styles.hintRow}>
          {hintLabels.map((label) => (
            <View key={label} style={styles.hintChip}>
              <Text style={styles.hintChipText}>{label}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {hasClinics ? (
        <View style={styles.list}>
          {clinics!.slice(0, 4).map((c) => (
            <TouchableOpacity
              key={c.id}
              style={styles.clinicRow}
              onPress={() =>
                router.push({
                  pathname: "/(patient)/messages" as const,
                  params: { clinicId: c.id },
                } as never)
              }
              activeOpacity={0.85}
            >
              <Text style={styles.clinicName} numberOfLines={1}>
                {c.name}
              </Text>
              {c.specialty ? (
                <Text style={styles.clinicMeta}>{c.specialty}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <TouchableOpacity
          style={styles.browseBtn}
          onPress={() => router.push("/clinic-onboarding" as never)}
          activeOpacity={0.88}
        >
          <Text style={styles.browseText}>{t("smileScore.browseClinics")}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 8,
  },
  title: { fontSize: 14, fontWeight: "800", color: "#0f172a" },
  sub: { fontSize: 12, color: "#64748b", lineHeight: 18 },
  hintRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  hintChip: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  hintChipText: { fontSize: 11, fontWeight: "700", color: "#0369a1" },
  list: { gap: 8 },
  clinicRow: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  clinicName: { fontSize: 14, fontWeight: "700", color: "#111827" },
  clinicMeta: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  browseBtn: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#cbd5e1",
  },
  browseText: { fontSize: 13, fontWeight: "700", color: "#2563eb" },
});
