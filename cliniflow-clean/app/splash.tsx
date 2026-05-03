import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";

export default function SplashScreen() {
  const router = useRouter();

  return (
    <View style={styles.page}>
      <View style={styles.card}>
        <Text style={styles.logo}>CLINIFLOW</Text>
        <Text style={styles.head}>Welcome</Text>

        <Pressable style={styles.btn} onPress={() => router.push("/onboarding")}>
          <Text style={styles.btnText}>Continue</Text>
        </Pressable>

        <Pressable style={{ marginTop: 14 }} onPress={() => router.push("/access")}>
          <Text style={styles.link}>I already have an Access Code</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", padding: 16 },
  card: { width: "100%", maxWidth: 420, backgroundColor: "white", borderRadius: 18, padding: 18, borderWidth: 1, borderColor: "rgba(0,0,0,0.10)" },
  logo: { textAlign: "center", fontWeight: "900", letterSpacing: 1.2, color: "rgba(0,0,0,0.6)" },
  head: { marginTop: 10, textAlign: "center", fontSize: 24, fontWeight: "900", color: "#111827" },
  btn: { marginTop: 18, backgroundColor: "#111827", paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  btnText: { color: "white", fontWeight: "900", fontSize: 15 },
  link: { textAlign: "center", color: "rgba(0,0,0,0.62)", fontWeight: "800", textDecorationLine: "underline" }
});
