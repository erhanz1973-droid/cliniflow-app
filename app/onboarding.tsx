// app/onboarding.tsx
import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

function OptionCard({
  icon,
  title,
  subtitle,
  cta,
  onPress,
}: {
  icon: string;
  title: string;
  subtitle: string;
  cta: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardIcon}>{icon}</Text>

      <Text style={styles.cardTitle}>{title}</Text>
      <Text style={styles.cardSub}>{subtitle}</Text>

      <Pressable style={styles.cardBtn} onPress={onPress}>
        <Text style={styles.cardBtnText}>{cta}</Text>
      </Pressable>
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();

  return (
    <View style={styles.page}>
      <View style={styles.wrap}>
        <Text style={styles.head}>How would you like{"\n"}to continue?</Text>

        <OptionCard
          icon="🏥"
          title="Clinic gave me a code"
          subtitle="I already have access"
          cta="Continue with Code"
          onPress={() => router.push("/access")}
        />

        <OptionCard
          icon="🔍"
          title="I don't have a clinic"
          subtitle="I want to explore clinics"
          cta="Find Clinics"
          onPress={() => router.push("/clinics")}
        />

        <OptionCard
          icon="ℹ️"
          title="Just exploring"
          subtitle="Learn how it works"
          cta="View Demo"
          onPress={() => router.push("/demo")}
        />

        <Pressable onPress={() => router.back()} style={{ marginTop: 14 }} hitSlop={10}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    padding: 16,
    justifyContent: "center",
  },
  wrap: {
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  head: {
    fontSize: 22,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 12,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    marginBottom: 12,
  },
  cardIcon: { fontSize: 26, marginBottom: 6 },
  cardTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },
  cardSub: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "700",
    color: "rgba(0,0,0,0.55)",
  },
  cardBtn: {
    marginTop: 12,
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  cardBtnText: { color: "white", fontWeight: "900" },
  back: {
    fontWeight: "900",
    color: "rgba(0,0,0,0.65)",
  },
});
