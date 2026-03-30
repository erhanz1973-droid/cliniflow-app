import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { setAuthToken } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { apiPost, API_BASE } from '../../lib/api';
import { API_ROUTES } from '../../lib/api-routes';
import { useLanguage } from '../../lib/language-context';
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, Language } from '../../lib/i18n';

interface DoctorLoginResponse {
  ok: boolean;
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
      return t("login.doctorCredentialsInvalid");
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

export default function DoctorLogin() {
  const { signIn } = useAuth();
  const router = useRouter();
  const { t, currentLanguage, setLanguage } = useLanguage();
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [clinicCode, setClinicCode] = useState('');

  const handleDoctorLogin = async () => {
    const normalizedEmail = normalizeDoctorEmail(email);
    const normalizedClinicCode = clinicCode.trim().toUpperCase();

    if (!normalizedEmail || !normalizedClinicCode) {
      Alert.alert(t('login.error'), t('login.email') + ' ' + t('login.clinicCode'));
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      Alert.alert(t('login.error'), t('login.emailPlaceholder'));
      return;
    }

    setLoading(true);
    try {
      const loginUrl = API_ROUTES.doctor.login;
      console.log("LOGIN URL:", API_BASE + loginUrl);
      console.log("LOGIN DATA:", { email: normalizedEmail, clinicCode: normalizedClinicCode });
      const res = await apiPost<DoctorLoginResponse>(loginUrl, {
        email: normalizedEmail,
        clinicCode: normalizedClinicCode
      });

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
        router.replace('/doctor-pending');
      } else {
        setTimeout(() => {
          router.replace('/doctor/dashboard');
        }, 0);
      }
    } catch (error: unknown) {
      const message = String(error instanceof Error ? error.message : "");
      const isNetworkIssue =
        message.includes("Network request failed") ||
        message.includes("Network unreachable") ||
        message.includes("Failed to fetch");
      Alert.alert(
        t("login.error"),
        isNetworkIssue ? t("login.networkError") : t("login.loginFailed")
      );
      console.error("Login error:", error);
    } finally {
      setLoading(false);
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
            onPress={() => setLanguage(lang as Language)}
          >
            <Text style={[styles.langBtnText, currentLanguage === lang && styles.langBtnTextActive]}>
              {LANGUAGE_NAMES[lang as Language]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.title}>{t('login.doctorTitle')}</Text>

      <View style={styles.form}>
        <Text style={styles.description}>
          {t('login.devModeNote')}
        </Text>

        <TextInput
          style={styles.input}
          placeholder={t('login.emailPlaceholder')}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder={t('login.clinicCodePlaceholder')}
          value={clinicCode}
          onChangeText={(v) => setClinicCode(v.toUpperCase())}
          autoCapitalize="characters"
          editable={!loading}
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleDoctorLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>{t('login.doctorTitle')}</Text>
          )}
        </Pressable>

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8 }}>
          <Pressable
            style={[styles.altButton, { marginRight: 8 }]}
            onPress={() => router.replace('/login/patient')}
          >
            <Text style={styles.altButtonText}>{t('login.switchToPatient')}</Text>
          </Pressable>
          <Pressable
            style={styles.altButton}
            onPress={() => router.replace('/register-patient')}
          >
            <Text style={styles.altButtonText}>{t('login.registerPatient')}</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.altButton, { alignSelf: 'center', marginTop: 8, minWidth: 200 }]}
          onPress={() => router.push('/register-doctor')}
        >
          <Text style={styles.altButtonText}>Doktor Kaydı</Text>
        </Pressable>
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
    marginBottom: 16,
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
});
