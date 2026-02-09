import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { apiPost } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/language-context";
import { sendOTP } from "../lib/otp";

export const unstable_settings = {
  initialRouteName: "index",
};

export default function Index() {
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <RegisterScreen />
    </>
  );
}

function RegisterScreen() {
  const router = useRouter();
  const { isAuthReady } = useAuth();
  const { isLoading } = useLanguage();

  const [userType, setUserType] = useState<"patient" | "doctor">("patient");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [clinicCode, setClinicCode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!name || !email || !phone || !clinicCode) {
      Alert.alert("Eksik Bilgi", "Lütfen tüm zorunlu alanları doldurun.");
      return;
    }

    const endpoint = userType === "doctor" ? "/api/register/doctor" : "/api/register";

    setLoading(true);
    try {
      const res = await apiPost<{
        ok: boolean;
        patientId?: string;
        doctorId?: string;
        message?: string;
        status?: string;
        error?: string;
      }>(endpoint, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.replace(/\D/g, ""),
        clinicCode: clinicCode.trim(),
        referralCode: referralCode.trim(),
        userType: userType,
        ...(userType === "doctor" && {
          department: "Dentistry",
          specialties: ["General"]
        })
      });

      if (!res.ok) {
        if (res.error === "phone_already_exists") {
          Alert.alert("Hata", res.message || "Bu telefon numarası zaten kayıtlı.");
        } else {
          Alert.alert("Hata", res.message || "Kayıt başarısız");
        }
        return;
      }

      Alert.alert(
        "Kayıt Başarılı",
        userType === "doctor"
          ? "Başvurunuz alındı. Admin onayı sonrası giriş yapabilirsiniz."
          : "Kayıt tamamlandı. OTP doğrulamasına yönlendiriliyorsunuz."
      );

      // Send OTP - ONLY for patients
      try {
        const result = await sendOTP({
          phone: phone.replace(/\D/g, ""),
          email,
          userType: userType === "doctor" ? "doctor" : "patient"
        });
        
        // If OTP was skipped for doctor, don't navigate to OTP
        if (result?.skipped) {
          console.log("[REGISTER] OTP skipped for doctor - staying on register");
          return;
        }
      } catch (error) {
        console.error("[REGISTER] OTP send error:", error);
        // Continue with flow even if OTP fails
      }

      router.replace({
        pathname: "/otp",
        params: {
          userId: userType === "doctor" ? res.doctorId : res.patientId,
          email,
          name,
          phone,
          userType,
        },
      });
    } catch (e: any) {
      Alert.alert("Hata", e.message || "Sunucu hatası");
    } finally {
      setLoading(false);
    }
  }

  if (!isAuthReady || isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <Image
          source={require("../assets/images/icon.png")}
          style={styles.logo}
        />

        <Text style={styles.title}>Kayıt Ol</Text>

        {/* USER TYPE */}
        <View style={styles.switch}>
          <Pressable
            style={[
              styles.switchBtn,
              userType === "patient" && styles.switchActive,
            ]}
            onPress={() => setUserType("patient")}
          >
            <Text>🏥 Hasta</Text>
          </Pressable>

          <Pressable
            style={[
              styles.switchBtn,
              userType === "doctor" && styles.switchActive,
            ]}
            onPress={() => setUserType("doctor")}
          >
            <Text>👨‍⚕️ Doktor</Text>
          </Pressable>
        </View>

        <TextInput
          placeholder={userType === "doctor" ? "Doktor Adı" : "Hasta Adı"}
          style={styles.input}
          value={name}
          onChangeText={setName}
        />

        <TextInput
          placeholder="Email"
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />

        <TextInput
          placeholder="Telefon"
          style={styles.input}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />

        <TextInput
          placeholder="Klinik Kodu"
          style={styles.input}
          value={clinicCode}
          onChangeText={setClinicCode}
        />

        <TextInput
          placeholder="Referral Kodu (opsiyonel)"
          style={styles.input}
          value={referralCode}
          onChangeText={setReferralCode}
        />

        <Pressable
          style={styles.submit}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Kayıt Ol</Text>
          )}
        </Pressable>

        <Pressable onPress={() => router.push("/login")}>
          <Text style={styles.login}>Zaten hesabın var mı? Giriş yap</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ================= STYLES ================= */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  scroll: { padding: 24 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  logo: { width: 120, height: 120, alignSelf: "center", marginBottom: 24 },
  title: {
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    marginBottom: 24,
  },
  switch: {
    flexDirection: "row",
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    marginBottom: 16,
  },
  switchBtn: {
    flex: 1,
    padding: 12,
    alignItems: "center",
  },
  switchActive: {
    backgroundColor: "#fff",
    borderRadius: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 14,
    backgroundColor: "#fff",
    marginBottom: 12,
  },
  submit: {
    backgroundColor: "#2563EB",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  submitText: { color: "#fff", fontWeight: "700" },
  login: {
    marginTop: 16,
    textAlign: "center",
    color: "#2563EB",
    textDecorationLine: "underline",
  },
});
