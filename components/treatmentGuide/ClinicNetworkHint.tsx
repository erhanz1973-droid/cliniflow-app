import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useLanguage } from "../../lib/language-context";
import { fetchClinicDirectory, type ClinicDirectoryPayload } from "../../lib/treatmentGuide/clinicDirectoryApi";
import type { OperationalIntakeFlags } from "../../lib/treatmentGuide/types";

type Props = {
  flags: OperationalIntakeFlags | null;
  directory?: ClinicDirectoryPayload | null;
  countryHint?: string | null;
};

export function ClinicNetworkHint({ flags, directory: directoryProp, countryHint }: Props) {
  const { t } = useLanguage();
  const router = useRouter();
  const [directory, setDirectory] = useState<ClinicDirectoryPayload | null>(directoryProp ?? null);

  const readiness = flags?.readinessPercent ?? 0;
  const show = readiness >= 45;

  useEffect(() => {
    if (directoryProp) setDirectory(directoryProp);
  }, [directoryProp]);

  useEffect(() => {
    if (!show || directoryProp) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchClinicDirectory({
          city: countryHint || undefined,
          query: countryHint || undefined,
          limit: 6,
        });
        if (!cancelled) setDirectory(data);
      } catch {
        if (!cancelled) setDirectory(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [show, countryHint, directoryProp]);

  if (!show || !directory?.clinics?.length) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("treatmentGuide.clinicNetwork.title")}</Text>
      <Text style={styles.hint}>{t("treatmentGuide.clinicNetwork.hint")}</Text>
      {directory.cities.slice(0, 4).map((line) => (
        <Text key={line} style={styles.cityLine}>
          • {line}
        </Text>
      ))}
      {directory.clinics.slice(0, 3).map((c) => (
        <Text key={c.id} style={styles.clinicLine}>
          {c.name}
          {c.city || c.country ? ` — ${[c.city, c.country].filter(Boolean).join(", ")}` : ""}
        </Text>
      ))}
      <TouchableOpacity
        style={styles.linkBtn}
        onPress={() => router.push("/clinic-onboarding" as never)}
        activeOpacity={0.88}
      >
        <Text style={styles.linkText}>{t("treatmentGuide.clinicNetwork.browse")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#f0f9ff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  title: { fontSize: 15, fontWeight: "800", color: "#0f172a", marginBottom: 4 },
  hint: { fontSize: 12, color: "#64748b", lineHeight: 17, marginBottom: 10 },
  cityLine: { fontSize: 13, color: "#334155", lineHeight: 18, marginBottom: 2 },
  clinicLine: { fontSize: 12, color: "#475569", marginTop: 4 },
  linkBtn: { marginTop: 10, alignSelf: "flex-start" },
  linkText: { fontSize: 13, fontWeight: "700", color: "#2563eb" },
});
