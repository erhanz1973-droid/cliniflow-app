import React, { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";

const KEY_PATIENT_ID = "CLINIFLOW_PATIENT_ID";

export default function AccessScreen() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const clean = useMemo(() => code.trim(), [code]);

  async function submit() {
    if (!clean) {
      Alert.alert("Kod gerekli", "Lütfen clinic’in verdiği kodu gir.");
      return;
    }

    // Şimdilik: code = patientId (örn: p2)
    setLoading(true);
    try {
      await SecureStore.setItemAsync(KEY_PATIENT_ID, clean);
      router.replace(`/treatments?patientId=${encodeURIComponent(clean)}`);
    } catch (e: any) {
      Alert.alert("Hata", e?.message || "Kaydetme hatası");
    } finally {
      setLoading(false);
    }
  }

  async function clearSaved() {
    setLoading(true);
    try {
      await SecureStore.deleteItemAsync(KEY_PATIENT_ID);
      Alert.alert("Silindi", "Kayıtlı access kodu silindi.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 22, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 26, fontWeight: "800" }}>Cliniflow</Text>
      <Text style={{ opacity: 0.75 }}>
        Kliniğin sana verdiği kodu gir. (Şimdilik bu kod hasta ID gibi çalışıyor: ör. p2)
      </Text>

      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="Access code (örn: p2)"
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          borderWidth: 1,
          borderColor: "#bbb",
          borderRadius: 12,
          padding: 14,
          fontSize: 16,
        }}
      />

      <Pressable
        onPress={submit}
        disabled={loading}
        style={{
          padding: 14,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#888",
          alignItems: "center",
          opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? <ActivityIndicator /> : <Text style={{ fontWeight: "800" }}>Giriş</Text>}
      </Pressable>

      <Pressable
        onPress={clearSaved}
        disabled={loading}
        style={{
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#aaa",
          alignItems: "center",
          opacity: loading ? 0.6 : 0.9,
        }}
      >
        <Text>Kayıtlı kodu sil (Logout)</Text>
      </Pressable>
    </View>
  );
}
