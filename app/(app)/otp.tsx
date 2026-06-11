// app/otp.tsx — Resumable patient OTP (persisted session for background / navigation loss)
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../lib/auth";
import { useLanguage } from "../../lib/language-context";
import { API_BASE, ADMIN_API_BASE } from "../../lib/api";
import { trackMetaCompleteRegistration } from "../../lib/metaAppEvents";
import {
  clearPendingOtpSession,
  loadPendingOtpSession,
  resendCooldownRemainingSec,
  savePendingOtpSession,
  touchPendingOtpResend,
  type PendingOtpFlow,
} from "../../lib/pendingOtpSession";

const VERIFY_TIMEOUT_MS = 10_000;

/** Masks an email: "john.doe@gmail.com" → "jo***@gmail.com" */
function maskEmail(email: string): string {
  if (!email) return "";
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

type OtpCtx = {
  email: string;
  phone: string;
  patientId: string;
  clinicCode: string;
  flow: PendingOtpFlow;
  emailSentParam: string;
};

export default function OtpScreen() {
  const { signIn } = useAuth();
  const { t } = useLanguage();
  const params = useLocalSearchParams();

  const source = (params.source as string) || "";

  // Doctors must never land here
  if (source === "doctor") {
    throw new Error("OTP is not allowed for doctors");
  }

  const [ctx, setCtx] = useState<OtpCtx>(() => ({
    email: String(params.email || "").trim(),
    phone: String(params.phone || "").trim(),
    patientId: String(params.patientId || "").trim(),
    clinicCode: String(params.clinicCode || params.clinic_code || "")
      .trim()
      .toUpperCase(),
    flow: (params.flow as PendingOtpFlow) === "login" ? "login" : "register",
    emailSentParam: (params.emailSent as string) ?? "1",
  }));

  const [hydrated, setHydrated] = useState(false);
  const [otp, setOtp] = useState("");
  const [phoneInput, setPhoneInput] = useState(String(params.phone || "").trim());
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [resendWaitSec, setResendWaitSec] = useState(0);
  const otpVerifiedRef = useRef(false);
  const autoResendDoneRef = useRef(false);

  const email = ctx.email;
  const patientId = ctx.patientId;
  const initialEmailFailed = ctx.emailSentParam === "0";

  const noEmail = !email.trim();

  const persistFromCtx = useCallback(
    async (c: OtpCtx) => {
      const hasChannel =
        !!String(c.phone || "").replace(/\D/g, "") || !!String(c.patientId || "").trim() || !!String(c.email || "").trim();
      if (!hasChannel) return;
      await savePendingOtpSession({
        email: c.email,
        phone: c.phone,
        patientId: c.patientId,
        clinicCode: c.clinicCode,
        flow: c.flow,
        emailSent: c.emailSentParam === "0" ? "0" : "1",
      });
    },
    [],
  );

  // Merge route params + AsyncStorage; refresh persisted session
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fromParams: OtpCtx = {
        email: String(params.email || "").trim(),
        phone: String(params.phone || "").trim(),
        patientId: String(params.patientId || "").trim(),
        clinicCode: String(params.clinicCode || params.clinic_code || "")
          .trim()
          .toUpperCase(),
        flow: (params.flow as PendingOtpFlow) === "login" ? "login" : "register",
        emailSentParam: (params.emailSent as string) ?? "1",
      };

      const stored = await loadPendingOtpSession();
      const merged: OtpCtx = {
        email: fromParams.email || (stored?.email ?? ""),
        phone: fromParams.phone || (stored?.phone ?? ""),
        patientId: fromParams.patientId || (stored?.patientId ?? ""),
        clinicCode: fromParams.clinicCode || (stored?.clinicCode ?? ""),
        flow: stored?.flow === "login" || fromParams.flow === "login" ? "login" : "register",
        emailSentParam: fromParams.emailSentParam || (stored?.emailSent === "0" ? "0" : "1"),
      };

      const hasPhone = !!merged.phone.replace(/\D/g, "");
      const hasPid = !!merged.patientId.trim();
      const hasEmail = !!merged.email.trim();

      if (!hasPhone && !hasPid && !hasEmail) {
        if (!cancelled) {
          setHydrated(true);
          router.replace("/");
        }
        return;
      }

      await persistFromCtx(merged);
      const wait = resendCooldownRemainingSec(stored);
      if (!cancelled) {
        setCtx(merged);
        setPhoneInput(merged.phone || fromParams.phone || "");
        setResendWaitSec(wait);
        setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run when deep-link params change
  }, [params.email, params.phone, params.patientId, params.clinicCode, params.clinic_code, params.flow, params.emailSent]);

  useEffect(() => {
    if (resendWaitSec <= 0) return;
    const id = setTimeout(() => setResendWaitSec((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => clearTimeout(id);
  }, [resendWaitSec]);

  // ── Guard: redirect if missing both phone and patientId ──────────────────
  useEffect(() => {
    if (!hydrated) return;
    const ph = phoneInput.trim() || ctx.phone.trim();
    const hasPhone = !!ph.replace(/\D/g, "");
    if (!hasPhone && !ctx.patientId.trim() && !ctx.email.trim()) {
      router.replace("/");
    }
  }, [hydrated, phoneInput, ctx.phone, ctx.patientId, ctx.email]);

  // ── Auto-resend if initial email failed ──────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    if (initialEmailFailed && !noEmail && !autoResendDoneRef.current) {
      autoResendDoneRef.current = true;
      const timer = setTimeout(() => resendOTP(), 800);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // ── Verify ────────────────────────────────────────────────────────────────
  async function verifyWithServer(code: string) {
    if (isVerifying || otpVerifiedRef.current) return;
    if (!code || code.length !== 6) {
      throw new Error(t("otp.invalidCode"));
    }

    const phoneToVerify = phoneInput.trim() || ctx.phone.trim();
    const hasPh = !!phoneToVerify.replace(/\D/g, "");
    if (!hasPh && !email.trim()) {
      throw new Error(t("otp.phoneRequired"));
    }

    setIsVerifying(true);
    otpVerifiedRef.current = true;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);

    try {
      const body: Record<string, unknown> = {
        otp: code,
        type: "patient",
      };
      if (email.trim()) body.email = email.trim();
      if (hasPh) body.phone = phoneToVerify;
      if (ctx.clinicCode) {
        body.clinicCode = ctx.clinicCode;
        body.clinic_code = ctx.clinicCode;
      }

      const res = await fetch(`${ADMIN_API_BASE}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const text = await res.text();
      let json: any;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }

      if (!res.ok) {
        const errCode = json?.error || "";
        if (errCode === "invalid_otp") throw new Error(t("otp.invalidCode"));
        if (errCode === "otp_expired") throw new Error(t("otp.expiredCode"));
        if (errCode === "otp_max_attempts") throw new Error(t("otp.maxAttempts"));
        if (errCode === "patient_not_found") throw new Error(t("otp.notFound"));
        throw new Error(json?.message || t("otp.networkError"));
      }

      if (json?.ok && json?.token) {
        if (ctx.flow === "register") {
          trackMetaCompleteRegistration("otp");
        }
        await clearPendingOtpSession();
        await signIn({
          token: json.token,
          patientId: json.patientId,
          name: json.name,
          phone: json.phone,
          email: json.email,
          type: "patient",
          role: "PATIENT",
          otpVerified: true,
        });
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
    const code = otp.trim();
    const phoneToUse = phoneInput.trim() || ctx.phone.trim();
    const hasPh = !!phoneToUse.replace(/\D/g, "");

    if (!code || code.length !== 6) {
      setErrorMsg(t("otp.invalidCode"));
      return;
    }
    if (!hasPh && !ctx.email.trim()) {
      setErrorMsg(t("otp.phoneRequired"));
      return;
    }

    setBusy(true);
    setErrorMsg("");
    try {
      await verifyWithServer(code);
    } catch (e: any) {
      const m = e?.name === "AbortError" ? t("otp.timeout") : e?.message || t("otp.networkError");
      setErrorMsg(m);
      otpVerifiedRef.current = false;
    } finally {
      setBusy(false);
    }
  }

  // ── Resend ────────────────────────────────────────────────────────────────
  async function resendOTP() {
    const phoneToUse = phoneInput.trim() || ctx.phone.trim();
    const hasPh = !!phoneToUse.replace(/\D/g, "");
    if (!hasPh && !email.trim()) {
      setErrorMsg(t("otp.phoneRequired"));
      return;
    }
    if (resendWaitSec > 0) return;

    setResending(true);
    setErrorMsg("");
    try {
      const body: Record<string, unknown> = {
        role: "PATIENT",
      };
      if (hasPh) body.phone = phoneToUse;
      if (email.trim()) body.email = email.trim();
      if (ctx.clinicCode) {
        body.clinicCode = ctx.clinicCode;
        body.clinic_code = ctx.clinicCode;
      }

      const res = await fetch(`${API_BASE}/auth/request-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const text = await res.text();
      let json: any;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = {};
      }

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

      await touchPendingOtpResend();
      setResendWaitSec(60);

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

  if (!hydrated) {
    return (
      <View style={[styles.scrollContent, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={{ marginTop: 12, color: "#64748b" }}>{t("common.loading")}</Text>
      </View>
    );
  }

  const phoneForChannel = phoneInput.trim() || ctx.phone.trim();
  const hasPhoneDigits = !!phoneForChannel.replace(/\D/g, "").length;
  /** Backend accepts email or phone for verify/resend. */
  const hasVerifyChannel = hasPhoneDigits || !noEmail;

  // ── Subtitle text ─────────────────────────────────────────────────────────
  const subtitleText = noEmail ? t("otp.sentToUnknown") : t("otp.sentTo").replace("{email}", maskEmail(email));

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
            <Text style={styles.failBannerText}>📧 {t("otp.emailFailedWarning")}</Text>
          </View>
        )}

        {/* Spam hint */}
        {!noEmail && <Text style={styles.spamHint}>💡 {t("otp.spamHint")}</Text>}

        {/* Phone input if missing */}
        {!ctx.phone.trim() && (
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>{t("otp.phoneLabel")}</Text>
            <TextInput
              value={phoneInput}
              onChangeText={(v) => {
                setPhoneInput(v);
                setErrorMsg("");
              }}
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
          onChangeText={(v) => {
            setOtp(v.replace(/\D/g, "").slice(0, 6));
            setErrorMsg("");
          }}
          placeholder={t("otp.codePlaceholder")}
          placeholderTextColor="#9CA3AF"
          keyboardType={Platform.OS === "web" ? "default" : "number-pad"}
          style={[styles.otpInput, errorMsg && !errorMsg.startsWith("✅") && styles.otpInputError]}
          maxLength={6}
          editable={!busy && hasVerifyChannel}
          autoFocus={hasVerifyChannel}
          textAlign="center"
        />

        {/* Error / success message */}
        {!!errorMsg && (
          <Text style={[styles.msgText, errorMsg.startsWith("✅") ? styles.msgSuccess : styles.msgError]}>{errorMsg}</Text>
        )}

        {/* Verify — email-only or phone channel */}
        {hasVerifyChannel && (
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
        {hasVerifyChannel && (
          <Pressable
            onPress={resendOTP}
            disabled={resending || busy || resendWaitSec > 0}
            style={[styles.linkBtn, (resending || busy || resendWaitSec > 0) && { opacity: 0.5 }]}
          >
            {resending ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <Text style={styles.linkText}>
                {resendWaitSec > 0 ? t("otp.resendIn").replace("{seconds}", String(resendWaitSec)) : t("otp.resend")}
              </Text>
            )}
          </Pressable>
        )}

        <Pressable
          onPress={async () => {
            await clearPendingOtpSession();
            router.replace(ctx.flow === "login" ? ("/login/patient" as any) : ("/register-patient" as any));
          }}
          style={styles.linkBtn}
        >
          <Text style={styles.linkText}>{t("otp.changeContact")}</Text>
        </Pressable>

        {/* Back */}
        <Pressable
          onPress={() => {
            void persistFromCtx({ ...ctx, phone: phoneInput.trim() || ctx.phone });
            router.replace("/");
          }}
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
