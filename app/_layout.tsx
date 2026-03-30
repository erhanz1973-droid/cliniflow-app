import { useEffect } from "react";
import * as SplashScreen from "expo-splash-screen";
import { AuthProvider } from "../lib/auth";
import { LanguageProvider } from "../lib/language-context";
import { Stack } from "expo-router";
import { View, Text } from "react-native";

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
      <AuthProvider>
        <RootLayoutInner />
      </AuthProvider>
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
