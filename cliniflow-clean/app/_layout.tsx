import { useEffect, type ReactNode } from "react";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider } from "../lib/auth";
import { LanguageProvider, useLanguage } from "../lib/language-context";
import { Stack } from "expo-router";
import { View, Text, ActivityIndicator } from "react-native";

function LanguageReadyGate({ children }: { children: ReactNode }) {
  const { isLoading } = useLanguage();
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8faff" }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }
  return <>{children}</>;
}

function RootLayoutInner() {
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        await SplashScreen.preventAutoHideAsync();
      } catch {
        /* already prevented or unsupported */
      }
      if (cancelled) return;
      try {
        await SplashScreen.hideAsync();
      } catch {
        /* no native splash for this VC — ignore */
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);
  return <Stack screenOptions={{ headerShown: false }} />;
}

export default function RootLayout() {
  return (
    <LanguageProvider>
      <LanguageReadyGate>
        <AuthProvider>
          <RootLayoutInner />
        </AuthProvider>
      </LanguageReadyGate>
    </LanguageProvider>
  );
}

export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "#fff" }}>
      <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>Runtime Error</Text>
      <Text selectable style={{ color: "#b91c1c", textAlign: "center" }}>{error?.message || "Unknown error"}</Text>
    </View>
  );
}
