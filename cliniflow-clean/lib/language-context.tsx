import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import {
  Language,
  SUPPORTED_LANGUAGES,
  translations,
  STORAGE_KEY,
  LEGACY_STORAGE_KEY,
  DEFAULT_APP_LANGUAGE,
  APP_LANG_VERSION,
  LANGUAGE_VERSION_KEY,
  i18n,
} from './i18n';

type LanguageContextType = {
  currentLanguage: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
  isLoading: boolean;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [currentLanguage, setCurrentLanguageState] = useState<Language>(DEFAULT_APP_LANGUAGE);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize language on mount
  useEffect(() => {
    const initLanguage = async () => {
      try {
        setIsLoading(true);
        if (__DEV__) console.log('[LanguageContext] Starting initialization...');

        const loggedStoredLang = await AsyncStorage.getItem(STORAGE_KEY);
        if (__DEV__) console.log('[LanguageContext] AsyncStorage.getItem("' + STORAGE_KEY + '"):', loggedStoredLang);

        let raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) {
          raw = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
        }

        const storedVersion = await AsyncStorage.getItem(LANGUAGE_VERSION_KEY);

        /** v3 migration: if version mismatch, reset persisted `tr` to English once; keep `en` | `ru` | `ka`. */
        let lang: Language;
        if (storedVersion !== APP_LANG_VERSION) {
          lang = DEFAULT_APP_LANGUAGE;
          if (raw && SUPPORTED_LANGUAGES.includes(raw as Language)) {
            const r = raw as Language;
            if (r === "tr") {
              if (__DEV__) console.log("FORCING EN RESET:", { raw, storedVersion });
              lang = DEFAULT_APP_LANGUAGE;
            } else {
              lang = r;
            }
          }
          await AsyncStorage.setItem(STORAGE_KEY, lang);
          await AsyncStorage.setItem(LEGACY_STORAGE_KEY, lang);
          await AsyncStorage.setItem(LANGUAGE_VERSION_KEY, APP_LANG_VERSION);
          if (__DEV__) {
            console.warn("[LanguageContext] language persistence migration", {
              fromVersion: storedVersion ?? "(none)",
              to: APP_LANG_VERSION,
              lang,
              droppedPreviousStored: raw ?? null,
            });
          }
        } else {
          lang =
            raw && SUPPORTED_LANGUAGES.includes(raw as Language)
              ? (raw as Language)
              : DEFAULT_APP_LANGUAGE;
          await AsyncStorage.setItem(STORAGE_KEY, lang);
          await AsyncStorage.setItem(LEGACY_STORAGE_KEY, lang);
          if (__DEV__)
            console.log("[LanguageContext] language_version matches", APP_LANG_VERSION, "stored lang:", lang);
        }

        i18n.locale = lang;
        setCurrentLanguageState(lang);

        const locales = Localization.getLocales();
        const primary = locales[0];
        const deviceLang = primary?.languageCode ?? '';
        if (__DEV__) {
          console.log(
            '[LanguageContext] device languageTag:',
            primary?.languageTag,
            'languageCode:',
            deviceLang,
          );
          console.log('ACTIVE LANG:', i18n.locale);
          console.log('[LanguageContext] Initialized with language:', lang);
        }
      } catch (error) {
        console.error('[LanguageContext] Init error:', error);
        i18n.locale = DEFAULT_APP_LANGUAGE;
        setCurrentLanguageState(DEFAULT_APP_LANGUAGE);
      } finally {
        setIsLoading(false);
        if (__DEV__)
          console.log('[LanguageContext] Initialization complete, isLoading:', false);
      }
    };

    initLanguage();
  }, []);

  const setLanguage = async (lang: Language) => {
    if (!SUPPORTED_LANGUAGES.includes(lang)) {
      throw new Error(`Unsupported language: ${lang}`);
    }

    try {
      await AsyncStorage.setItem(STORAGE_KEY, lang);
      await AsyncStorage.setItem(LEGACY_STORAGE_KEY, lang);
      await AsyncStorage.setItem(LANGUAGE_VERSION_KEY, APP_LANG_VERSION);
      i18n.locale = lang;
      setCurrentLanguageState(lang);
      if (__DEV__) {
        console.log('ACTIVE LANG:', i18n.locale);
        console.log('[LanguageContext] Language changed to:', lang);
      }
    } catch (error) {
      console.error('[LanguageContext] Set language error:', error);
      throw error;
    }
  };

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const fromCurrent = translations[currentLanguage]?.[key];
      const fromEn = translations.en?.[key];
      const fromTr = translations.tr?.[key];
      const translation = fromCurrent || fromEn || fromTr || "";

      if (params) {
        return translation.replace(/\{(\w+)\}/g, (match: string, paramKey: string) => {
          return params[paramKey]?.toString() || match;
        });
      }

      return translation;
    },
    [currentLanguage]
  );

  const value: LanguageContextType = {
    currentLanguage,
    setLanguage,
    t,
    isLoading,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
