import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { API_BASE, apiGet } from "../lib/api";

export default function DebugApiScreen() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [testResult, setTestResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 🔐 DEV + ADMIN GUARD
  useEffect(() => {
    if (authLoading) return;

    if (!__DEV__ || !user || user.role !== "ADMIN") {
      router.replace("/");
    }
  }, [user, authLoading]);

  const testConnection = async () => {
    setLoading(true);
    setTestResult(null);
    try {
      const result = await apiGet<{
        ok: boolean;
        server?: string;
        time?: number;
      }>("/health");

      setTestResult(
        `✅ Başarılı!\n\n${JSON.stringify(result, null, 2)}`
      );
    } catch (error: any) {
      setTestResult(
        `❌ Hata:\n\n${error?.message || String(error)}`
      );
    } finally {
      setLoading(false);
    }
  };

  // Expo Constants – güvenli okuma
  const anyConstants: any = Constants as any;
  const debuggerHost =
    anyConstants?.expoConfig?.hostUri ||
    anyConstants?.manifest?.debuggerHost ||
    anyConstants?.manifest2?.extra?.expoClient?.debuggerHost ||
    anyConstants?.manifest2?.extra?.expoGo?.debuggerHost ||
    "Bulunamadı";

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>🔧 API Debug</Text>

        <Info label="Platform" value={Platform.OS} />
        <Info label="API_BASE" value={API_BASE} mono />
        <Info label="Debugger Host" value={String(debuggerHost)} mono />
        <Info
          label="Environment"
          value={__DEV__ ? "Development" : "Production"}
        />
        <Info
          label="EXPO_PUBLIC_API_BASE"
          value={
            process.env.EXPO_PUBLIC_API_BASE || "(Ayarlanmamış)"
          }
          mono
        />

        <Info
          label="Android Emulator Default"
          value="http://10.0.2.2:3000"
          mono
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={testConnection}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>
              Health Endpoint Test Et
            </Text>
          )}
        </Pressable>

        {testResult && (
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>{testResult}</Text>
          </View>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ Notlar</Text>
          <Text style={styles.infoText}>
            • Bu ekran sadece DEV + ADMIN içindir.
          </Text>
          <Text style={styles.infoText}>
            • Production build’de görünmez.
          </Text>
          <Text style={styles.infoText}>
            • API_BASE yanlışsa ilk buraya bak.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function Info({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[
          styles.value,
          mono && styles.mono,
        ]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F5F5" },
  content: { padding: 20 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 24,
  },
  section: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: 4,
    textTransform: "uppercase",
  },
  value: {
    fontSize: 16,
    color: "#111827",
  },
  mono: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  button: {
    backgroundColor: "#2563EB",
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  buttonText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "700",
    fontSize: 16,
  },
  resultBox: {
    backgroundColor: "#F9FAFB",
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  resultText: {
    fontSize: 14,
    color: "#111827",
    fontFamily:
      Platform.OS === "ios" ? "Courier" : "monospace",
  },
  infoBox: {
    backgroundColor: "#EFF6FF",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E40AF",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#1E3A8A",
    marginBottom: 8,
    lineHeight: 20,
  },
});
