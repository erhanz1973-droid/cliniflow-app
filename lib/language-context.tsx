import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Language, SUPPORTED_LANGUAGES, translations, STORAGE_KEY } from './i18n';

type LanguageContextType = {
  currentLanguage: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: string, params?: Record<string, string | number>) => string;
  isLoading: boolean;
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [currentLanguage, setCurrentLanguageState] = useState<Language>('tr');
  const [isLoading, setIsLoading] = useState(true);

  // Initialize language on mount
  useEffect(() => {
    const initLanguage = async () => {
      try {
        setIsLoading(true);
        console.log('[LanguageContext] Starting initialization...');
        
        // Try to get saved language
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        const lang = (saved && SUPPORTED_LANGUAGES.includes(saved as Language)) 
          ? saved as Language 
          : 'tr';
        
        setCurrentLanguageState(lang);
        console.log('[LanguageContext] Initialized with language:', lang);
      } catch (error) {
        console.error('[LanguageContext] Init error:', error);
        setCurrentLanguageState('tr');
      } finally {
        setIsLoading(false);
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
      setCurrentLanguageState(lang);
      console.log('[LanguageContext] Language changed to:', lang);
    } catch (error) {
      console.error('[LanguageContext] Set language error:', error);
      throw error;
    }
  };

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      // DEBUG: Disable Turkish fallback to see missing translations
      const translation = translations[currentLanguage]?.[key] || key;
      
      if (params) {
        return translation.replace(/\{(\w+)\}/g, (match: string, paramKey: string) => {
          return params[paramKey]?.toString() || match;
        });
      }
      
      return translation;
    },
    [currentLanguage, translations]
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
