// app/login-doctor.tsx
// Doctor-only login screen - NO OTP
import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { signIn } from "../lib/auth";
import { useLanguage } from "../lib/language-context";

export default function LoginDoctorScreen() {
  const router = useRouter();
  const { t, isLoading } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Hata", "Email ve şifre gereklidir");
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement doctor login API call
      // For now, simulate successful login
      const mockResponse = {
        ok: true,
        token: "mock_doctor_token",
        doctorId: "mock_doctor_id",
        clinicId: "mock_clinic_id", 
        role: "DOCTOR",
        type: "doctor",
        status: "PENDING", // Doctors start as pending
        name: "Mock Doctor"
      };

      await signIn({
        token: mockResponse.token,
        doctorId: mockResponse.doctorId,
        clinicId: mockResponse.clinicId,
        type: "doctor",
        role: "DOCTOR",
        status: mockResponse.status,
      });

      Alert.alert(
        "Giriş Başarılı",
        "Doktor girişi yapıldı. Admin onayı bekleniyor.",
        [
          {
            text: "Tamam",
            onPress: () => {
              router.replace("/waiting-approval");
            },
          },
        ]
      );
    } catch (error: any) {
      console.error("[DOCTOR LOGIN] Error:", error);
      Alert.alert("Hata", "Giriş başarısız. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Doktor Girişi</Text>
      <Text style={styles.subtitle}>Email ve şifre ile giriş yapın</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <TextInput
        style={styles.input}
        placeholder="Şifre"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={styles.loginButton}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.loginButtonText}>Giriş Yap</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => router.replace("/register-doctor")}
      >
        <Text style={styles.linkButtonText}>Hesap Oluştur</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#111827',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 30,
  },
  input: {
    width: '100%',
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  loginButton: {
    backgroundColor: '#2563EB',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  loginButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  linkButton: {
    backgroundColor: 'transparent',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2563EB',
  },
  linkButtonText: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6B7280',
  },
});
