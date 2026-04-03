// app/otp.tsx
import React, { useState, useEffect, useRef } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, Platform, ScrollView, ActivityIndicator } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../lib/auth";
import { API_BASE, ADMIN_API_BASE } from "../lib/api";

// ✅ hard timeout (sonsuz verifying olmasın)
const VERIFY_TIMEOUT_MS = 8000;

export default function OtpScreen() {
  const { signIn, signOut, setOtpVerified } = useAuth();
  const params = useLocalSearchParams();
  const email = params.email as string || "";
  const phone = params.phone as string || "";
  const patientId = params.patientId as string || "";
  const source = params.source as string || "";
  
  // 🔥 CRITICAL: Doctors are NOT allowed in OTP screen
  if (source === "doctor") {
    throw new Error("OTP is not allowed for doctors");
  }
  
  // 🔥 CRITICAL: Determine userType from source - NO FALLBACK
  const userType = source === "doctor" ? "doctor" : "patient";
  
  const [otp, setOtp] = useState("");
  const [phoneInput, setPhoneInput] = useState(phone);
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [msg, setMsg] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const otpVerifiedRef = useRef(false);
  const hardResetDoneRef = useRef(false);

  async function verifyWithServer(code: string, phoneToVerify: string) {
    if (isVerifying || otpVerifiedRef.current) {
      setMsg("Doğrulama devam ediyor, lütfen bekleyin.");
      return;
    }
    if (!code || code.length !== 6 || !phoneToVerify) {
      throw new Error("Geçersiz parametreler. Lütfen tekrar deneyin.");
    }

    setIsVerifying(true);
    otpVerifiedRef.current = true;

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

    try {
      const res = await fetch(`${ADMIN_API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          otp: code,
          email: email || undefined,
          phone: phoneToVerify,
          type: "patient",
        }),
        signal: controller.signal,
      });

      const text = await res.text();
      let json: any;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new Error("Sunucu geçersiz yanıt döndürdü.");
      }

      if (!res.ok) {
        let errorMsg = json.message || json.error || `Verify failed (${res.status})`;
        if (json.error === "invalid_otp") {
          errorMsg = "Geçersiz OTP kodu. Lütfen tekrar deneyin.";
        } else if (json.error === "otp_expired") {
          errorMsg = "OTP süresi dolmuş. Lütfen yeni bir kod isteyin.";
        } else if (json.error === "otp_max_attempts") {
          errorMsg = "Maksimum deneme sayısına ulaşıldı. Lütfen yeni bir kod isteyin.";
        } else if (json.error === "patient_not_found") {
          errorMsg = "Hesap bulunamadı. Lütfen kayıt olun.";
        } else if (json.error === "doctor_not_found") {
          errorMsg = "Doktor hesabı bulunamadı. Lütfen kayıt olun.";
        } else if (json.error === "clinic_not_found") {
          errorMsg = "Klinik bulunamadı. Lütfen klinik kodunu kontrol edin.";
        } else if (json.error === "invalid_type") {
          errorMsg = "Geçersiz kullanıcı türü. Lütfen tekrar deneyin.";
        }
        throw new Error(errorMsg);
      }

      if (json.ok && json.token) {
        if (json.type === "doctor") {
          await signIn({
            token: json.token,
            doctorId: json.doctorId,
            clinicId: json.clinicId,
            type: "doctor",
            role: "DOCTOR",
            status: json.status,
          });
          
          // 🔥 ROUTING: Based on doctor status
          const targetRoute = json.status === "ACTIVE" 
            ? "/doctor/dashboard" 
            : "/waiting-approval";
          router.replace(targetRoute);
        } else if (json.type === "patient") {
          await signIn({
            token: json.token,
            patientId: json.patientId,
            type: "patient",
            role: "PATIENT",
            otpVerified: true   // ✅ EKLE
          });
          router.replace("/(patient)" as any);
        } else if (json.type === "admin") {
          await signIn({
            token: json.token,
            clinicId: json.clinicId,
            clinicCode: json.clinicCode,
            type: "admin",
            role: "ADMIN",
          });
          router.replace("/admin/dashboard");
        } else {
          throw new Error(`Unknown user type: ${json.type}`);
        }
      } else {
        throw new Error("Invalid response from server");
      }
    } finally {
      clearTimeout(t);
      setIsVerifying(false);
    }
  }

  async function resendOTP() {
    const phoneToUse = phoneInput.trim();
    if (!phoneToUse) {
      Alert.alert("Hata", "Telefon numarası gereklidir.");
      return;
    }

    setResending(true);
    try {
      const res = await fetch(`${API_BASE}/auth/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          phone: phoneToUse,
          role: "PATIENT" // 🔥 CRITICAL: Send role for patient OTP
        }),
      });

      // Safe JSON parsing
      const text = await res.text();
      let json;

      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new Error("Invalid OTP response (not JSON)");
      }

      if (!res.ok) {
        let errorMsg = json?.message || json?.error || "OTP gönderilemedi";
        if (json?.error === "rate_limit_exceeded") {
          errorMsg = "Çok fazla istek. Lütfen bir süre sonra tekrar deneyin.";
        }
        Alert.alert("Hata", errorMsg);
        return;
      }

      Alert.alert("Başarılı", "OTP kodu email adresinize gönderildi.");
      setOtp(""); // Clear OTP input
    } catch (error: any) {
      Alert.alert("Hata", `OTP gönderilemedi: ${error.message || "Bilinmeyen hata"}`);
    } finally {
      setResending(false);
    }
  }

  async function onSubmit() {
    // Guard checks
    const code = otp.trim();
    if (!code || code.length !== 6) {
      Alert.alert("Eksik Bilgi", "Lütfen 6 haneli OTP kodunu giriniz.");
      return;
    }

    const phoneToUse = phoneInput.trim();
    if (!phoneToUse) {
      Alert.alert("Eksik Bilgi", "Telefon numarası gereklidir.");
      return;
    }

    // Additional validation
    if (code === undefined || phoneToUse === undefined) {
      Alert.alert("Hata", "Geçersiz parametreler. Lütfen tekrar deneyin.");
      return;
    }

    setBusy(true);
    setMsg("");

    try {
      await verifyWithServer(code, phoneToUse);
    } catch (e: any) {
      const m =
        e?.name === "AbortError"
          ? `Doğrulama zaman aşımına uğradı (${VERIFY_TIMEOUT_MS / 1000}s).`
          : e?.message || "OTP doğrulama hatası";
      setMsg(m);
      Alert.alert("OTP Doğrulama Hatası", m);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (source === "doctor") {
      Alert.alert(
        "Hata",
        "Doktorlar OTP doğrulaması kullanamaz.",
        [{ text: "Tamam", onPress: () => router.replace("/register-doctor") }]
      );
      return;
    }
    if (!phone && !phoneInput && !patientId) {
      router.replace("/");
    }
  }, [phone, phoneInput, patientId, source]);

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <View style={styles.wrap}>
        <Text style={styles.h1}>Email Doğrulama</Text>

        <Text style={styles.p}>
          {email ? `${email} adresine` : "Email adresinize"} gönderilen 6 haneli OTP kodunu giriniz.
        </Text>

        {!phone && (
          <>
            <Text style={styles.label}>Telefon Numarası</Text>
            <Text style={styles.requiredText}>Telefon numarası gerekmektedir</Text>
            <TextInput
              value={phoneInput}
              onChangeText={setPhoneInput}
              placeholder="Telefon Numarası"
              placeholderTextColor="rgba(0,0,0,0.35)"
              keyboardType="phone-pad"
              style={styles.input}
              editable={!busy}
              autoComplete="tel"
            />
          </>
        )}

        <Text style={styles.label}>OTP Kodu</Text>
        <TextInput
          value={otp}
          onChangeText={setOtp}
          placeholder="OTP Kodunu Giriniz"
          placeholderTextColor="rgba(0,0,0,0.35)"
          keyboardType={Platform.OS === "web" ? "default" : "number-pad"}
          style={styles.input}
          maxLength={6}
          editable={!busy}
          autoFocus={!!phone}
        />

        {msg ? <Text style={styles.err}>{msg}</Text> : null}

        <Pressable 
          onPress={onSubmit} 
          disabled={busy || otp.length !== 6} 
          style={[styles.btn, (busy || otp.length !== 6) && styles.btnDisabled]}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.btnText}>Doğrula</Text>
          )}
        </Pressable>

        <Pressable 
          onPress={resendOTP} 
          disabled={resending} 
          style={[styles.linkBtn, resending && { opacity: 0.5 }]}
        >
          {resending ? (
            <ActivityIndicator size="small" color="#2563EB" />
          ) : (
            <Text style={styles.linkText}>Kodu Tekrar Gönder</Text>
          )}
        </Pressable>

        <Pressable 
          onPress={() => {
            // Clear any partial registration data and go to home/register
            router.replace("/");
          }} 
          style={styles.linkBtn}
        >
          <Text style={styles.linkText}>Geri Dön</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  wrap: { 
    flex: 1, 
    padding: 24, 
    backgroundColor: "#F3F4F6",
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
  },
  h1: { 
    fontSize: 28, 
    fontWeight: "900", 
    marginBottom: 12,
    color: "#111827",
    textAlign: "center",
  },
  p: { 
    color: "rgba(0,0,0,0.6)", 
    marginBottom: 24, 
    fontWeight: "600",
    fontSize: 14,
    textAlign: "center",
  },
  input: {
    backgroundColor: "white",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    fontWeight: "800",
    fontSize: 18,
    textAlign: "center",
    letterSpacing: 4,
    marginBottom: 12,
  },
  btn: {
    marginTop: 12,
    backgroundColor: "#2563EB",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: {
    backgroundColor: "#9CA3AF",
    shadowOpacity: 0,
  },
  btnText: { 
    color: "white", 
    fontWeight: "900",
    fontSize: 16,
  },
  err: { 
    marginTop: 10, 
    color: "#DC2626", 
    fontWeight: "700",
    fontSize: 14,
    textAlign: "center",
  },
  linkBtn: { 
    marginTop: 16, 
    alignItems: "center",
    paddingVertical: 8,
  },
  linkText: { 
    fontWeight: "700", 
    color: "#2563EB",
    fontSize: 14,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6B7280",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
    marginTop: 16,
  },
  requiredText: {
    fontSize: 12,
    color: "#DC2626",
    marginBottom: 8,
    fontWeight: "600",
  },
});
