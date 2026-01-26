import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { API_BASE } from "../lib/api";
import { useAuth } from "../lib/auth";

export default function Index() {
  const router = useRouter();
  const { signIn, isAuthReady, isAuthed } = useAuth();
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
    
    if (!clinicCode.trim()) {
      Alert.alert("Eksik Bilgi", "Lütfen klinik kodunu giriniz.");
      return;
    }

    setLoading(true);
    try {
      console.log("[REGISTER] Starting registration request to:", `${API_BASE}/api/register`);
      const normalizedClinicCode = clinicCode.trim().toUpperCase();
      const normalizedReferralCode = referralCode.trim().toUpperCase();
      
      // 60 saniye timeout - Render cold start için gerekli
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.log("[REGISTER] Request timeout after 60s");
        controller.abort();
      }, 60000);

      const payload: any = {
        fullName: name.trim(), // Backend fullName bekliyor (name ile backward compatible)
        name: name.trim(), // Backward compatibility için
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        clinicCode: normalizedClinicCode,
        // referralCode is OPTIONAL:
        // - only send if user manually entered it
        // - always normalize to uppercase
        ...(normalizedReferralCode ? { referralCode: normalizedReferralCode } : {}),
      };
      
      const res = await fetch(`${API_BASE}/api/register`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      console.log("[REGISTER] Response received, status:", res.status);

      const json = await res.json();
      console.log("[REGISTER] Response JSON:", JSON.stringify(json).substring(0, 200));

      if (!res.ok) {
        let errorMsg = json.message || json.error || "Kayıt işlemi başarısız";
        
        // Daha açıklayıcı hata mesajları
        if (json.error === "clinic_not_found") {
          errorMsg = `Klinik kodu "${normalizedClinicCode}" bulunamadı. Lütfen geçerli bir klinik kodu girin.`;
        } else if (json.error === "invalid_referral_code") {
          // Referral code is optional — user can register without it.
          const shown = normalizedReferralCode || referralCode.trim() || "-";
          errorMsg =
            `Davet kodu "${shown}" geçersiz veya bulunamadı.\n\n` +
            `Bu alan opsiyonel. Davet kodunu boş bırakarak da kayıt olabilirsin.`;
        } else if (json.error === "PLAN_LIMIT_REACHED") {
          errorMsg = `Bu klinik ${json.plan || "FREE"} planında maksimum ${json.maxPatients || 3} hasta limitine ulaşmış. Lütfen klinik yöneticisiyle iletişime geçin.`;
        } else if (json.error === "full_name_required" || json.error === "name_required") {
          errorMsg = "Lütfen ad soyad giriniz.";
        } else if (json.error === "email_required") {
          errorMsg = "Lütfen email adresinizi giriniz.";
        } else if (json.error === "invalid_email") {
          errorMsg = "Geçersiz email formatı. Lütfen geçerli bir email adresi giriniz.";
        } else if (json.error === "phone_already_exists") {
          errorMsg = "Bu telefon numarası ile zaten bir hesap kayıtlı. Lütfen farklı bir telefon numarası kullanın veya giriş yapın.";
        } else if (json.error === "phone_required") {
          errorMsg = "Lütfen telefon numarası giriniz.";
        } else if (json.error === "clinic_code_required") {
          errorMsg = "Lütfen klinik kodunu giriniz.";
        }
        
        Alert.alert("Kayıt Hatası", errorMsg);
        return;
      }

      if (json.ok && json.patientId) {
        // If OTP is required, redirect to OTP screen
        if (json.requiresOTP) {
          // Navigate to OTP screen with email and patientId
          router.push({
            pathname: "/otp",
            params: {
              email: json.email || email.trim().toLowerCase(),
              patientId: json.patientId,
              source: "register",
            },
          });
        } else if (json.token) {
          // Legacy support: if token is provided directly, use it
          await signIn({
            token: json.token,
            id: json.patientId,
            patientId: json.patientId,
          });

          // Status kontrolü yap - PENDING ise waiting-approval'a, APPROVED ise home'a yönlendir
          const patientStatus = json.status || "PENDING";
          const targetRoute = patientStatus === "APPROVED" ? "/home" : "/waiting-approval";

          Alert.alert(
            "Kayıt Başarılı",
            patientStatus === "APPROVED" 
              ? `Hoş geldiniz ${name.trim()}! Hesabınız oluşturuldu ve onaylandı.`
              : `Hoş geldiniz ${name.trim()}! Hesabınız oluşturuldu. Klinik onayı bekleniyor.`,
            [
              {
                text: "Tamam",
                onPress: () => {
                  router.replace(targetRoute);
                },
              },
            ]
          );
        } else {
          Alert.alert("Kayıt Başarılı", json.message || "Email adresinize gönderilen OTP kodunu girin.");
        }
      } else {
        Alert.alert("Hata", json.message || "Kayıt işlemi tamamlanamadı");
      }
    } catch (error: any) {
      console.error("[REGISTER] Error:", error);
      console.error("[REGISTER] Error name:", error?.name);
      console.error("[REGISTER] Error message:", error?.message);
      console.error("[REGISTER] Error stack:", error?.stack);
      
      let errorMessage = "Sunucuya bağlanılamadı.";
      
      if (error?.name === "AbortError") {
        // Timeout - Render cold start olabilir
        errorMessage = "Sunucu uyandırılıyor, lütfen 10-15 saniye bekleyip tekrar deneyin.";
      } else if (error?.message) {
        if (error.message.includes("Network request failed")) {
          errorMessage = "Ağ bağlantısı hatası. İnternet bağlantınızı kontrol edin.";
        } else if (error.message.includes("timed out")) {
          errorMessage = "Sunucu meşgul. Lütfen birkaç saniye bekleyip tekrar deneyin.";
        } else if (error.message.includes("timeout") || error.message.includes("Zaman aşımı")) {
          errorMessage = "Sunucu yanıt vermedi. Lütfen tekrar deneyin.";
        } else {
          errorMessage = error.message;
        }
      }
      
      Alert.alert("Bağlantı Hatası", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Auth hazır değilse loading göster
  if (!isAuthReady) {
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
          <Text style={styles.title}>Kayıt Ol</Text>
          <Text style={styles.subtitle}>Bilgilerinizi girerek kayıt olun</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Hasta Adı *</Text>
            <TextInput
              placeholder="Adınız ve soyadınız (örn: Ahmet Yılmaz)"
              value={name}
              onChangeText={setName}
              style={styles.input}
              autoCapitalize="words"
              editable={!loading}
            />

            <Text style={styles.label}>Email *</Text>
            <TextInput
              placeholder="Email adresiniz (örn: ahmet@example.com)"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />

            <Text style={styles.label}>Telefon *</Text>
            <TextInput
              placeholder="Telefon numaranız (örn: 5551234567)"
              value={phone}
              onChangeText={setPhone}
              style={styles.input}
              keyboardType="phone-pad"
              autoCapitalize="none"
              editable={!loading}
            />

            <Text style={styles.label}>Klinik Kodu *</Text>
            <TextInput
              placeholder="Klinik kodunuz (örn: MOON)"
              value={clinicCode}
              onChangeText={(text) => setClinicCode(text.toUpperCase())}
              style={styles.input}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!loading}
            />

            <Text style={styles.label}>Referral Kodu (Opsiyonel)</Text>
            <TextInput
              placeholder="Varsa davet kodunuzu girin"
              value={referralCode}
              onChangeText={(text) => setReferralCode(text.toUpperCase())}
              style={styles.input}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!loading}
            />

            <Pressable
              style={[styles.primary, loading && styles.primaryDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              <Text style={styles.btnText}>
                {loading ? "Kaydediliyor..." : "Kayıt Ol"}
              </Text>
            </Pressable>

            <Pressable
              style={styles.linkButton}
              onPress={() => {
                // Use setTimeout to ensure router is ready
                setTimeout(() => {
                  router.push("/login");
                }, 100);
              }}
              disabled={loading}
            >
              <Text style={styles.link}>Zaten hesabınız var mı? Giriş yapın</Text>
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
    backgroundColor: "#F5F5F5",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
  },
  content: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  title: {
    fontSize: 32,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
    marginBottom: 32,
    textAlign: "center",
  },
  form: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    padding: 14,
    borderRadius: 10,
    fontSize: 16,
    color: "#111827",
  },
  primary: {
    backgroundColor: "#2563EB",
    padding: 16,
    borderRadius: 10,
    marginTop: 24,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryDisabled: {
    backgroundColor: "#9CA3AF",
    shadowOpacity: 0,
  },
  btnText: {
    color: "#FFFFFF",
    textAlign: "center",
    fontWeight: "800",
    fontSize: 16,
  },
  linkButton: {
    marginTop: 16,
    paddingVertical: 8,
  },
  link: {
    textAlign: "center",
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "600",
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6B7280",
  },
});
