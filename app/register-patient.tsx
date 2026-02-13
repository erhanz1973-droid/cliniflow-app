// app/register-patient.tsx
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { API_BASE } from "../lib/api";
import { usePatientRegistration } from "../lib/patient/register";

export default function RegisterPatientScreen() {
  const router = useRouter();
  const { handlePatientRegistration } = usePatientRegistration();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    clinicCode: "",
    phone: "",
    patientName: "",
    email: "",
    referralCode: "", // Add referral code field
  });

  const handleRegister = async () => {
    if (!formData.clinicCode || !formData.phone || !formData.patientName) {
      Alert.alert("Hata", "Tüm alanları doldurun");
      return;
    }

    console.log('[PATIENT REG] Form data:', formData);
    console.log('[PATIENT REG] Sending to backend:', {
      clinicCode: formData.clinicCode,
      phone: formData.phone,
      patientName: formData.patientName,
      email: formData.email,
      referralCode: formData.referralCode // Add referral code to backend call
    });

    setLoading(true);
    try {
      await handlePatientRegistration({
        name: formData.patientName,
        email: formData.email,
        phone: formData.phone,
        clinicCode: formData.clinicCode,
        inviterReferralCode: formData.referralCode // Add referral code to API call
      });
    } catch (error: any) {
      console.error('Registration error:', error);
      Alert.alert("Hata", error.message || "Kayıt başarısız");
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

      <TextInput
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          padding: 15,
          borderRadius: 8,
          marginBottom: 20,
        }}
        placeholder="Referans Kodu (isteğe bağlı)"
        value={formData.referralCode}
        onChangeText={(text) => setFormData({ ...formData, referralCode: text })}
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
