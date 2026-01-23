import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { API_BASE, apiGet } from "../lib/api";

export default function DebugApiScreen() {
  const [testResult, setTestResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const testConnection = async () => {
    setLoading(true);
    setTestResult(null);
    try {
      const result = await apiGet<{ ok: boolean; server: string; time: number }>("/health");
      setTestResult(`✅ Başarılı!\n\n${JSON.stringify(result, null, 2)}`);
    } catch (error: any) {
      setTestResult(`❌ Hata:\n\n${error.message || String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  // Expo Constants bilgilerini al
  const anyConstants: any = Constants as any;
  const debuggerHost =
    anyConstants?.expoConfig?.hostUri ||
    anyConstants?.manifest?.debuggerHost ||
    anyConstants?.manifest2?.extra?.expoClient?.debuggerHost ||
    anyConstants?.manifest2?.extra?.expoGo?.debuggerHost ||
    "Bulunamadı";

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>🔧 API Debug Bilgileri</Text>

        <View style={styles.section}>
          <Text style={styles.label}>Platform:</Text>
          <Text style={styles.value}>{Platform.OS}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>API_BASE:</Text>
          <Text style={styles.value} selectable>
            {API_BASE}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Debugger Host:</Text>
          <Text style={styles.value} selectable>
            {String(debuggerHost)}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Environment:</Text>
          <Text style={styles.value}>
            {__DEV__ ? "Development" : "Production"}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>EXPO_PUBLIC_API_BASE:</Text>
          <Text style={styles.value}>
            {process.env.EXPO_PUBLIC_API_BASE || "(Ayarlanmamış)"}
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Beklenen URL (Android Emülatör):</Text>
          <Text style={styles.value} selectable>
            http://10.0.2.2:5050
          </Text>
        </View>

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={testConnection}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? "Test Ediliyor..." : "Health Endpoint Test Et"}
          </Text>
        </Pressable>

        {testResult && (
          <View style={styles.resultBox}>
            <Text style={styles.resultText}>{testResult}</Text>
          </View>
        )}

        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>ℹ️ Bilgi:</Text>
          <Text style={styles.infoText}>
            • Android emülatörde API_BASE otomatik olarak{" "}
            <Text style={styles.code}>http://10.0.2.2:5050</Text> olarak
            ayarlanır.
          </Text>
          <Text style={styles.infoText}>
            • Fiziksel cihazda Mac'inizin IP adresini kullanmanız gerekir.
          </Text>
          <Text style={styles.infoText}>
            • Manuel ayarlamak için{" "}
            <Text style={styles.code}>EXPO_PUBLIC_API_BASE</Text> environment
            variable'ını kullanın.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  content: {
    padding: 20,
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
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
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
  code: {
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
