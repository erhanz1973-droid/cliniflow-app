import React, { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { useAuth } from "../../../lib/auth";
import { API_BASE } from "../../../lib/api";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "../../../lib/language-context";
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, Language } from "../../../lib/i18n";
import { ROLE_KEY } from "../(auth)/role-select";
import { loadPendingOtpSession, savePendingOtpSession } from "../../../lib/pendingOtpSession";
import { useFocusEffect } from "@react-navigation/native";
import { isSupabaseAuthConfigured } from "../../../lib/supabaseAuthClient";
import {
  runPatientOAuthWithBridge,
  type OAuthProvider,
} from "../../../lib/patientOAuth";
import { emitAuthTelemetryV1 } from "../../../lib/authTelemetry";

const WARMUP_TIMEOUT_MS = 30_000;
const LOGIN_TIMEOUT_MS = 15_000;

function fetchWithTimeout(url: string, options: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

function looksLikeEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim());
}

export default function PatientLoginScreen() {
  const { signIn } = useAuth();
  const router = useRouter();
  const { t, currentLanguage, setLanguage } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [clinicCode, setClinicCode] = useState("");
  const [pendingOtpResume, setPendingOtpResume] = useState(false);
  const [showPhoneSection, setShowPhoneSection] = useState(false);
  const warmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const oauthConfigured = isSupabaseAuthConfigured();

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

  const clearWarmup = () => {
    if (warmupTimerRef.current) {
      clearTimeout(warmupTimerRef.current);
      warmupTimerRef.current = null;
    }
  };

  const applyCliniflySession = async (payload: Record<string, unknown>, phoneFallback: string) => {
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
    router.replace("/(patient)" as const);
  };

  const runOAuth = async (provider: OAuthProvider) => {
    if (!oauthConfigured) {
      Alert.alert(t("login.error"), t("login.oauthNotConfigured"));
      return;
    }
    setLoading(true);
    setErrorMsg("");
    setStatusMsg(t("login.connecting"));
    warmupTimerRef.current = setTimeout(() => {
      setStatusMsg(t("login.warmingUp"));
    }, 4000);
    try {
      try {
        await fetchWithTimeout(`${API_BASE}/api/health`, {}, WARMUP_TIMEOUT_MS);
      } catch {
        throw new Error(t("login.timeout"));
      }
      clearWarmup();
      setStatusMsg(t("login.loggingIn"));

      const bridgeResult = await runPatientOAuthWithBridge({
        provider,
        clinicCode: clinicCode.trim() || undefined,
      });

      if (bridgeResult.ok === false) {
        if (bridgeResult.step === "not_configured") {
          Alert.alert(t("login.error"), t("login.oauthNotConfigured"));
          return;
        }
        if (bridgeResult.step === "native") {
          const m = bridgeResult.message;
          if (m === "oauth_cancelled") {
            emitAuthTelemetryV1("oauth_login_cancel", { provider });
            throw new Error(t("login.oauthCancelled"));
          }
          if (m === "apple_ios_only" || m === "apple_unavailable") throw new Error(t("login.appleNotAvailable"));
          if (m === "apple_credential_invalid") throw new Error(t("login.appleCredentialInvalid"));
          if (m === "oauth_not_configured") throw new Error(t("login.oauthNotConfigured"));
          if (m === "no_access_token") throw new Error(t("login.oauthInvalidToken"));
          throw new Error(m || t("login.loginFailed"));
        }
        if (bridgeResult.step === "bridge") {
          const code = bridgeResult.code;
          if (code === "patient_not_found") {
            emitAuthTelemetryV1("oauth_patient_profile_missing", { provider });
            router.replace({
              pathname: "/register-patient" as const,
              params: {
                oauthComplete: "1",
                provider,
                prefillClinicCode: clinicCode.trim() || "",
              },
            });
            return;
          }
          if (code === "patient_merge_conflict") {
            Alert.alert(t("login.error"), t("login.oauthMergeConflict"));
            return;
          }
          if (code === "oauth_provider_mismatch") {
            emitAuthTelemetryV1("oauth_provider_mismatch", { provider, surface: "client" });
            Alert.alert(t("login.error"), t("login.oauthProviderMismatch"));
            return;
          }
          if (code === "invalid_oauth_token") {
            throw new Error(t("login.oauthInvalidToken"));
          }
          throw new Error(bridgeResult.message || t("login.loginFailed"));
        }
        throw new Error(t("login.loginFailed"));
      }

      await applyCliniflySession(bridgeResult.payload, "");
      emitAuthTelemetryV1("oauth_login_success", { provider, surface: "client" });
      return;
    } catch (error: unknown) {
      clearWarmup();
      const err = error as { name?: string; message?: string };
      const isTimeout = err?.name === "AbortError" || String(err?.message || "").includes("timeout");
      emitAuthTelemetryV1("oauth_login_fail", {
        provider,
        reason: isTimeout ? "timeout" : "exception",
        message: String(err?.message || "").slice(0, 160),
      });
      setErrorMsg(isTimeout ? t("login.timeout") : err?.message || t("login.loginFailed"));
    } finally {
      clearWarmup();
      setLoading(false);
      setStatusMsg("");
    }
  };

  const handlePatientLogin = async () => {
    const trimInput = phone.trim();
    if (!trimInput) {
      Alert.alert(t("login.error"), t("login.phoneRequired"));
      return;
    }
    if (looksLikeEmail(trimInput)) {
      setErrorMsg(t("login.patientRejectEmail"));
      return;
    }
    setLoading(true);
    setErrorMsg("");
    setStatusMsg(t("login.connecting"));

    warmupTimerRef.current = setTimeout(() => {
      setStatusMsg(t("login.warmingUp"));
    }, 4000);

    try {
      try {
        await fetchWithTimeout(`${API_BASE}/api/health`, {}, WARMUP_TIMEOUT_MS);
      } catch {
        throw new Error(t("login.timeout"));
      }

      clearWarmup();
      setStatusMsg(t("login.loggingIn"));

      const res = await fetchWithTimeout(
        `${API_BASE}/api/patient/login`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: trimInput,
            password: password.trim() || undefined,
            clinicCode: clinicCode.trim() || undefined,
          }),
        },
        LOGIN_TIMEOUT_MS,
      );

      const json = await res.json();

      if (json?.requiresOTP || json?.error === "email_verification_required") {
        const pPhone = String(json.phone || trimInput || "").trim();
        const pEmail = String(json.email || "").trim();
        const pId = String(json.patientId || "").trim();
        const cc = clinicCode.trim().toUpperCase();
        await savePendingOtpSession({
          email: pEmail,
          phone: pPhone,
          patientId: pId,
          clinicCode: cc,
          flow: "login",
          emailSent: "1",
        });
        router.replace({
          pathname: "/otp" as const,
          params: {
            phone: pPhone,
            email: pEmail,
            patientId: pId,
            source: "patient",
            clinicCode: cc,
            flow: "login",
            emailSent: "1",
          },
        });
        return;
      }

      const payload = json?.user ?? json;
      if (!res.ok || !payload?.token) {
        const errCode = payload?.error || "";
        let msg = payload?.message || t("login.loginFailed");
        if (errCode === "patient_not_found") msg = t("login.patientNotFound");
        else if (errCode === "wrong_password") msg = t("login.patientWrongPassword");
        else if (errCode === "password_required") msg = t("login.patientPasswordRequired");
        throw new Error(msg);
      }

      await applyCliniflySession(payload as Record<string, unknown>, trimInput);
    } catch (error: unknown) {
      clearWarmup();
      const err = error as { name?: string; message?: string };
      const isTimeout = err?.name === "AbortError" || String(err?.message || "").includes("timeout");
      const msg = isTimeout ? t("login.timeout") : err?.message || t("login.loginFailed");
      setErrorMsg(msg);
    } finally {
      setLoading(false);
      setStatusMsg("");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.langRow}>
        {SUPPORTED_LANGUAGES.map((lang) => (
          <Pressable
            key={lang}
            style={[styles.langBtn, currentLanguage === lang && styles.langBtnActive]}
            onPress={async () => {
              try {
                await setLanguage(lang as Language);
              } catch {
                /* ignore */
              }
            }}
          >
            <Text style={[styles.langBtnText, currentLanguage === lang && styles.langBtnTextActive]}>
              {LANGUAGE_NAMES[lang as Language]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.title}>{t("login.patientTitle")}</Text>

      {pendingOtpResume && (
        <Pressable
          style={styles.resumeBanner}
          onPress={() =>
            router.replace({
              pathname: "/otp" as const,
              params: { source: "patient" },
            })
          }
        >
          <Text style={styles.resumeBannerTitle}>{t("register.resumeOtpVerification")}</Text>
          <Text style={styles.resumeBannerHint}>{t("register.resumeOtpHint")}</Text>
        </Pressable>
      )}

      <View style={styles.form}>
        {oauthConfigured && (
          <View style={styles.oauthBlock}>
            <Pressable
              style={[styles.oauthGoogleBtn, loading && styles.buttonDisabled]}
              onPress={() => runOAuth("google")}
              disabled={loading}
            >
              <Text style={styles.oauthGoogleText}>{t("login.continueWithGoogle")}</Text>
            </Pressable>
            {Platform.OS === "ios" && (
              <Pressable
                style={[styles.oauthAppleBtn, loading && styles.buttonDisabled]}
                onPress={() => runOAuth("apple")}
                disabled={loading}
              >
                <Text style={styles.oauthAppleText}>{t("login.continueWithApple")}</Text>
              </Pressable>
            )}
            <Text style={styles.orDivider}>{t("login.orDivider")}</Text>
          </View>
        )}

        <Pressable
          style={styles.phoneToggle}
          onPress={() => {
            setShowPhoneSection((v) => !v);
            setErrorMsg("");
          }}
          disabled={loading}
        >
          <Text style={styles.phoneToggleText}>
            {showPhoneSection ? "▼ " : "▶ "}
            {t("login.continueWithPhone")}
          </Text>
        </Pressable>

        {showPhoneSection && (
          <>
            <Text style={styles.phoneSectionHint}>{t("login.phoneSectionHint")}</Text>
            <View style={styles.field}>
              <Text style={styles.label}>{t("login.patientPhoneLabel")}</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={(v) => {
                  setPhone(v);
                  setErrorMsg("");
                }}
                placeholder={t("login.patientPhonePlaceholder")}
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!loading}
                autoComplete="tel"
              />
              <Text style={styles.fieldHint}>{t("login.patientPhoneOnlyHint")}</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t("auth.password_optional")}</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={(v) => {
                  setPassword(v);
                  setErrorMsg("");
                }}
                secureTextEntry
                autoCapitalize="none"
                editable={!loading}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t("auth.clinic_code")}</Text>
              <TextInput
                style={styles.input}
                value={clinicCode}
                onChangeText={(v) => {
                  setClinicCode(v.toUpperCase());
                  setErrorMsg("");
                }}
                autoCapitalize="characters"
                editable={!loading}
              />
            </View>
          </>
        )}

        {!!errorMsg && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
            <Pressable
              style={styles.retryBtn}
              onPress={() => {
                if (showPhoneSection) void handlePatientLogin();
              }}
            >
              <Text style={styles.retryBtnText}>🔄 {t("common.retry") ?? "Retry"}</Text>
            </Pressable>
          </View>
        )}

        {showPhoneSection && (
          <Pressable
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handlePatientLogin}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color="#ffffff" />
                {!!statusMsg && <Text style={styles.statusText}>{statusMsg}</Text>}
              </View>
            ) : (
              <Text style={styles.buttonText}>{t("login.loginButton")}</Text>
            )}
          </Pressable>
        )}

        {loading && !showPhoneSection && oauthConfigured && (
          <View style={styles.oauthLoadingRow}>
            <ActivityIndicator size="small" color="#2563EB" />
            {!!statusMsg && <Text style={styles.oauthLoadingText}>{statusMsg}</Text>}
          </View>
        )}

        <Pressable
          style={[styles.altButton, { alignSelf: "center", marginTop: 4, minWidth: 200 }]}
          onPress={() => router.push("/register-patient")}
        >
          <Text style={styles.altButtonText}>{t("login.registerPatient")}</Text>
        </Pressable>

        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>{t("login.back")}</Text>
        </Pressable>

        <Pressable
          style={styles.changeRoleBtn}
          onPress={async () => {
            await AsyncStorage.removeItem(ROLE_KEY).catch(() => {});
            router.replace("/role-select");
          }}
        >
          <Text style={styles.changeRoleText}>⇄ {t("onboarding.changeRole")}</Text>
        </Pressable>

        <Text style={styles.privacyConsent}>
          By continuing, you agree to our{" "}
          <Text
            style={styles.privacyConsentLink}
            onPress={() => Linking.openURL("https://www.clinifly.net/privacy-policy")}
          >
            Privacy Policy
          </Text>
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f6f7f9",
    justifyContent: "center",
    padding: 20,
  },
  langRow: {
    flexDirection: "row",
    justifyContent: "center",
    marginBottom: 24,
    gap: 8,
  },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
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
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 20,
    textAlign: "center",
  },
  resumeBanner: {
    alignSelf: "center",
    maxWidth: 400,
    width: "100%",
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
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
  form: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  oauthBlock: {
    marginBottom: 8,
  },
  oauthGoogleBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  oauthGoogleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
  },
  oauthAppleBtn: {
    backgroundColor: "#000",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  oauthAppleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  orDivider: {
    textAlign: "center",
    fontSize: 13,
    color: "#9CA3AF",
    marginBottom: 4,
  },
  phoneToggle: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  phoneToggleText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2563EB",
  },
  phoneSectionHint: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 12,
    lineHeight: 17,
  },
  field: {
    marginBottom: 14,
  },
  fieldHint: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748B",
    lineHeight: 17,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  button: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  backButton: {
    alignItems: "center",
    padding: 12,
  },
  backButtonText: {
    color: "#2563EB",
    fontSize: 16,
  },
  altButton: {
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2563EB",
    backgroundColor: "#fff",
    minWidth: 120,
  },
  altButtonText: {
    color: "#2563EB",
    fontSize: 15,
  },
  changeRoleBtn: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 4,
  },
  changeRoleText: {
    fontSize: 13,
    color: "#9ca3af",
  },
  privacyConsent: {
    textAlign: "center",
    marginTop: 10,
    fontSize: 12,
    color: "#6B7280",
  },
  privacyConsentLink: {
    color: "#007AFF",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  oauthLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 12,
  },
  oauthLoadingText: {
    fontSize: 13,
    color: "#475569",
  },
  statusText: {
    color: "#ffffff",
    fontSize: 13,
    flexShrink: 1,
  },
  errorCard: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    color: "#b91c1c",
    lineHeight: 18,
  },
  retryBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
