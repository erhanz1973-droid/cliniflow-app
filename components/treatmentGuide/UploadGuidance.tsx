import React, { useMemo } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useLanguage } from "../../lib/language-context";
import { buildUploadGuidanceLines } from "../../lib/treatmentGuide/uploadGuidance";
import type { OperationalIntakeFlags } from "../../lib/treatmentGuide/types";

type Props = {
  flags: OperationalIntakeFlags | null;
  onOpenFiles: () => void;
};

export function UploadGuidance({ flags, onOpenFiles }: Props) {
  const { t } = useLanguage();
  const lines = useMemo(() => buildUploadGuidanceLines(flags), [flags]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("treatmentGuide.section.uploads")}</Text>
      <Text style={styles.hint}>{t("treatmentGuide.section.uploadsHint")}</Text>
      {lines.map((line) => (
        <View key={line.key} style={styles.line}>
          <Text style={styles.bullet}>•</Text>
          <View style={styles.lineBody}>
            <Text style={styles.lineText}>{t(line.key)}</Text>
            {line.hint ? <Text style={styles.lineSub}>{t(line.hint)}</Text> : null}
          </View>
        </View>
      ))}
      <TouchableOpacity style={styles.btn} onPress={onOpenFiles} activeOpacity={0.88}>
        <Text style={styles.btnText}>{t("treatmentGuide.openFiles")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0f172a", marginBottom: 6 },
  hint: { fontSize: 13, color: "#64748b", lineHeight: 19, marginBottom: 12 },
  line: { flexDirection: "row", gap: 8, marginBottom: 10 },
  bullet: { fontSize: 14, color: "#2563eb", fontWeight: "700" },
  lineBody: { flex: 1 },
  lineText: { fontSize: 14, color: "#334155", lineHeight: 20, fontWeight: "600" },
  lineSub: { fontSize: 12, color: "#64748b", marginTop: 2, lineHeight: 17 },
  btn: {
    marginTop: 6,
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  btnText: { color: "#334155", fontSize: 15, fontWeight: "600" },
});
