import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../../../lib/auth';
import { setAuthToken } from '../../../lib/api';
import { apiPost, API_BASE } from '../../../lib/api';
import { API_ROUTES } from '../../../lib/api-routes';
import { useLanguage } from '../../../lib/language-context';
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, Language } from '../../../lib/i18n';
import { ROLE_KEY } from '../(auth)/role-select';

interface DoctorLoginResponse {
  ok: boolean;
  pending?: boolean;
  token?: string;
  user?: {
    id: string;
    token?: string;
    type?: string;
    role?: string;
    doctorId?: string;
    name?: string;
    email?: string;
    phone?: string;
    clinicId?: string;
    clinicCode?: string;
    status?: string;
    language?: string;
  };
  doctor?: {
    id: string;
    token?: string;
    type?: string;
    role?: string;
    doctorId?: string;
    name?: string;
    email?: string;
    phone?: string;
    clinicId?: string;
    clinicCode?: string;
    status?: string;
    language?: string;
  };
  error?: string;
}

function normalizeDoctorEmail(input: string) {
  let value = String(input || "").trim().toLowerCase();

  value = value
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");

  if (value.endsWith(".cim")) {
    value = `${value.slice(0, -4)}.com`;
  }

  return value;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function doctorLoginErrorMessage(code: string, t: (key: string) => string): string {
  switch (String(code || "").trim()) {
    case "doctor_not_found":
    case "doctor_not_found_or_not_approved":
      return t("login.doctorCredentialsInvalid");
    case "invalid_credentials":
      return t("login.wrongPassword") ?? "E-posta veya şifre hatalı.";
    case "invalid_clinic_code":
      return t("login.doctorClinicCodeMismatch");
    case "email_required":
      return t("login.emailPlaceholder");
    case "clinic_code_required":
      return t("login.clinicCodePlaceholder");
    case "doctor_account_inactive":
      return t("login.doctorAccountInactive");
    default:
      return t("login.loginFailed");
  }
}

async function warmUpServer(): Promise<void> {
  try {
    const ctrl = new AbortController();
    const tid = setTimeout(() => ctrl.abort(), 55000);
    await fetch(`${API_BASE}/api/health`, { method: "GET", signal: ctrl.signal });
    clearTimeout(tid);
  } catch { /* cold start ping — ignore errors */ }
}

export default function DoctorLogin() {
  const { signIn } = useAuth();
  const router = useRouter();
  const { t, currentLanguage, setLanguage } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clinicCode, setClinicCode] = useState('');

  const handleDoctorLogin = async () => {
    const normalizedEmail = normalizeDoctorEmail(email);
    const normalizedClinicCode = clinicCode.trim().toUpperCase();
    const trimPassword = password.trim();

    if (!normalizedEmail || !normalizedClinicCode) {
      Alert.alert(t('login.error'), t('login.email') + ' ' + t('login.clinicCode'));
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      Alert.alert(t('login.error'), t('login.emailPlaceholder'));
      return;
    }

    if (!trimPassword) {
      Alert.alert(t('login.error'), t('login.passwordRequired') ?? 'Şifre zorunludur.');
      return;
    }

    setLoading(true);
    setStatusMsg(t('login.connecting') || 'Sunucuya bağlanılıyor...');

    await warmUpServer();
    setStatusMsg(t('login.loggingIn') || 'Giriş yapılıyor...');

    let res: DoctorLoginResponse | null = null;
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const loginUrl = API_ROUTES.doctor.login;
        res = await apiPost<DoctorLoginResponse>(loginUrl, {
          email: normalizedEmail,
          clinicCode: normalizedClinicCode,
          password: trimPassword,
        });
        lastError = null;
        break;
      } catch (err: unknown) {
        lastError = err;
        const msg = String(err instanceof Error ? err.message : "");
        if (attempt === 1 && msg.includes("timeout")) {
          setStatusMsg(t('login.retrying') || 'Yeniden deneniyor...');
          await warmUpServer();
        }
      }
    }

    if (lastError || !res) {
      const message = String(lastError instanceof Error ? lastError.message : "");
      const isNetworkIssue =
        message.includes("Network request failed") ||
        message.includes("Network unreachable") ||
        message.includes("Failed to fetch") ||
        message.includes("timeout");
      Alert.alert(
        t("login.error"),
        isNetworkIssue ? t("login.networkError") || "Sunucu yanıt vermiyor, tekrar deneyin." : t("login.loginFailed")
      );
      setLoading(false);
      setStatusMsg('');
      return;
    }

    try {

      if (!res || typeof res !== "object") {
        Alert.alert(t("login.error"), t("login.loginFailed"));
        return;
      }

      if (!res.ok) {
        const errCode = String((res as DoctorLoginResponse).error || "").trim();
        Alert.alert(t("login.error"), doctorLoginErrorMessage(errCode, t));
        console.warn("[Doctor login] rejected:", errCode);
        return;
      }

      const doctor = res.user || res.doctor;
      const token = res.token || doctor?.token;

      if (!doctor?.id || !token) {
        Alert.alert(t("login.error"), t("login.loginFailed"));
        console.warn("[Doctor login] missing token or doctor id");
        return;
      }

      setAuthToken(token);

      await signIn({
        token,
        id: doctor.id,
        doctorId: doctor.doctorId || doctor.id,
        name: doctor.name || '',
        email: doctor.email || normalizedEmail,
        clinicId: doctor.clinicId || '',
        type: "doctor",
        role: "DOCTOR",
        status: doctor.status || 'active',
        language: doctor.language,
      });

      if (res.pending || doctor.status === 'PENDING') {
        router.replace('/doctor/pending');
      } else {
        setTimeout(() => {
          router.replace('/doctor');
        }, 0);
      }
    } catch (error: unknown) {
      console.error("Login error:", error);
      Alert.alert(t("login.error"), t("login.loginFailed"));
    } finally {
      setLoading(false);
      setStatusMsg('');
    }
  };

  return (
    <View style={styles.container}>
      {/* Language selector */}
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

      <Text style={styles.title}>{t('login.doctorTitle')}</Text>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.email')}</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.password')}</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            editable={!loading}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.clinic_code')}</Text>
          <TextInput
            style={styles.input}
            value={clinicCode}
            onChangeText={(v) => setClinicCode(v.toUpperCase())}
            autoCapitalize="characters"
            editable={!loading}
          />
        </View>

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleDoctorLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>{t('login.loginButton')}</Text>
          )}
        </Pressable>
        {!!statusMsg && (
          <Text style={{ textAlign: 'center', color: '#6b7280', fontSize: 13, marginTop: 8 }}>
            {statusMsg}
          </Text>
        )}

        <Pressable
          style={[styles.altButton, { alignSelf: 'center', marginTop: 8, minWidth: 200 }]}
          onPress={() => router.push('/register-doctor')}
        >
          <Text style={styles.altButtonText}>{t('login.registerDoctor')}</Text>
        </Pressable>

        <Pressable
          style={styles.changeRoleBtn}
          onPress={async () => {
            await AsyncStorage.removeItem(ROLE_KEY).catch(() => {});
            router.replace('/role-select');
          }}
        >
          <Text style={styles.changeRoleText}>⇄ {t('onboarding.changeRole')}</Text>
        </Pressable>

        <Text style={styles.privacyConsent}>
          By continuing, you agree to our{' '}
          <Text
            style={styles.privacyConsentLink}
            onPress={() => Linking.openURL('https://www.clinifly.net/privacy-policy')}
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
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 8,
  },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
  },
  langBtnActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  langBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  langBtnTextActive: {
    color: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 32,
    textAlign: "center",
  },
  form: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 6,
  },
  description: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 20,
  },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    fontSize: 16,
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
    textAlign: 'center',
    marginTop: 10,
    fontSize: 12,
    color: '#6B7280',
  },
  privacyConsentLink: {
    color: '#007AFF',
  },
});
