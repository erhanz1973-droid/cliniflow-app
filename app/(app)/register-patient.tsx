// app/register-patient.tsx
import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { usePatientRegistration } from "../../lib/patient/register";
import { classifyApiError } from "../../lib/api";
import { useLanguage } from "../../lib/language-context";
import {
  loadPendingOtpSession,
  pendingOtpMatchesIdentity,
  requestPatientOtp,
  savePendingOtpSession,
} from "../../lib/pendingOtpSession";

export default function RegisterPatientScreen() {
  const router = useRouter();
  const { handlePatientRegistration } = usePatientRegistration();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [netError, setNetError] = useState<"network" | "warmingUp" | null>(null);
  const [infoMsg, setInfoMsg] = useState<{ text: string; goToLogin?: boolean } | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Prevents double-submit before React re-renders (e.g. double tap, strict mode). */
  const registerInFlightRef = useRef(false);

  const [formData, setFormData] = useState({
    clinicCode: "",
    phone: "",
    patientName: "",
    email: "",
    password: "",
    confirmPassword: "",
    referralCode: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingOtpResume, setPendingOtpResume] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const s = await loadPendingOtpSession();
        if (!cancelled) setPendingOtpResume(!!s);
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  async function tryResumeOtpAfterDuplicate(err: any): Promise<boolean> {
    const pending = await loadPendingOtpSession();
    if (
      pending &&
      pendingOtpMatchesIdentity(pending, { phone: formData.phone, email: formData.email })
    ) {
      router.replace({
        pathname: "/otp" as any,
        params: {
          phone: pending.phone || formData.phone,
          email: pending.email || formData.email,
          patientId: pending.patientId || "",
          clinicCode: pending.clinicCode || formData.clinicCode.trim().toUpperCase(),
          source: "patient",
          flow: pending.flow,
          emailSent: pending.emailSent === "0" ? "0" : "1",
        },
      });
      return true;
    }
    const otpTry = await requestPatientOtp({
      phone: formData.phone,
      email: formData.email.trim() || undefined,
      clinicCode: formData.clinicCode.trim() || undefined,
    });
    if (otpTry.ok) {
      const raw = otpTry.raw || {};
      const pid = typeof raw.patientId === "string" ? String(raw.patientId) : "";
      await savePendingOtpSession({
        email: formData.email.trim(),
        phone: formData.phone,
        patientId: pid,
        clinicCode: formData.clinicCode.trim().toUpperCase(),
        flow: "register",
        emailSent: "1",
      });
      router.replace({
        pathname: "/otp" as any,
        params: {
          phone: formData.phone,
          email: formData.email.trim(),
          patientId: pid,
          clinicCode: formData.clinicCode.trim().toUpperCase(),
          source: "patient",
          flow: "register",
          emailSent: "1",
        },
      });
      return true;
    }
    return false;
  }

  const handleRegister = async () => {
    if (registerInFlightRef.current) return;
    if (!formData.phone || !formData.patientName) {
      Alert.alert(t("common.error"), t("register.patientFillRequired"));
      return;
    }
    if (!formData.password || formData.password.length < 6) {
      Alert.alert(t("common.error"), t("register.passwordTooShort"));
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      Alert.alert(t("common.error"), t("register.passwordMismatch"));
      return;
    }

    setNetError(null);
    setInfoMsg(null);
    registerInFlightRef.current = true;
    setLoading(true);

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    try {
      const normalizedReferral = formData.referralCode.trim().toUpperCase();
      await handlePatientRegistration({
        name: formData.patientName,
        email: formData.email,
        phone: formData.phone,
        clinicCode: formData.clinicCode,
        password: formData.password,
        inviterReferralCode: normalizedReferral || undefined,
      });
    } catch (error: any) {
      const kind = classifyApiError(error);

      if (kind === "network" || kind === "warmingUp") {
        setNetError(kind === "warmingUp" ? "warmingUp" : "network");
        if (kind === "warmingUp") {
          retryTimerRef.current = setTimeout(() => handleRegister(), 30_000);
        }
      } else {
        const msg = String(error?.message || "");
        const code = String(error?.code || error?.registerResult?.error || "");
        const isDuplicate =
          code === "user_already_exists" ||
          code === "phone_already_registered" ||
          msg.includes("phone_already_exists") ||
          msg.includes("phone_already_registered") ||
          msg.includes("email_already_exists") ||
          msg.includes("user_already_exists");

        if (isDuplicate) {
          const resumed = await tryResumeOtpAfterDuplicate(error);
          if (resumed) return;
          if (code === "phone_already_registered" || msg.includes("phone_already")) {
            setInfoMsg({
              text: `${t("register.patientAlreadyExists")}\n\n${t("register.resumeOtpHint")}`,
              goToLogin: true,
            });
          } else if (msg.includes("email_already") || code === "user_already_exists") {
            setInfoMsg({
              text: `${t("register.patientEmailExists")}\n\n${t("register.resumeOtpHint")}`,
              goToLogin: true,
            });
          } else {
            setInfoMsg({
              text: `${t("register.patientAlreadyExists")}\n\n${t("register.resumeOtpHint")}`,
              goToLogin: true,
            });
          }
        } else {
          let friendlyMsg = t("common.serverError");
          if (msg.includes("missing_required_fields")) friendlyMsg = t("register.patientFillRequired2");
          else if (msg.includes("invalid_clinic")) friendlyMsg = t("register.invalidClinic");
          else if (msg.includes("email_required")) friendlyMsg = t("register.emailRequired");
          else if (msg.includes("invalid_referral")) friendlyMsg = t("register.invalidReferralCode");
          Alert.alert(t("common.error"), friendlyMsg);
        }
      }
    } finally {
      registerInFlightRef.current = false;
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>{t("register.patientTitle")}</Text>

        {pendingOtpResume && (
          <Pressable
            style={styles.resumeBanner}
            onPress={() =>
              router.replace({
                pathname: "/otp" as any,
                params: { source: "patient" },
              })
            }
          >
            <Text style={styles.resumeBannerTitle}>{t("register.resumeOtpVerification")}</Text>
            <Text style={styles.resumeBannerHint}>{t("register.resumeOtpHint")}</Text>
          </Pressable>
        )}

        {/* Soft info notice (phone/email already registered) */}
        {infoMsg && (
          <View style={styles.infoBanner}>
            <Text style={styles.infoIcon}>ℹ️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoText}>{infoMsg.text}</Text>
              {infoMsg.goToLogin && (
                <TouchableOpacity onPress={() => router.push("/login/patient" as any)}>
                  <Text style={styles.infoLink}>{t("register.goToLogin")} →</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* Cold-start / network error banner */}
        {netError && (
          <View style={[styles.errorBanner, netError === "warmingUp" && styles.warmBanner]}>
            <Text style={styles.errorIcon}>{netError === "warmingUp" ? "⏳" : "📡"}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.errorTitle}>
                {netError === "warmingUp"
                  ? t("register.serverStarting")
                  : t("register.networkError")}
              </Text>
              <Text style={styles.errorSub}>
                {netError === "warmingUp"
                  ? t("register.serverStartingMsg")
                  : t("register.networkErrorMsg")}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>
            {t("auth.clinic_code")} ({t("common.optional")})
          </Text>
          <TextInput
            style={styles.input}
            value={formData.clinicCode}
            onChangeText={(text) => setFormData({ ...formData, clinicCode: text.toUpperCase() })}
            autoCapitalize="characters"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("auth.full_name")}</Text>
          <TextInput
            style={styles.input}
            value={formData.patientName}
            onChangeText={(text) => setFormData({ ...formData, patientName: text })}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("auth.phone")}</Text>
          <TextInput
            style={styles.input}
            value={formData.phone}
            onChangeText={(text) => setFormData({ ...formData, phone: text })}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("register.patientEmail")}</Text>
          <TextInput
            style={styles.input}
            value={formData.email}
            onChangeText={(text) => setFormData({ ...formData, email: text })}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("auth.password_create")}</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              style={styles.passwordInput}
              value={formData.password}
              onChangeText={(text) => setFormData({ ...formData, password: text })}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
            <Pressable onPress={() => setShowPassword(v => !v)} style={styles.eyeBtn}>
              <Text style={styles.eyeIcon}>{showPassword ? "🙈" : "👁️"}</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("register.confirmPassword")}</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              style={styles.passwordInput}
              value={formData.confirmPassword}
              onChangeText={(text) => setFormData({ ...formData, confirmPassword: text })}
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
            <Pressable onPress={() => setShowConfirm(v => !v)} style={styles.eyeBtn}>
              <Text style={styles.eyeIcon}>{showConfirm ? "🙈" : "👁️"}</Text>
            </Pressable>
          </View>
        </View>
        {formData.confirmPassword.length > 0 && formData.password !== formData.confirmPassword && (
          <Text style={styles.passwordHint}>{t("register.passwordMismatch")}</Text>
        )}

        {/* Referral Code (optional) */}
        <View style={styles.referralWrapper}>
          <View style={styles.referralLabelRow}>
            <Text style={styles.label}>{t("register.referralCode")}</Text>
            <View style={styles.optionalBadge}>
              <Text style={styles.optionalBadgeText}>{t("common.optional")}</Text>
            </View>
          </View>
          <TextInput
            style={styles.referralInput}
            value={formData.referralCode}
            onChangeText={(text) => setFormData({ ...formData, referralCode: text })}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
          />
          <Text style={styles.referralHint}>{t("register.referralCodeHint")}</Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
          onPress={handleRegister}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.submitBtnText}>
              {netError ? t("common.retry") : t("register.patientSubmit")}
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => router.push("/register-doctor" as any)}
        >
          <Text style={styles.linkText}>{t("register.isDoctor")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.linkBtn}
          onPress={() => router.push("/login/patient" as any)}
        >
          <Text style={styles.linkText}>{t("login.loginButton")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    justifyContent: "center",
    flexGrow: 1,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 20,
  },
  resumeBanner: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  resumeBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1D4ED8",
    marginBottom: 6,
  },
  resumeBannerHint: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 17,
  },
  field: {
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#F9FAFB",
    padding: 14,
    borderRadius: 10,
    fontSize: 15,
    color: "#111827",
  },
  submitBtn: {
    backgroundColor: "#16a34a",
    padding: 15,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 4,
    marginBottom: 14,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },
  linkBtn: {
    alignItems: "center",
    paddingVertical: 10,
  },
  linkText: {
    color: "#2563EB",
    fontSize: 14,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  warmBanner: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  errorIcon: {
    fontSize: 22,
  },
  errorTitle: {
    fontWeight: "700",
    fontSize: 14,
    color: "#111827",
    marginBottom: 2,
  },
  errorSub: {
    fontSize: 12,
    color: "#6B7280",
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FCD34D",
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    gap: 10,
  },
  infoIcon: {
    fontSize: 18,
  },
  infoText: {
    fontSize: 13,
    color: "#374151",
    marginBottom: 6,
  },
  infoLink: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },

  // ── Password fields ───────────────────────────────────────────────────
  passwordWrapper: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: "#D1D5DB", backgroundColor: "#F9FAFB",
    borderRadius: 10, paddingRight: 12,
  },
  passwordInput: {
    flex: 1, padding: 14, fontSize: 15, color: "#111827",
  },
  eyeBtn: { padding: 4 },
  eyeIcon: { fontSize: 18 },
  passwordHint: { color: "#DC2626", fontSize: 12, marginTop: -10, marginBottom: 10, marginLeft: 4 },

  // ── Referral code field ───────────────────────────────────────────────
  referralWrapper: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderStyle: "dashed",
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    backgroundColor: "#F9FAFB",
  },
  referralLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  optionalBadge: {
    backgroundColor: "#E5E7EB",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  optionalBadgeText: {
    fontSize: 11,
    color: "#6B7280",
    fontWeight: "500",
  },
  referralInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    fontSize: 15,
    color: "#111827",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  referralHint: {
    fontSize: 12,
    color: "#9CA3AF",
    lineHeight: 17,
  },
});
