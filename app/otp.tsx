// app/otp.tsx
import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  Platform, ScrollView, ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/language-context";
import { API_BASE, ADMIN_API_BASE } from "../lib/api";

const VERIFY_TIMEOUT_MS = 10_000;

/** Masks an email: "john.doe@gmail.com" → "jo***@gmail.com" */
function maskEmail(email: string): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export default function OtpScreen() {
  const { signIn } = useAuth();
  const { t } = useLanguage();
  const params = useLocalSearchParams();

  const email      = (params.email      as string) || "";
  const phone      = (params.phone      as string) || "";
  const patientId  = (params.patientId  as string) || "";
  const source     = (params.source     as string) || "";
  // emailSent='0' means the initial OTP email failed to deliver
  const emailSentParam = (params.emailSent as string) ?? "1";
  const initialEmailFailed = emailSentParam === "0";

  // Doctors must never land here
  if (source === "doctor") {
    throw new Error("OTP is not allowed for doctors");
  }

  const [otp, setOtp]               = useState("");
  const [phoneInput, setPhoneInput] = useState(phone);
  const [busy, setBusy]             = useState(false);
  const [resending, setResending]   = useState(false);
  const [errorMsg, setErrorMsg]     = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const otpVerifiedRef  = useRef(false);
  const autoResendDoneRef = useRef(false);

  const noEmail = !email.trim();

  // ── Guard: redirect if missing both phone and patientId ──────────────────
  useEffect(() => {
    if (!phone && !phoneInput && !patientId) {
      router.replace("/");
    }
  }, [phone, phoneInput, patientId]);

  // ── Auto-resend if initial email failed ──────────────────────────────────
  useEffect(() => {
    if (initialEmailFailed && !noEmail && !autoResendDoneRef.current) {
      autoResendDoneRef.current = true;
      // Small delay so the UI is visible first
      const timer = setTimeout(() => resendOTP(), 800);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Verify ────────────────────────────────────────────────────────────────
  async function verifyWithServer(code: string, phoneToVerify: string) {
    if (isVerifying || otpVerifiedRef.current) return;
    if (!code || code.length !== 6 || !phoneToVerify) {
      throw new Error(t("otp.invalidCode"));
    }

    setIsVerifying(true);
    otpVerifiedRef.current = true;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

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
      try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }

      if (!res.ok) {
        const errCode = json?.error || "";
        if (errCode === "invalid_otp")       throw new Error(t("otp.invalidCode"));
        if (errCode === "otp_expired")       throw new Error(t("otp.expiredCode"));
        if (errCode === "otp_max_attempts")  throw new Error(t("otp.maxAttempts"));
        if (errCode === "patient_not_found") throw new Error(t("otp.notFound"));
        throw new Error(json?.message || t("otp.networkError"));
      }

      if (json?.ok && json?.token) {
        await signIn({
          token:     json.token,
          patientId: json.patientId,
          name:      json.name,
          phone:     json.phone,
          email:     json.email,
          type:      "patient",
          role:      "PATIENT",
          otpVerified: true,
        });
        // If patient has no clinic → offer clinic selection onboarding
        if (json.hasClinic === false) {
          router.replace("/clinic-onboarding" as any);
        } else {
          router.replace("/(patient)" as any);
        }
      } else {
        throw new Error(t("otp.networkError"));
      }
    } catch (err: any) {
      if (err?.name === "AbortError") throw new Error(t("otp.timeout"));
      throw err;
    } finally {
      clearTimeout(timer);
      setIsVerifying(false);
    }
  }

  async function onSubmit() {
    const code        = otp.trim();
    const phoneToUse  = phoneInput.trim();

    if (!code || code.length !== 6) {
      setErrorMsg(t("otp.invalidCode"));
      return;
    }
    if (!phoneToUse) {
      setErrorMsg(t("otp.phoneRequired"));
      return;
    }

    setBusy(true);
    setErrorMsg("");
    try {
      await verifyWithServer(code, phoneToUse);
    } catch (e: any) {
      const m = e?.name === "AbortError" ? t("otp.timeout") : (e?.message || t("otp.networkError"));
      setErrorMsg(m);
      otpVerifiedRef.current = false;
    } finally {
      setBusy(false);
    }
  }

  // ── Resend ────────────────────────────────────────────────────────────────
  async function resendOTP() {
    const phoneToUse = phoneInput.trim();
    if (!phoneToUse) {
      setErrorMsg(t("otp.phoneRequired"));
      return;
    }

    setResending(true);
    setErrorMsg("");
    try {
      const res = await fetch(`${API_BASE}/auth/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneToUse, role: "PATIENT" }),
      });

      const text = await res.text();
      let json: any;
      try { json = text ? JSON.parse(text) : {}; } catch { json = {}; }

      if (!res.ok) {
        const errCode = json?.error || "";
        if (errCode === "rate_limit_exceeded") {
          setErrorMsg(t("otp.maxAttempts"));
        } else if (errCode === "email_missing_on_account") {
          setErrorMsg(t("otp.noEmailWarning"));
        } else if (errCode === "email_not_configured" || errCode === "otp_send_failed") {
          setErrorMsg(t("otp.emailNotConfigured"));
        } else {
          setErrorMsg(json?.message || t("otp.networkError"));
        }
        return;
      }

      const sentEmail = json?.email || email;
      const successMsg = sentEmail
        ? t("otp.resendSuccess").replace("{email}", maskEmail(sentEmail))
        : t("otp.sentToUnknown");
      setErrorMsg("✅ " + successMsg);
      setOtp("");
    } catch {
      setErrorMsg(t("otp.networkError"));
    } finally {
      setResending(false);
    }
  }

  // ── Subtitle text ─────────────────────────────────────────────────────────
  const subtitleText = noEmail
    ? t("otp.sentToUnknown")
    : t("otp.sentTo").replace("{email}", maskEmail(email));

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.wrap}>

        {/* Header */}
        <View style={styles.iconRow}>
          <View style={styles.iconBubble}>
            <Text style={styles.iconEmoji}>✉️</Text>
          </View>
        </View>

        <Text style={styles.h1}>{t("otp.title")}</Text>

        {/* No-email warning */}
        {noEmail ? (
          <View style={styles.warnBanner}>
            <Text style={styles.warnText}>⚠️ {t("otp.noEmailWarning")}</Text>
          </View>
        ) : (
          <Text style={styles.subtitle}>{subtitleText}</Text>
        )}

        {/* Initial email-failed warning */}
        {initialEmailFailed && !noEmail && (
          <View style={styles.failBanner}>
            <Text style={styles.failBannerText}>
              📧 {t("otp.emailFailedWarning")}
            </Text>
          </View>
        )}

        {/* Spam hint */}
        {!noEmail && (
          <Text style={styles.spamHint}>💡 {t("otp.spamHint")}</Text>
        )}

        {/* Phone input if missing */}
        {!phone && (
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>{t("otp.phoneLabel")}</Text>
            <TextInput
              value={phoneInput}
              onChangeText={v => { setPhoneInput(v); setErrorMsg(""); }}
              placeholder={t("otp.phonePlaceholder")}
              placeholderTextColor="#9CA3AF"
              keyboardType="phone-pad"
              style={styles.input}
              editable={!busy}
              autoComplete="tel"
            />
          </View>
        )}

        {/* OTP input */}
        <TextInput
          value={otp}
          onChangeText={v => { setOtp(v.replace(/\D/g, "").slice(0, 6)); setErrorMsg(""); }}
          placeholder={t("otp.codePlaceholder")}
          placeholderTextColor="#9CA3AF"
          keyboardType={Platform.OS === "web" ? "default" : "number-pad"}
          style={[styles.otpInput, errorMsg && !errorMsg.startsWith("✅") && styles.otpInputError]}
          maxLength={6}
          editable={!busy && !noEmail}
          autoFocus={!!phone && !noEmail}
          textAlign="center"
        />

        {/* Error / success message */}
        {!!errorMsg && (
          <Text style={[styles.msgText, errorMsg.startsWith("✅") ? styles.msgSuccess : styles.msgError]}>
            {errorMsg}
          </Text>
        )}

        {/* Verify button */}
        {!noEmail && (
          <Pressable
            onPress={onSubmit}
            disabled={busy || otp.length !== 6}
            style={[styles.btn, (busy || otp.length !== 6) && styles.btnDisabled]}
          >
            {busy ? (
              <View style={styles.busyRow}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.btnText}>{t("otp.verifying")}</Text>
              </View>
            ) : (
              <Text style={styles.btnText}>{t("otp.verify")}</Text>
            )}
          </Pressable>
        )}

        {/* Resend */}
        {!noEmail && (
          <Pressable
            onPress={resendOTP}
            disabled={resending || busy}
            style={[styles.linkBtn, (resending || busy) && { opacity: 0.5 }]}
          >
            {resending ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <Text style={styles.linkText}>{t("otp.resend")}</Text>
            )}
          </Pressable>
        )}

        {/* Back */}
        <Pressable
          onPress={() => router.replace("/")}
          style={styles.linkBtn}
        >
          <Text style={styles.backText}>{t("otp.back")}</Text>
        </Pressable>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  wrap: {
    padding: 28,
    maxWidth: 420,
    alignSelf: "center",
    width: "100%",
  },
  iconRow: {
    alignItems: "center",
    marginBottom: 16,
  },
  iconBubble: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: "#eff6ff",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#2563eb",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  iconEmoji: {
    fontSize: 32,
  },
  h1: {
    fontSize: 26,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 6,
  },
  spamHint: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 24,
  },
  warnBanner: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
  },
  warnText: {
    fontSize: 13,
    color: "#DC2626",
    lineHeight: 19,
    fontWeight: "600",
  },
  failBanner: {
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
  },
  failBannerText: {
    fontSize: 13,
    color: "#92400E",
    lineHeight: 19,
    fontWeight: "600",
  },
  fieldWrap: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    fontSize: 15,
    color: "#111827",
  },
  otpInput: {
    backgroundColor: "#fff",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderWidth: 2,
    borderColor: "#2563EB",
    fontWeight: "800",
    fontSize: 28,
    letterSpacing: 10,
    color: "#111827",
    marginBottom: 12,
  },
  otpInputError: {
    borderColor: "#DC2626",
  },
  msgText: {
    fontSize: 13,
    textAlign: "center",
    fontWeight: "600",
    marginBottom: 8,
    lineHeight: 18,
  },
  msgError: {
    color: "#DC2626",
  },
  msgSuccess: {
    color: "#16a34a",
  },
  btn: {
    backgroundColor: "#2563EB",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 4,
    shadowColor: "#2563EB",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  btnDisabled: {
    backgroundColor: "#9CA3AF",
    shadowOpacity: 0,
    elevation: 0,
  },
  btnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 16,
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  linkBtn: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 4,
  },
  linkText: {
    color: "#2563EB",
    fontWeight: "700",
    fontSize: 14,
  },
  backText: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "500",
  },
});
