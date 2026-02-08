// app/register-doctor.tsx
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { handleDoctorRegistration } from "../lib/doctor/register";

export default function RegisterDoctorScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    clinicCode: "",
    licenseNumber: "",
  });

  const handleRegister = async () => {
    if (!formData.fullName || !formData.phone || !formData.email) {
      Alert.alert("Hata", "Ad Soyad, Telefon ve E-posta zorunludur");
      return;
    }

    if (!formData.clinicCode || !formData.licenseNumber) {
      Alert.alert("Hata", "Klinik Kodu ve Lisans Numarası gereklidir");
      return;
    }

    setLoading(true);
    try {
      await handleDoctorRegistration({
        name: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        clinicCode: formData.clinicCode,
        licenseNumber: formData.licenseNumber,
      });
    } catch (error: any) {
      console.error("Doctor registration error:", error);
      Alert.alert("Hata", error.message || "Kayıt başarısız oldu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Doktor Kayıt</Text>

      <TextInput
        placeholder="Ad Soyad"
        value={formData.fullName}
        onChangeText={(text) => setFormData({ ...formData, fullName: text })}
        style={styles.input}
      />

      <TextInput
        placeholder="Telefon"
        value={formData.phone}
        onChangeText={(text) => setFormData({ ...formData, phone: text })}
        keyboardType="phone-pad"
        style={styles.input}
      />

      <TextInput
        placeholder="Email (opsiyonel)"
        value={formData.email}
        onChangeText={(text) => setFormData({ ...formData, email: text })}
        keyboardType="email-address"
        style={styles.input}
      />

      <TextInput
        placeholder="Klinik Adı (opsiyonel)"
        value={formData.clinicCode}
        onChangeText={(text) => setFormData({ ...formData, clinicCode: text })}
        style={styles.input}
      />

      <TextInput
        placeholder="Diploma / Lisans No (opsiyonel)"
        value={formData.licenseNumber}
        onChangeText={(text) => setFormData({ ...formData, licenseNumber: text })}
        style={styles.input}
      />

      <TouchableOpacity
        onPress={handleRegister}
        disabled={loading}
        style={styles.registerButton}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.registerButtonText}>
            Doktor Olarak Başvur
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => router.push("/register-patient")}
        style={styles.linkButton}
      >
        <Text style={styles.linkText}>
          Hasta olarak mı kayıt olacaksınız?
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    textAlign: "center",
    color: "#111827",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
    width: "100%",
  },
  registerButton: {
    backgroundColor: "#2563eb",
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 10,
  },
  registerButtonText: {
    color: "white",
    fontWeight: "bold",
  },
  linkButton: {
    marginTop: 15,
    alignItems: "center",
  },
  linkText: {
    color: "#2563eb",
  },
});
