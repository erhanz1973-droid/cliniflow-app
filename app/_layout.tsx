import { useEffect } from "react";
import { Stack } from "expo-router";
import { View, Text } from "react-native";
import { logLaunchPhaseOnce } from "../lib/launchAudit";
import { markStartupOnce } from "../lib/startupPerf";

logLaunchPhaseOnce("App Launch");
markStartupOnce("root_layout_eval");

/** Root navigator only — providers live in `app/(app)/_layout.tsx` + `Slot`. Push handler installs lazily on first register. */
export default function RootLayout() {
  useEffect(() => {
    logLaunchPhaseOnce("Root Layout Mounted");
  }, []);

  return <Stack screenOptions={{ headerShown: false }} />;
}

export function ErrorBoundary({ error }: { error: Error }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20, backgroundColor: "#fff" }}>
      <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>Runtime Error</Text>
      <Text selectable style={{ color: "#b91c1c", textAlign: "center" }}>{error?.message || "Unknown error"}</Text>
    </View>
  );
}
