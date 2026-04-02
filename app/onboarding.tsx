import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "../lib/language-context";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, Language } from "../lib/i18n";

export const ROLE_STORAGE_KEY = "@cliniflow:userRole";

export default function OnboardingScreen() {
  const router = useRouter();
  const { t, currentLanguage, setLanguage } = useLanguage();
  const [saving, setSaving] = useState(false);

  const pickRole = async (role: "doctor" | "patient") => {
    if (saving) return;
    setSaving(true);
    try {
      await AsyncStorage.setItem(ROLE_STORAGE_KEY, role);
    } catch {
      /* ignore storage failures, still navigate */
    }
    if (role === "doctor") {
      router.replace("/login/doctor");
    } else {
      router.replace("/login/patient");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8faff" />

      {/* Language selector */}
      <View style={styles.langBar}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <Pressable
            key={lang}
            onPress={() => setLanguage(lang as Language)}
            style={[styles.langBtn, currentLanguage === lang && styles.langBtnActive]}
          >
            <Text style={[styles.langText, currentLanguage === lang && styles.langTextActive]}>
              {LANGUAGE_NAMES[lang as Language]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoBubble}>
          <Text style={styles.logoMark}>✚</Text>
        </View>
        <Text style={styles.appName}>CliniFlow</Text>
        <Text style={styles.subtitle}>{t("onboarding.subtitle")}</Text>
      </View>

      {/* Role cards */}
      <View style={styles.cards}>
        {/* Doctor card */}
        <Pressable
          style={({ pressed }) => [styles.card, styles.cardDoctor, pressed && styles.cardPressed]}
          onPress={() => pickRole("doctor")}
          disabled={saving}
        >
          <View style={[styles.iconWrap, styles.iconWrapDoctor]}>
            <Text style={styles.iconEmoji}>🩺</Text>
          </View>
          <Text style={[styles.cardTitle, styles.cardTitleDoctor]}>
            {t("onboarding.doctorTitle")}
          </Text>
          <Text style={styles.cardDesc}>{t("onboarding.doctorDesc")}</Text>
          <View style={[styles.cardArrow, styles.cardArrowDoctor]}>
            <Text style={[styles.cardArrowText, { color: "#2563eb" }]}>→</Text>
          </View>
        </Pressable>

        {/* Patient card */}
        <Pressable
          style={({ pressed }) => [styles.card, styles.cardPatient, pressed && styles.cardPressed]}
          onPress={() => pickRole("patient")}
          disabled={saving}
        >
          <View style={[styles.iconWrap, styles.iconWrapPatient]}>
            <Text style={styles.iconEmoji}>🧑‍⚕️</Text>
          </View>
          <Text style={[styles.cardTitle, styles.cardTitlePatient]}>
            {t("onboarding.patientTitle")}
          </Text>
          <Text style={styles.cardDesc}>{t("onboarding.patientDesc")}</Text>
          <View style={[styles.cardArrow, styles.cardArrowPatient]}>
            <Text style={[styles.cardArrowText, { color: "#0891b2" }]}>→</Text>
          </View>
        </Pressable>
      </View>

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#f8faff",
  },
  langBar: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingTop: 14,
    paddingHorizontal: 16,
  },
  langBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#fff",
  },
  langBtnActive: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  langText: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  langTextActive: {
    color: "#fff",
    fontWeight: "700",
  },
  header: {
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 36,
    paddingHorizontal: 24,
  },
  logoBubble: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  logoMark: {
    fontSize: 32,
    color: "#fff",
    fontWeight: "700",
  },
  appName: {
    fontSize: 30,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 22,
  },
  cards: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 16,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
  },
  cardDoctor: {
    borderColor: "#dbeafe",
  },
  cardPatient: {
    borderColor: "#cffafe",
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.98 }],
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  iconWrapDoctor: {
    backgroundColor: "#eff6ff",
  },
  iconWrapPatient: {
    backgroundColor: "#ecfeff",
  },
  iconEmoji: {
    fontSize: 28,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  cardTitleDoctor: {
    color: "#1d4ed8",
  },
  cardTitlePatient: {
    color: "#0e7490",
  },
  cardDesc: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
    paddingRight: 32,
  },
  cardArrow: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cardArrowDoctor: {
    backgroundColor: "#eff6ff",
  },
  cardArrowPatient: {
    backgroundColor: "#ecfeff",
  },
  cardArrowText: {
    fontSize: 18,
    fontWeight: "700",
  },
  savingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
});
