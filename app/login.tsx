// app/login.tsx
// PATIENT-ONLY LOGIN SCREEN - NO DOCTOR ROUTING
import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Image } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { API_BASE } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/language-context";
import { useEffect } from "react";

export default function Login() {
  const router = useRouter();
  const params = useLocalSearchParams<{ patientId?: string; phone?: string; token?: string }>();
  const { signIn, isAuthReady, isAuthed } = useAuth();
  const { t, isLoading } = useLanguage();
  const [phone, setPhone] = useState(params.phone || "");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestingOTP, setRequestingOTP] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");

  // Eğer kullanıcı zaten giriş yaptıysa home'a yönlendir
  useEffect(() => {
    if (isAuthReady && isAuthed) {
      // Kısa bir delay ile yönlendir (chat butonuna basınca tetiklenmesin)
      const timer = setTimeout(() => {
        router.replace("/home");
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isAuthReady, isAuthed, router]);

  // Deep link ile gelen token varsa otomatik login yap
  useEffect(() => {
    if (params.token && params.patientId && isAuthReady && !isAuthed) {
      signIn({
        token: params.token,
        id: params.patientId,
        patientId: params.patientId,
        type: "patient",
        role: "PATIENT",
      });
      router.replace("/home");
    }
  }, [params.token, params.patientId, isAuthReady, isAuthed, signIn, router]);

  // Don't render until language is loaded
  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const handleRequestOTP = async () => {
    if (requestingOTP || otpSent) return;

    const cleanedPhone = phone.replace(/\D/g, "");
    setPhone(cleanedPhone);

    // Validation
    if (!cleanedPhone.trim()) {
      Alert.alert("Eksik Bilgi", "Lütfen telefon numarası giriniz.");
      return;
    }

    setRequestingOTP(true);
    try {
      const res = await fetch(`${API_BASE}/auth/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanedPhone,
          role: "PATIENT",
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        let errorMsg = json.message || json.error || "OTP gönderilemedi";
        
        if (json.error === "patient_not_found") {
          errorMsg = "Bu telefon numarası ile kayıtlı hasta bulunamadı. Lütfen kayıt olun.";
        } else if (json.error === "phone_required") {
          errorMsg = "Lütfen telefon numarası giriniz.";
        } else if (json.error === "email_not_found") {
          errorMsg = "Bu hastanın email adresi kayıtlı değil. Lütfen admin ile iletişime geçin.";
        } else if (json.error === "smtp_not_configured") {
          errorMsg = "Email servisi yapılandırılmamış. Lütfen destek ile iletişime geçin.";
        } else if (json.error === "rate_limit_exceeded") {
          errorMsg = "Çok fazla istek. Lütfen bir süre sonra tekrar deneyin.";
        }
        
        Alert.alert("Hata", errorMsg);
        return;
      }

      if (json.ok) {
        // Mask email if provided
        if (json.phone) {
          // Backend might return masked phone
          const masked = json.phone;
          // Extract email from response if available (backend might not return it for security)
          setMaskedEmail(""); // Will show generic message
        }
        
        setOtpSent(true);
        Alert.alert("Başarılı", "OTP kodu kayıtlı email adresinize gönderildi.");
      }
    } catch (error: any) {
      console.error("[LOGIN] Request OTP error:", error);
      Alert.alert("Hata", error?.message || "OTP gönderilemedi. Lütfen tekrar deneyin.");
    } finally {
      setRequestingOTP(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (loading) return;

    const cleanedPhone = phone.replace(/\D/g, "");
    setPhone(cleanedPhone);

    // Validation
    if (!cleanedPhone.trim()) {
      Alert.alert("Eksik Bilgi", "Lütfen telefon numarası giriniz.");
      return;
    }

    if (!otp.trim() || otp.trim().length !== 6) {
      Alert.alert("Eksik Bilgi", "Lütfen 6 haneli OTP kodunu giriniz.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: cleanedPhone,
          otp: otp.trim(),
          role: "PATIENT",
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        let errorMsg = json.message || json.error || "OTP doğrulama başarısız";
        
        if (json.error === "invalid_otp") {
          errorMsg = "Geçersiz OTP kodu. Lütfen tekrar deneyin.";
        } else if (json.error === "otp_expired") {
          errorMsg = "OTP süresi dolmuş. Lütfen yeni bir kod isteyin.";
        } else if (json.error === "otp_max_attempts") {
          errorMsg = "Maksimum deneme sayısına ulaşıldı. Lütfen yeni bir kod isteyin.";
        } else if (json.error === "otp_not_found") {
          errorMsg = "OTP bulunamadı. Lütfen yeni bir kod isteyin.";
        } else if (json.error === "otp_already_used") {
          errorMsg = "Bu OTP zaten kullanılmış. Lütfen yeni bir kod isteyin.";
        }
        
        Alert.alert("Hata", errorMsg);
        return;
      }

      if (json.ok && json.token && json.patientId) {
        // Token'ı auth sistemine kaydet
        await signIn({
          token: json.token,
          id: json.patientId,
          patientId: json.patientId,
          type: json.role?.toLowerCase() || "patient", // 🔥 FIX: Include type from login response
          role: json.role || "PATIENT",
        });

        // Patient-only routing
        const patientStatus = json.status || "PENDING";
        const targetRoute = patientStatus === "APPROVED" ? "/home" : "/waiting-approval";

        Alert.alert(
          t("login.success"),
          t("login.welcomePending", { name: json.name || "" }),
          [
            {
              text: t("common.ok"),
              onPress: () => {
                router.replace(targetRoute);
              },
            },
          ]
        );
      } else {
        Alert.alert("Hata", "OTP doğrulama başarısız");
      }
    } catch (error: any) {
      console.error("[LOGIN] Verify OTP error:", error);
      Alert.alert("Hata", error?.message || "OTP doğrulama hatası. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthReady) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

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
          <Text style={styles.h1}>Giriş Yap</Text>
          <Text style={styles.subtitle}>
            {otpSent 
              ? "Mail OTP Kodu"
              : "Telefon numaranı gir"}
          </Text>
          
          {(params.patientId || params.phone) && (
            <View style={styles.deepLinkInfo}>
              <Text style={styles.deepLinkText}>
                {params.patientId && `Patient ID: ${params.patientId}`}
                {params.phone && ` • Telefon: ${params.phone}`}
              </Text>
            </View>
          )}

          {otpSent && maskedEmail && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                OTP kodu {maskedEmail} adresine gönderildi.
              </Text>
            </View>
          )}

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Telefon Numarası *</Text>
              <TextInput
                style={styles.input}
                placeholder="05551234567 veya +905551234567"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading && !requestingOTP && !otpSent}
              />
            </View>

            {otpSent && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Mail OTP Kodu *</Text>
                <TextInput
                  style={[styles.input, styles.otpInput]}
                  placeholder="123456"
                  value={otp}
                  onChangeText={(text) => {
                    // Sadece rakamları kabul et, max 6 karakter
                    const cleaned = text.replace(/\D/g, "").slice(0, 6);
                    setOtp(cleaned);
                  }}
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={6}
                  editable={!loading}
                  autoFocus
                />
                <Text style={styles.helpText}>
                  OTP kodu email adresinize gönderilmiştir. Lütfen email kutunuzu kontrol edin.
                </Text>
              </View>
            )}

            {!otpSent ? (
              <Pressable
                style={[styles.button, (requestingOTP || !phone.trim()) && styles.buttonDisabled]}
                onPress={handleRequestOTP}
                disabled={requestingOTP || !phone.trim()}
              >
                {requestingOTP ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>OTP Gönder</Text>
                )}
              </Pressable>
            ) : (
              <>
                <Pressable
                  style={[styles.button, (loading || otp.trim().length !== 6) && styles.buttonDisabled]}
                  onPress={handleVerifyOTP}
                  disabled={loading || otp.trim().length !== 6}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.buttonText}>Giriş Yap</Text>
                  )}
                </Pressable>

                <Pressable
                  style={styles.secondaryButton}
                  onPress={() => {
                    setOtpSent(false);
                    setOtp("");
                    setMaskedEmail("");
                  }}
                  disabled={loading || requestingOTP}
                >
                  <Text style={styles.secondaryButtonText}>Telefon Numarasını Değiştir</Text>
                </Pressable>
              </>
            )}

            <Pressable
              style={styles.linkButton}
              onPress={() => router.push("/")}
              disabled={loading || requestingOTP}
            >
              <Text style={styles.link}>{t("login.noAccount")}</Text>
            </Pressable>

            <Pressable
              style={styles.linkButton}
              onPress={() => router.push("/doctor-login")}
              disabled={loading || requestingOTP}
            >
              <Text style={styles.link}>Doktor musunuz? Doktor Girişi</Text>
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
    backgroundColor: "#f6f7f9",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f6f7f9",
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
  logoContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  logo: {
    width: 180,
    height: 60,
  },
  h1: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    marginBottom: 32,
    textAlign: "center",
  },
  form: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: "#111827",
  },
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  linkButton: {
    marginTop: 20,
    alignItems: "center",
  },
  link: {
    color: "#2563eb",
    fontSize: 14,
    fontWeight: "600",
  },
  deepLinkInfo: {
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fcd34d",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  deepLinkText: {
    color: "#92400e",
    fontSize: 13,
    textAlign: "center",
  },
  infoBox: {
    backgroundColor: "#DBEAFE",
    borderWidth: 1,
    borderColor: "#3B82F6",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  infoText: {
    color: "#1E40AF",
    fontSize: 13,
    textAlign: "center",
    fontWeight: "600",
  },
  otpInput: {
    textAlign: "center",
    fontSize: 20,
    letterSpacing: 8,
    fontWeight: "700",
  },
  helpText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 6,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#6B7280",
  },
  secondaryButton: {
    backgroundColor: "transparent",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#2563EB",
  },
  secondaryButtonText: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "700",
  },
});
