import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { Ionicons } from "@expo/vector-icons";
import {
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  type Language,
} from "../lib/i18n";
import { useLanguage } from "../lib/language-context";

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { currentLanguage, setLanguage, t, isLoading } = useLanguage();
  const [loading, setLoading] = useState(false);

  const handleLanguageChange = async (lang: Language) => {
    try {
      setLoading(true);
      await setLanguage(lang);
      Alert.alert(t("common.success"), t("settings.languageChanged"));
      // Force app refresh to apply language change
      setTimeout(() => {
        router.replace('/home');
      }, 500);
    } catch (error) {
      console.error("[SETTINGS] Language change error:", error);
      Alert.alert(t("common.error"), t("settings.languageChangeError"));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert(
      t("settings.logout"),
      t("settings.logoutConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("settings.logout"),
          style: "destructive",
          onPress: async () => {
            await signOut();
            setTimeout(() => {
              router.replace("/login");
            }, 100);
          },
        },
      ]
    );
  };

  // Don't render until language is loaded
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t("settings.title")}</Text>

      {/* Language Selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("settings.language")}</Text>
        <Text style={styles.sectionDescription}>
          {t("settings.selectLanguage")}
        </Text>

        <View style={styles.languageList}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <Pressable
              key={lang}
              onPress={() => handleLanguageChange(lang)}
              disabled={loading}
              style={[
                styles.languageItem,
                currentLanguage === lang && styles.languageItemActive,
              ]}
            >
              <Text
                style={[
                  styles.languageText,
                  currentLanguage === lang && styles.languageTextActive,
                ]}
              >
                {LANGUAGE_NAMES[lang]}
              </Text>
              {currentLanguage === lang && (
                <Ionicons name="checkmark-circle" size={24} color="#2563EB" />
              )}
            </Pressable>
          ))}
        </View>
      </View>

      {/* Logout */}
      <View style={styles.section}>
        <Pressable onPress={handleLogout} style={styles.logoutButton}>
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
          <Text style={styles.logoutText}>{t("settings.logout")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 24,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 16,
  },
  languageList: {
    gap: 8,
  },
  languageItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  languageItemActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  languageText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  languageTextActive: {
    color: "#2563EB",
    fontWeight: "700",
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#DC2626",
    backgroundColor: "#FFFFFF",
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#DC2626",
  },
});
