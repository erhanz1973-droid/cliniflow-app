import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Image } from "react-native";
import { Stack, useRouter } from "expo-router";
import { API_BASE } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/language-context";

export const unstable_settings = {
  initialRouteName: "index",
};

export default function Index() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <IndexContent router={router} />
    </>
  );
}

function IndexContent({ router }: { router: any }) {
  const { signIn, isAuthReady, isAuthed } = useAuth();
  const { t, isLoading } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [clinicCode, setClinicCode] = useState(""); // Başlangıçta boş, kullanıcı girecek
  const [referralCode, setReferralCode] = useState("");
  const [loading, setLoading] = useState(false);
  const hasRedirected = useRef(false);

  // Eğer kullanıcı zaten giriş yaptıysa home'a yönlendir
  // NOT: Bu yönlendirme sadece index (register) sayfasında çalışmalı
  // Yönlendirmeyi kaldırdık çünkü chat butonuna basınca yanlışlıkla tetikleniyordu
  // Bunun yerine render kontrolünde yönlendirme yapıyoruz (daha güvenli)
  // useEffect(() => {
  //   if (isAuthReady && isAuthed && !hasRedirected.current) {
  //     hasRedirected.current = true;
  //     router.replace("/home");
  //   }
  // }, [isAuthReady, isAuthed]);

  const handleRegister = async () => {
    // Validation
    if (!name.trim()) {
      Alert.alert("Eksik Bilgi", "Lütfen ad soyad giriniz.");
      return;
    }
    
    if (!email.trim()) {
      Alert.alert("Eksik Bilgi", "Lütfen email adresinizi giriniz.");
      return;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert("Geçersiz Email", "Lütfen geçerli bir email adresi giriniz.");
      return;
    }
    
    if (!phone.trim()) {
      Alert.alert("Eksik Bilgi", "Lütfen telefon numarası giriniz.");
      return;
    }
    
    // Validate and format phone number
    const normalizedPhone = phone.trim().replace(/\s+/g, "").replace(/\D/g, "");
    if (normalizedPhone.length < 10) {
      Alert.alert("Geçersiz Telefon", "Telefon numarası en az 10 haneli olmalıdır.");
      return;
    }
    
    if (!clinicCode.trim()) {
      Alert.alert("Eksik Bilgi", "Lütfen klinik kodunu giriniz.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: normalizedPhone, // Use normalized phone number
          clinicCode: clinicCode.trim(),
          referralCode: referralCode.trim(),
        }),
      });

      if (!response.ok) {
        const errorMsg = await response.text();
        console.error("[REGISTER] API error:", errorMsg);
        Alert.alert("Kayıt Hatası", errorMsg);
        return;
      }

      const json = await response.json();
      console.log("[REGISTER] Response:", json);

      if (json.ok && json.patientId) {
        Alert.alert(
          "Kayıt Başarılı",
          "Kaydınız başarıyla oluşturuldu. Email adresinize gönderilen OTP kodunu giriniz."
        );
        // Navigate to OTP screen with patient data
        router.replace({
          pathname: "/otp",
          params: {
            patientId: json.patientId,
            email: email.trim(),
            name: name.trim(),
            phone: phone.trim(),
          },
        });
      } else {
        Alert.alert("Kayıt Hatası", json.message || "Bilinmeyen bir hata oluştu.");
      }
    } catch (error) {
      console.error("[REGISTER] Registration error:", error);
      Alert.alert("Kayıt Hatası", "Bilinmeyen bir hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  // Auth hazır değilse loading göster
  if (!isAuthReady || isLoading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  // Zaten giriş yapılmışsa home'a yönlendir (sadece render kontrolü, useEffect yok)
  // Render kontrolü kaldırıldı çünkü chat butonuna basınca yanlışlıkla tetikleniyordu
  // if (isAuthReady && isAuthed) {
  //   return null; // Yönlendirme bekleniyor
  // }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
      >
        <View style={styles.content}>
          <View style={styles.logoContainer}>
            <Image 
              source={require('../assets/images/icon.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.title}>Kayıt Ol</Text>
          <Text style={styles.subtitle}>Bilgilerinizi girerek kayıt olun</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Hasta Adı *</Text>
            <TextInput
              placeholder="Adınız ve soyadınız (örn: Ahmet Yılmaz)"
              value={name}
              onChangeText={setName}
              style={styles.input}
            />

            <Text style={styles.label}>Email *</Text>
            <TextInput
              placeholder="Email adresiniz"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              style={styles.input}
            />

            <Text style={styles.label}>Telefon *</Text>
            <TextInput
              placeholder="+90 XXX XXX XX XX"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              style={styles.input}
            />
            <Text style={styles.helperText}>Örnek: 5551234567, 05551234567 veya +905551234567</Text>

            <Text style={styles.label}>Klinik Kodu *</Text>
            <TextInput
              placeholder="Klinik kodunuz"
              value={clinicCode}
              onChangeText={setClinicCode}
              style={styles.input}
            />

            <Text style={styles.label}>Referral Kodu (opsiyonel)</Text>
            <TextInput
              placeholder="Referral kodunuz (varsa)"
              value={referralCode}
              onChangeText={setReferralCode}
              style={styles.input}
            />

            <Pressable style={styles.registerButton} onPress={handleRegister} disabled={loading}>
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.registerButtonText}>Kayıt Ol</Text>
              )}
            </Pressable>
            
            <Pressable onPress={() => router.push('/login')} style={styles.loginLink}>
              <Text style={styles.loginLinkText}>Zaten kayıtlıysan giriş yap</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#6B7280",
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    padding: 20,
  },
  logoContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: "contain",
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 32,
  },
  form: {
    width: "100%",
    maxWidth: 400,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 16,
    textAlign: "center",
  },
  registerButton: {
    backgroundColor: "#2563EB",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  registerButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
  },
  loginLink: {
    marginTop: 16,
    alignItems: "center",
  },
  loginLinkText: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
});
