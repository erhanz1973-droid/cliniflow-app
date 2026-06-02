import { StyleSheet, Text, View } from "react-native";

import { useLanguage } from "@/lib/language-context";

type Props = {
  compact?: boolean;
};

export function ExternalLinkWarning({ compact }: Props) {
  const { t } = useLanguage();
  const title =
    t("doctor.security.externalLinkTitle") !== "doctor.security.externalLinkTitle"
      ? t("doctor.security.externalLinkTitle")
      : "Harici bağlantı";
  const body =
    t("doctor.security.externalLinkWarning") !== "doctor.security.externalLinkWarning"
      ? t("doctor.security.externalLinkWarning")
      : "Hasta harici bağlantı gönderdi. Virüs veya dolandırıcılık riski olabilir — bağlantıyı açmayın.";

  if (compact) {
    return (
      <View style={styles.compact} accessibilityRole="alert">
        <Text style={styles.compactText}>⚠️ {body}</Text>
      </View>
    );
  }

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.title}>⚠️ {title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginTop: 6,
    marginBottom: 4,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fdba74",
  },
  title: { fontSize: 12, fontWeight: "800", color: "#9a3412", marginBottom: 4 },
  body: { fontSize: 12, lineHeight: 17, color: "#7c2d12", fontWeight: "600" },
  compact: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  compactText: { fontSize: 11, lineHeight: 15, color: "#9a3412", fontWeight: "700" },
});
