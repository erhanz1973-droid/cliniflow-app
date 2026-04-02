import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "../../lib/language-context";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, Language } from "../../lib/i18n";

export const ROLE_KEY = "userRole";

type Role = "doctor" | "patient";

export default function RoleSelectScreen() {
  const router = useRouter();
  const { t, currentLanguage, setLanguage } = useLanguage();
  const [saving, setSaving] = useState(false);

  const pickRole = async (role: Role) => {
    if (saving) return;
    setSaving(true);
    try {
      await AsyncStorage.setItem(ROLE_KEY, role);
    } catch {
      /* ignore storage failures, navigate anyway */
    }
    if (role === "doctor") {
      router.replace("/login/doctor");
    } else {
      router.replace("/login/patient");
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#f8faff"
        translucent={false}
      />

      {/* Language bar */}
      <View style={styles.langBar}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <Pressable
            key={lang}
            onPress={() => setLanguage(lang as Language)}
            style={[
              styles.langBtn,
              currentLanguage === lang && styles.langBtnActive,
            ]}
          >
            <Text
              style={[
                styles.langText,
                currentLanguage === lang && styles.langTextActive,
              ]}
            >
              {LANGUAGE_NAMES[lang as Language]}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.logoBubble}>
          <Text style={styles.logoMark}>CF</Text>
        </View>
        <Text style={styles.appName}>CliniFlow</Text>
        <Text style={styles.subtitle}>{t("onboarding.subtitle")}</Text>
      </View>

      {/* Role cards */}
      <View style={styles.cards}>
        {/* Doctor */}
        <Pressable
          style={({ pressed }) => [
            styles.card,
            styles.cardDoctor,
            pressed && styles.cardPressed,
            saving && styles.cardDisabled,
          ]}
          onPress={() => pickRole("doctor")}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.doctorTitle")}
        >
          <View style={[styles.iconWrap, styles.iconWrapDoctor]}>
            <Text style={styles.iconEmoji}>👨‍⚕️</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, styles.cardTitleDoctor]}>
              {t("onboarding.doctorTitle")}
            </Text>
            <Text style={styles.cardDesc}>{t("onboarding.doctorDesc")}</Text>
          </View>
          <View style={[styles.arrow, styles.arrowDoctor]}>
            <Text style={[styles.arrowText, { color: "#2563eb" }]}>›</Text>
          </View>
        </Pressable>

        {/* Patient */}
        <Pressable
          style={({ pressed }) => [
            styles.card,
            styles.cardPatient,
            pressed && styles.cardPressed,
            saving && styles.cardDisabled,
          ]}
          onPress={() => pickRole("patient")}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={t("onboarding.patientTitle")}
        >
          <View style={[styles.iconWrap, styles.iconWrapPatient]}>
            <Text style={styles.iconEmoji}>🧑</Text>
          </View>
          <View style={styles.cardContent}>
            <Text style={[styles.cardTitle, styles.cardTitlePatient]}>
              {t("onboarding.patientTitle")}
            </Text>
            <Text style={styles.cardDesc}>{t("onboarding.patientDesc")}</Text>
          </View>
          <View style={[styles.arrow, styles.arrowPatient]}>
            <Text style={[styles.arrowText, { color: "#0891b2" }]}>›</Text>
          </View>
        </Pressable>
      </View>

      {/* Loading overlay */}
      {saving && (
        <View style={styles.overlay}>
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
    flexWrap: "wrap",
    gap: 6,
    paddingTop: Platform.OS === "android" ? 12 : 10,
    paddingHorizontal: 16,
  },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
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
    paddingTop: 36,
    paddingBottom: 32,
    paddingHorizontal: 24,
  },
  logoBubble: {
    width: 70,
    height: 70,
    borderRadius: 22,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  logoMark: {
    fontSize: 20,
    color: "#fff",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  appName: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    letterSpacing: -0.5,
    marginBottom: 6,
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
    justifyContent: "center",
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 2,
    borderColor: "transparent",
  },
  cardDoctor: {
    borderColor: "#dbeafe",
  },
  cardPatient: {
    borderColor: "#cffafe",
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  cardDisabled: {
    opacity: 0.6,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 16,
    flexShrink: 0,
  },
  iconWrapDoctor: {
    backgroundColor: "#eff6ff",
  },
  iconWrapPatient: {
    backgroundColor: "#ecfeff",
  },
  iconEmoji: {
    fontSize: 30,
  },
  cardContent: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  cardTitleDoctor: {
    color: "#1d4ed8",
  },
  cardTitlePatient: {
    color: "#0e7490",
  },
  cardDesc: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 18,
  },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
    flexShrink: 0,
  },
  arrowDoctor: {
    backgroundColor: "#eff6ff",
  },
  arrowPatient: {
    backgroundColor: "#ecfeff",
  },
  arrowText: {
    fontSize: 22,
    fontWeight: "700",
    marginTop: -2,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(248,250,255,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
});
