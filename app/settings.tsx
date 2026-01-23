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
  getLanguage,
  setLanguage,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  type Language,
  initI18n,
  t,
} from "../lib/i18n";

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [currentLang, setCurrentLang] = useState<Language>(getLanguage());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCurrentLang(getLanguage());
  }, []);

  const handleLanguageChange = async (lang: Language) => {
    try {
      setLoading(true);
      await setLanguage(lang);
      setCurrentLang(lang);
      // Re-initialize to update translations
      await initI18n();
      Alert.alert(t("common.success"), t("settings.languageChanged"));
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

  // Ensure i18n is initialized
  useEffect(() => {
    const init = async () => {
      try {
        await initI18n();
        setCurrentLang(getLanguage());
        console.log("[SETTINGS] i18n initialized, current language:", getLanguage());
        console.log("[SETTINGS] Supported languages:", SUPPORTED_LANGUAGES);
      } catch (error) {
        console.error("[SETTINGS] i18n init error:", error);
      }
    };
    init();
  }, []);

  // Hardcoded languages for testing
  const languages: Language[] = ["tr", "en"];
  const languageNames: Record<Language, string> = LANGUAGE_NAMES;

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
          {languages.map((lang) => (
            <Pressable
              key={lang}
              onPress={() => handleLanguageChange(lang)}
              disabled={loading}
              style={[
                styles.languageItem,
                currentLang === lang && styles.languageItemActive,
              ]}
            >
              <Text
                style={[
                  styles.languageText,
                  currentLang === lang && styles.languageTextActive,
                ]}
              >
                {languageNames[lang]}
              </Text>
              {currentLang === lang && (
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
