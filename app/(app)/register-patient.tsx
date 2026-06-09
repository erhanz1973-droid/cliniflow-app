// app/register-patient.tsx
import React, { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
import { useRouter, useLocalSearchParams } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useURL } from "expo-linking";
import { usePatientRegistration } from "../../lib/patient/register";
import { classifyApiError, API_BASE } from "../../lib/api";
import {
  loadPendingOtpSession,
  pendingOtpMatchesIdentity,
  requestPatientOtp,
  savePendingOtpSession,
} from "../../lib/pendingOtpSession";
import { useAuth } from "../../lib/auth";
import { useLanguage } from "../../lib/language-context";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, type Language } from "../../lib/i18n";
import {
  runPatientOAuthWithBridge,
  type OAuthProvider,
} from "../../lib/patientOAuth";
import { getSupabaseAuthClient, isSupabaseAuthConfigured } from "../../lib/supabaseAuthClient";
import { emitAuthTelemetryV1 } from "../../lib/authTelemetry";
import {
  clearPendingClinicInvite,
  clinicCodeFromRouteParams,
  normalizeClinicInviteCode,
  parseClinicInviteFromUrl,
  resolveClinicInviteCodeForSignup,
} from "../../lib/clinicInviteStorage";
import { isValidInternationalPhone } from "../../lib/phoneFormat";

const WARMUP_TIMEOUT_MS = 30_000;

function fetchWithTimeout(url: string, options: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

export default function RegisterPatientScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    oauthComplete?: string;
    provider?: string;
    prefillClinicCode?: string;
    clinicCode?: string;
    fromClinicInvite?: string;
  }>();
  const incomingUrl = useURL();
  const fromClinicInviteFlow = useMemo(
    () =>
      String(params.fromClinicInvite || "") === "1" ||
      String(Array.isArray(params.fromClinicInvite) ? params.fromClinicInvite[0] : "") === "1",
    [params.fromClinicInvite],
  );
  const fromOauthComplete = useMemo(
    () => String(params.oauthComplete || "") === "1",
    [params.oauthComplete],
  );
  const prefillClinicParam = useMemo(
    () => clinicCodeFromRouteParams(params),
    [params.prefillClinicCode, params.clinicCode],
  );

  const routeOauthProvider = useMemo((): "google" | "apple" | null => {
    const p = params.provider;
    const s = String(Array.isArray(p) ? p[0] : p || "")
      .trim()
      .toLowerCase();
    return s === "google" || s === "apple" ? s : null;
  }, [params.provider]);

  const { signIn } = useAuth();
  const { handlePatientRegistration } = usePatientRegistration();
  const { t, currentLanguage, setLanguage } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [netError, setNetError] = useState<"network" | "warmingUp" | null>(null);
  const [infoMsg, setInfoMsg] = useState<{ text: string; goToLogin?: boolean } | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Prevents double-submit before React re-renders (e.g. double tap, strict mode). */
  const registerInFlightRef = useRef(false);

  const [formData, setFormData] = useState(() => ({
    clinicCode: clinicCodeFromRouteParams(params),
    phone: "",
    patientName: "",
    email: "",
    password: "",
    confirmPassword: "",
    referralCode: "",
  }));
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingOtpResume, setPendingOtpResume] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthStatusMsg, setOauthStatusMsg] = useState("");
  const [inviteLocked, setInviteLocked] = useState(fromClinicInviteFlow);
  /** OAuth session email — locked on form so token email always matches registration. */
  const [oauthSessionEmail, setOauthSessionEmail] = useState<string | null>(null);
  const oauthConfigured = isSupabaseAuthConfigured();

  const applyInvitePrefill = useCallback(async () => {
    const urlCode = parseClinicInviteFromUrl(incomingUrl);
    const resolved = await resolveClinicInviteCodeForSignup(
      prefillClinicParam || urlCode || undefined,
    );
    const code = normalizeClinicInviteCode(resolved.code || urlCode || prefillClinicParam);
    if (!code) return;
    setFormData((prev) => (prev.clinicCode === code ? prev : { ...prev, clinicCode: code }));
    if (fromClinicInviteFlow || resolved.viaInvitation || urlCode) {
      setInviteLocked(true);
    }
  }, [fromClinicInviteFlow, incomingUrl, prefillClinicParam]);

  useEffect(() => {
    void applyInvitePrefill();
  }, [applyInvitePrefill]);

  useFocusEffect(
    useCallback(() => {
      void applyInvitePrefill();
    }, [applyInvitePrefill]),
  );

  const syncOauthSessionPrefill = useCallback(async () => {
    const supa = getSupabaseAuthClient();
    if (!supa) return;
    const { data } = await supa.auth.getSession();
    if (!data.session?.user) return;
    const u = data.session.user;
    const ids = Array.isArray(u.identities) ? u.identities : [];
    const hasOauth = ids.some((i) =>
      ["google", "apple"].includes(String(i?.provider || "").toLowerCase()),
    );
    if (!hasOauth && !fromOauthComplete) return;
    const meta = (u.user_metadata || {}) as Record<string, unknown>;
    const email = String(u.email || meta.email || "").trim();
    const gn = String(meta.given_name || "").trim();
    const fn = String(meta.family_name || "").trim();
    const name = String(meta.full_name || meta.name || [gn, fn].filter(Boolean).join(" ")).trim();
    if (email) setOauthSessionEmail(email);
    setFormData((prev) => ({
      ...prev,
      email: email || prev.email,
      patientName: name || prev.patientName,
      clinicCode: (prefillClinicParam || prev.clinicCode).toUpperCase(),
    }));
  }, [fromOauthComplete, prefillClinicParam]);

  useEffect(() => {
    void syncOauthSessionPrefill();
  }, [syncOauthSessionPrefill]);

  const applyCliniflySessionFromPayload = async (payload: Record<string, unknown>, phoneFallback: string) => {
    const token = String(payload.token || "");
    if (!token) throw new Error(t("login.loginFailed"));
    await signIn({
      token,
      id: String(payload.id || payload.patientId || ""),
      patientId: String(payload.patientId || payload.id || ""),
      type: "patient",
      role: (payload.role as string) || "PATIENT",
      phone: String(payload.phone || phoneFallback || ""),
      name: String(payload.name || ""),
      email: String(payload.email || ""),
      clinicId: payload.clinicId as string | undefined,
      clinicCode: payload.clinicCode as string | undefined,
      status: payload.status as string | undefined,
      language: payload.language as string | undefined,
      referralCode: (payload.referralCode as string | null) ?? null,
    });
    await clearPendingClinicInvite().catch(() => {});
    router.replace("/(patient)" as const);
  };

  const runRegisterOAuth = async (provider: OAuthProvider) => {
    if (!oauthConfigured) {
      Alert.alert(t("common.error"), t("login.oauthNotConfigured"));
      return;
    }
    setOauthLoading(true);
    setOauthStatusMsg(t("login.connecting"));
    try {
      try {
        await fetchWithTimeout(`${API_BASE}/api/health`, {}, WARMUP_TIMEOUT_MS);
      } catch {
        throw new Error(t("login.timeout"));
      }
      setOauthStatusMsg(t("login.loggingIn"));
      const r = await runPatientOAuthWithBridge({
        provider,
        clinicCode: formData.clinicCode.trim() || undefined,
      });
      if (r.ok === false) {
        if (r.step === "not_configured") {
          Alert.alert(t("common.error"), t("login.oauthNotConfigured"));
          return;
        }
        if (r.step === "native") {
          const m = r.message;
          if (m === "oauth_cancelled") return;
          if (m === "apple_ios_only" || m === "apple_unavailable") {
            Alert.alert(t("common.error"), t("login.appleNotAvailable"));
            return;
          }
          if (m === "apple_credential_invalid") {
            Alert.alert(t("common.error"), t("login.appleCredentialInvalid"));
            return;
          }
          Alert.alert(t("common.error"), m || t("login.loginFailed"));
          return;
        }
        if (r.step === "bridge") {
          if (r.code === "patient_not_found") {
            emitAuthTelemetryV1("oauth_patient_profile_missing", { provider, surface: "register" });
            Alert.alert(t("login.error"), t("login.oauthPatientNotLinked"));
            return;
          }
          if (r.code === "patient_merge_conflict") {
            Alert.alert(t("login.error"), t("login.oauthMergeConflict"));
            return;
          }
          if (r.code === "oauth_provider_mismatch") {
            Alert.alert(t("login.error"), t("login.oauthProviderMismatch"));
            return;
          }
          Alert.alert(t("common.error"), r.message || t("login.loginFailed"));
          return;
        }
        Alert.alert(t("common.error"), t("login.loginFailed"));
        return;
      }
      await applyCliniflySessionFromPayload(r.payload, formData.phone.trim());
      emitAuthTelemetryV1("oauth_login_success", { provider, surface: "register" });
    } catch (e: unknown) {
      const err = e as { message?: string };
      Alert.alert(t("common.error"), err?.message || t("login.loginFailed"));
    } finally {
      setOauthLoading(false);
      setOauthStatusMsg("");
    }
  };

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
    if (!isValidInternationalPhone(formData.phone.trim())) {
      Alert.alert(t("common.error"), t("register.phoneInvalidFormat"));
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

      let oauthLink: { supabaseAccessToken: string; oauthProvider: "google" | "apple" } | undefined;
      let registrationEmail = formData.email.trim();
      const supa = getSupabaseAuthClient();
      if (supa) {
        let { data: sessData } = await supa.auth.getSession();
        let tok = sessData.session?.access_token?.trim();
        if (!tok) {
          const { data: refData, error: refErr } = await supa.auth.refreshSession();
          if (!refErr && refData.session?.access_token) {
            tok = refData.session.access_token.trim();
            sessData = refData;
          }
        }
        if (tok) {
          let prov: "google" | "apple" | null = routeOauthProvider;
          if (!prov) {
            const u = sessData.session?.user;
            const ids = Array.isArray(u?.identities) ? u.identities : [];
            const hit = ids.find((i) =>
              ["google", "apple"].includes(String(i?.provider || "").toLowerCase()),
            );
            const raw = hit?.provider != null ? String(hit.provider).toLowerCase() : "";
            if (raw === "google" || raw === "apple") prov = raw;
          }
          if (prov === "google" || prov === "apple") {
            oauthLink = { supabaseAccessToken: tok, oauthProvider: prov };
            const oauthEmail = String(sessData.session?.user?.email || "").trim();
            if (oauthEmail) registrationEmail = oauthEmail;
          }
        }
      }

      await handlePatientRegistration({
        name: formData.patientName,
        email: registrationEmail,
        phone: formData.phone,
        clinicCode: formData.clinicCode.trim() || undefined,
        joinedViaInvitation: inviteLocked && Boolean(formData.clinicCode.trim()),
        password: formData.password,
        inviterReferralCode: normalizedReferral || undefined,
        language: currentLanguage,
        ...(oauthLink ? oauthLink : {}),
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
          else if (code === "email_oauth_mismatch") friendlyMsg = t("register.emailOauthMismatch");
          else if (code === "invalid_phone" || msg.includes("invalid_phone")) {
            friendlyMsg = t("register.phoneInvalidFormat");
          }
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
        <View style={styles.langSection}>
          <Text style={styles.langLabel}>{t("settings.selectLanguage")}</Text>
          <View style={styles.langRow}>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <Pressable
                key={lang}
                style={[styles.langBtn, currentLanguage === lang && styles.langBtnActive]}
                onPress={() => void setLanguage(lang as Language)}
                disabled={loading || oauthLoading}
              >
                <Text
                  style={[
                    styles.langBtnText,
                    currentLanguage === lang && styles.langBtnTextActive,
                  ]}
                >
                  {LANGUAGE_NAMES[lang as Language]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <Text style={styles.title}>{t("register.patientTitle")}</Text>

        {fromOauthComplete && (
          <View style={styles.oauthBanner}>
            <Text style={styles.oauthBannerTitle}>{t("register.oauthCompleteBannerTitle")}</Text>
            <Text style={styles.oauthBannerHint}>{t("register.oauthCompleteBannerHint")}</Text>
          </View>
        )}

        {oauthConfigured && (
          <View style={styles.oauthBlock}>
            <Pressable
              style={[styles.oauthGoogleBtn, (loading || oauthLoading) && styles.oauthBtnDisabled]}
              onPress={() => void runRegisterOAuth("google")}
              disabled={loading || oauthLoading}
            >
              <Text style={styles.oauthGoogleText}>{t("login.continueWithGoogle")}</Text>
            </Pressable>
            {Platform.OS === "ios" && (
              <Pressable
                style={[styles.oauthAppleBtn, (loading || oauthLoading) && styles.oauthBtnDisabled]}
                onPress={() => void runRegisterOAuth("apple")}
                disabled={loading || oauthLoading}
              >
                <Text style={styles.oauthAppleText}>{t("login.continueWithApple")}</Text>
              </Pressable>
            )}
            <Text style={styles.orDivider}>{t("login.orDivider")}</Text>
            <Text style={styles.orSubtext}>{t("register.oauthDivider")}</Text>
          </View>
        )}

        {(oauthLoading || !!oauthStatusMsg) && (
          <View style={styles.oauthLoadingRow}>
            <ActivityIndicator size="small" color="#2563EB" />
            {!!oauthStatusMsg && <Text style={styles.oauthLoadingText}>{oauthStatusMsg}</Text>}
          </View>
        )}

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

        {inviteLocked && formData.clinicCode ? (
          <View style={styles.inviteBanner}>
            <Text style={styles.inviteBannerText}>
              {t("clinicInvite.linkedClinic", { code: formData.clinicCode })}
            </Text>
          </View>
        ) : (
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
        )}

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
            placeholder="+90 555 123 4567"
            placeholderTextColor="#9CA3AF"
          />
          <Text style={styles.phoneHint}>{t("register.phoneHint")}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t("register.patientEmail")}</Text>
          <TextInput
            style={[styles.input, oauthSessionEmail ? styles.inputReadOnly : null]}
            value={formData.email}
            onChangeText={(text) => setFormData({ ...formData, email: text })}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!oauthSessionEmail}
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
          style={[styles.submitBtn, (loading || oauthLoading) && styles.submitBtnDisabled]}
          onPress={handleRegister}
          disabled={loading || oauthLoading}
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
  langSection: {
    marginBottom: 16,
  },
  langLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
    marginBottom: 10,
  },
  langRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 8,
  },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#fff",
  },
  langBtnActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  langBtnText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  langBtnTextActive: {
    color: "#fff",
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
  phoneHint: {
    fontSize: 12,
    color: "#9CA3AF",
    lineHeight: 17,
    marginTop: 6,
  },
  inputReadOnly: {
    backgroundColor: "#F3F4F6",
    color: "#6B7280",
  },

  inviteBanner: {
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  inviteBannerText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#047857",
    textAlign: "center",
  },
  oauthBanner: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  oauthBannerTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1D4ED8",
    marginBottom: 6,
  },
  oauthBannerHint: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 17,
  },
  oauthBlock: {
    marginBottom: 4,
  },
  oauthGoogleBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  oauthGoogleText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  oauthAppleBtn: {
    backgroundColor: "#000",
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 10,
  },
  oauthAppleText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  oauthBtnDisabled: { opacity: 0.55 },
  orDivider: {
    textAlign: "center",
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 4,
  },
  orSubtext: {
    textAlign: "center",
    fontSize: 12,
    color: "#9CA3AF",
    marginBottom: 12,
  },
  oauthLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  oauthLoadingText: {
    fontSize: 13,
    color: "#4B5563",
  },
});
