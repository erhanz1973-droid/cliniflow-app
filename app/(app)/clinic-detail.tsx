import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLanguage } from "../../lib/language-context";
import { useClinicStore } from "../../store/useClinicStore";
import { formatCountryDisplay } from "../../lib/countryDisplay";

/** Placeholder — future: clinic profile + multi-clinic switcher. */
export default function ClinicDetailScreen() {
  const { t } = useLanguage();
  const router = useRouter();
  const { activeClinic } = useClinicStore();

  return (
      <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={12}>
          <Text style={styles.backText}>← {t("common.back")}</Text>
        </Pressable>
        <View style={styles.card}>
          <Text style={styles.title}>{activeClinic?.name || t("home.clinicHeader.detailPlaceholder")}</Text>
          {activeClinic?.country ? (
            <Text style={styles.meta}>{formatCountryDisplay(activeClinic.country)}</Text>
          ) : null}
          <Text style={styles.hint}>{t("home.clinicHeader.detailHint")}</Text>
        </View>
      </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB", padding: 16 },
  back: { marginBottom: 16 },
  backText: { fontSize: 16, color: "#2563EB", fontWeight: "700" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  title: { fontSize: 22, fontWeight: "800", color: "#111827" },
  meta: { marginTop: 8, fontSize: 15, color: "#6B7280" },
  hint: { marginTop: 20, fontSize: 14, color: "#9CA3AF", lineHeight: 20 },
});
