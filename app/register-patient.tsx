// app/register-patient.tsx
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";

export default function RegisterPatientScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    clinicCode: "",
    phone: "",
    patientName: "",
    email: "",
  });

  const handleRegister = async () => {
    if (!formData.clinicCode || !formData.phone || !formData.patientName) {
      Alert.alert("Hata", "Tüm alanları doldurun");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/register/patient`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...formData,
          userType: "PATIENT",
        }),
      });

      const data = await response.json();

      if (data.ok) {
        Alert.alert(
          "Başarılı",
          "Hasta kaydınız tamamlandı.",
          [
            {
              text: "Tamam",
              onPress: () => {
                // Save token and navigate
                signIn(data);
                router.replace("/(tabs)/home");
              },
            },
          ]
        );
      } else {
        Alert.alert("Hata", data.error || "Kayıt başarısız");
      }
    } catch (error) {
      Alert.alert("Hata", "Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, padding: 20, justifyContent: "center" }}>
      <Text style={{ fontSize: 24, fontWeight: "bold", marginBottom: 20, textAlign: "center" }}>
        Hasta Kayıt
      </Text>
      
      <TextInput
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          padding: 15,
          borderRadius: 8,
          marginBottom: 15,
        }}
        placeholder="Klinik Kodu"
        value={formData.clinicCode}
        onChangeText={(text) => setFormData({ ...formData, clinicCode: text })}
      />

      <TextInput
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          padding: 15,
          borderRadius: 8,
          marginBottom: 15,
        }}
        placeholder="Telefon"
        value={formData.phone}
        onChangeText={(text) => setFormData({ ...formData, phone: text })}
        keyboardType="phone-pad"
      />

      <TextInput
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          padding: 15,
          borderRadius: 8,
          marginBottom: 15,
        }}
        placeholder="Ad Soyad"
        value={formData.patientName}
        onChangeText={(text) => setFormData({ ...formData, patientName: text })}
      />

      <TextInput
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          padding: 15,
          borderRadius: 8,
          marginBottom: 20,
        }}
        placeholder="Email (opsiyonel)"
        value={formData.email}
        onChangeText={(text) => setFormData({ ...formData, email: text })}
        keyboardType="email-address"
      />

      <TouchableOpacity
        style={{
          backgroundColor: "#16a34a",
          padding: 15,
          borderRadius: 8,
          alignItems: "center",
        }}
        onPress={handleRegister}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={{ color: "white", fontWeight: "bold" }}>Hasta Olarak Kayıt Ol</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={{
          marginTop: 15,
          alignItems: "center",
        }}
        onPress={() => router.push("/register-doctor")}
      >
        <Text style={{ color: "#2563eb" }}>Doktor mu kayıt olacaksınız?</Text>
      </TouchableOpacity>
    </View>
  );
}
