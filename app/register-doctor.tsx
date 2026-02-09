// app/register-doctor.tsx
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { handleDoctorRegistration } from "../lib/doctor/register";
import { useAuth } from "../lib/auth";

export default function RegisterDoctorScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: "",
    phone: "",
    email: "",
    clinicCode: "",
    licenseNumber: "",
    department: "Dentistry", // ✅ Add missing field
    specialties: "General", // ✅ Add missing field
  });

  const handleRegister = async () => {
    if (!formData.fullName || !formData.phone || !formData.email || !formData.clinicCode || !formData.licenseNumber || !formData.department || !formData.specialties) {
      Alert.alert("Hata", "Tüm zorunlu alanları doldurun");
      return;
    }

    setLoading(true);
    try {
      const result = await handleDoctorRegistration({
        name: "Test Doctor", // Simple test name
        email: "test@doctor.com", // Simple test email
        phone: "9999999999", // Simple test phone
        clinicCode: "SAVSAT",
        licenseNumber: "TEST123",
        department: "Dentistry",
        specialties: "General"
      });

      if (result.ok && result.token) {
        await signIn({
          token: result.token,
          doctorId: result.doctorId,
          clinicId: result.clinicId,
          role: "DOCTOR",
          type: "doctor",
          status: result.status,
        });

        Alert.alert(
          "Başvuru alındı",
          "Doktor hesabınız admin onayından sonra giriş yapabilirsiniz.",
          [
            {
              text: "Tamam",
              onPress: () => {
                router.replace("/login-doctor"); // 🔥 ROUTE TO DOCTOR LOGIN
              },
            },
          ]
        );
      } else {
        Alert.alert("Hata", result.error || "Doktor kaydı başarısız");
      }
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
