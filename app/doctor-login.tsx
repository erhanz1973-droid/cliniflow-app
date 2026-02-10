// app/doctor-login.tsx
// DOCTOR-ONLY LOGIN SCREEN
import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, KeyboardAvoidingView, Platform, ActivityIndicator, Image } from "react-native";
import { useRouter } from "expo-router";
import { authRequestOTP, authVerifyOTP } from "../lib/authApi";
import { useAuth } from "../lib/auth";
import { getCurrentDoctorProfile } from "../lib/doctor/api";

export default function DoctorLogin() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [requestingOTP, setRequestingOTP] = useState(false);
  const [otpSent, setOtpSent] = useState(false);

  const handleRequestOTP = async () => {
    if (requestingOTP || otpSent) return;

    const cleanedPhone = phone.replace(/\D/g, "");
    const emailTrimmed = email.trim();
    setPhone(cleanedPhone);

    if (!cleanedPhone.trim() && !emailTrimmed) {
      Alert.alert("Eksik Bilgi", "Lütfen telefon numarası veya email giriniz.");
      return;
    }

    // Remove frontend email validation - let backend handle it
    // const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // if (emailTrimmed && emailTrimmed.length < 5) {
    //   Alert.alert("Hata", "Email adresi çok kısa.");
    //   return;
    // }
    // if (emailTrimmed && !emailRegex.test(emailTrimmed)) {
    //   Alert.alert("Hata", "Lütfen geçerli bir email adresi giriniz (örn: email@domain.com).");
    //   return;
    // }

    setRequestingOTP(true);
    try {
      const json = await authRequestOTP({
        phone: cleanedPhone || undefined,
        email: emailTrimmed || undefined,
        role: "DOCTOR",
      });

      if (!json.ok) {
        let errorMsg = json.message || json.error || "OTP gönderilemedi";
        Alert.alert("Hata", errorMsg);
        return;
      }

      setOtpSent(true);
      Alert.alert("Başarılı", "OTP kodu kayıtlı email adresinize gönderildi.");
    } catch (error: any) {
      console.error("[DOCTOR LOGIN] Request OTP error:", error);
      Alert.alert("Hata", error?.message || "OTP gönderilemedi. Lütfen tekrar deneyin.");
    } finally {
      setRequestingOTP(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (loading) return;

    const cleanedPhone = phone.replace(/\D/g, "");
    const emailTrimmed = email.trim();

    if (!cleanedPhone.trim() && !emailTrimmed) {
      Alert.alert("Eksik Bilgi", "Lütfen telefon numarası veya email giriniz.");
      return;
    }

    if (!otp.trim() || otp.trim().length !== 6) {
      Alert.alert("Eksik Bilgi", "Lütfen 6 haneli OTP kodunu giriniz.");
      return;
    }

    setLoading(true);
    try {
      const requestBody = {
        phone: cleanedPhone || undefined,
        email: emailTrimmed || undefined,
        otp: otp.trim(),
        role: "DOCTOR" as const,
      };
      
      console.log("[VERIFY-OTP-DOCTOR] Request body:", requestBody);
      
      const json = await authVerifyOTP(requestBody);

      if (!json.ok) {
        let errorMsg = json.message || json.error || "OTP doğrulama başarısız";
        Alert.alert("Hata", errorMsg);
        return;
      }

      if (json.ok && json.token && json.doctorId) {
        // Save token to auth system
        await signIn({
          token: json.token,
          id: json.doctorId,
          doctorId: json.doctorId,
          type: "doctor",
          role: "DOCTOR",
        });

        // Get doctor profile to check status
        try {
          const profileResponse = await getCurrentDoctorProfile();
          
          if (profileResponse.ok && profileResponse.doctor) {
            const doctorStatus = profileResponse.doctor.status;
            
            console.log("[DOCTOR LOGIN] Doctor status:", doctorStatus);
            
            // Route based on status - more flexible check
            const isActive = doctorStatus === "APPROVED" || doctorStatus === "ACTIVE";
            const targetRoute = isActive ? "/doctor/dashboard" : "/doctor/pending";
            
            console.log("[DOCTOR LOGIN] Target route:", targetRoute);
            
            Alert.alert(
              "Giriş Başarılı",
              `Hoş geldiniz, Dr. ${profileResponse.doctor.name}`,
              [
                {
                  text: "Devam Et",
                  onPress: () => {
                    router.replace(targetRoute);
                  },
                },
              ]
            );
          } else {
            // Fallback to pending if profile check fails
            router.replace("/doctor/pending");
          }
        } catch (profileError) {
          console.error("[DOCTOR LOGIN] Profile check error:", profileError);
          // Fallback to pending
          router.replace("/doctor/pending");
        }
      } else {
        Alert.alert("Hata", "OTP doğrulama başarısız");
      }
    } catch (error: any) {
      console.error("[DOCTOR LOGIN] Verify OTP error:", error);
      Alert.alert("Hata", error?.message || "OTP doğrulama hatası. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

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
          <Text style={styles.h1}>Doktor Girişi</Text>
          <Text style={styles.subtitle}>
            {otpSent 
              ? "Email OTP Kodu"
              : "Telefon numaranı gir"}
          </Text>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Telefon Numarası</Text>
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

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Adresi</Text>
              <TextInput
                style={styles.input}
                placeholder="email@domain.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading && !requestingOTP && !otpSent}
              />
            </View>

            {otpSent && (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email OTP Kodu *</Text>
                <TextInput
                  style={[styles.input, styles.otpInput]}
                  placeholder="123456"
                  value={otp}
                  onChangeText={(text) => {
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
                  OTP kodu email adresinize gönderilmiştir.
                </Text>
              </View>
            )}

            {!otpSent ? (
              <Pressable
                style={[styles.button, (requestingOTP || (!phone.trim() && !email.trim())) && styles.buttonDisabled]}
                onPress={handleRequestOTP}
                disabled={requestingOTP || (!phone.trim() && !email.trim())}
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
                  }}
                  disabled={loading || requestingOTP}
                >
                  <Text style={styles.secondaryButtonText}>Telefon Numarasını Değiştir</Text>
                </Pressable>
              </>
            )}

            <Pressable
              style={styles.linkButton}
              onPress={() => router.push("/login")}
              disabled={loading || requestingOTP}
            >
              <Text style={styles.link}>Hasta Girişi</Text>
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
