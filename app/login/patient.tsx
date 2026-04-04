import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../../lib/auth';
import { API_BASE } from '../../lib/api';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../lib/language-context';
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, Language } from '../../lib/i18n';
import { ROLE_KEY } from '../(auth)/role-select';

const WARMUP_TIMEOUT_MS = 30_000; // 30 s — cold-start window; Apple reviewer must not wait 75 s
const LOGIN_TIMEOUT_MS  = 15_000;

function fetchWithTimeout(url: string, options: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...options, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

export default function PatientLogin() {
  const { signIn } = useAuth();
  const router = useRouter();
  const { t, currentLanguage, setLanguage } = useLanguage();
  const [loading, setLoading]     = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg]   = useState('');
  const [phoneOrEmail, setPhoneOrEmail] = useState("");
  const [password, setPassword]   = useState("");
  const [clinicCode, setClinicCode] = useState("");
  const warmupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearWarmup = () => {
    if (warmupTimerRef.current) {
      clearTimeout(warmupTimerRef.current);
      warmupTimerRef.current = null;
    }
  };

  const handlePatientLogin = async () => {
    const trimInput = phoneOrEmail.trim();
    if (!trimInput) {
      Alert.alert(t('login.error'), t('login.phoneRequired'));
      return;
    }
    // Detect whether input is an email or a phone number
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimInput);
    setLoading(true);
    setErrorMsg('');
    setStatusMsg(t('login.connecting'));

    warmupTimerRef.current = setTimeout(() => {
      setStatusMsg(t('login.warmingUp'));
    }, 4000);

    try {
      try {
        await fetchWithTimeout(`${API_BASE}/api/health`, {}, WARMUP_TIMEOUT_MS);
      } catch {
        throw new Error(t('login.timeout'));
      }

      clearWarmup();
      setStatusMsg(t('login.loggingIn'));

      const res = await fetchWithTimeout(
        `${API_BASE}/api/patient/login`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: isEmail ? undefined : trimInput,
            email: isEmail ? trimInput : undefined,
            password: password.trim() || undefined,
            clinicCode: clinicCode.trim() || undefined,
          }),
        },
        LOGIN_TIMEOUT_MS,
      );

      const json = await res.json();

      // PENDING → OTP verification required
      if (json?.requiresOTP || json?.error === 'email_verification_required') {
        router.replace({
          pathname: '/otp' as any,
          params: {
            phone: json.phone || (isEmail ? '' : trimInput),
            email: json.email || (isEmail ? trimInput : ''),
            patientId: json.patientId || '',
            source: 'patient',
          },
        });
        return;
      }

      const payload = json?.user ?? json;
      if (!res.ok || !payload?.token) {
        const errCode = payload?.error || '';
        let msg = payload?.message || t('login.loginFailed');
        if (errCode === 'patient_not_found') msg = 'Bu telefon/e-posta ile kayıt bulunamadı.';
        else if (errCode === 'wrong_password') msg = 'Şifre hatalı.';
        else if (errCode === 'password_required') msg = 'Bu hesap şifre gerektiriyor.';
        throw new Error(msg);
      }

      await signIn({
        token:        payload.token,
        id:           payload.id || payload.patientId,
        patientId:    payload.patientId || payload.id,
        type:         "patient",
        role:         payload.role || "PATIENT",
        phone:        trimPhone || payload.phone || "",
        name:         payload.name || "",
        clinicId:     payload.clinicId,
        clinicCode:   payload.clinicCode,
        status:       payload.status,
        language:     payload.language,
        referralCode: payload.referralCode || null,
      });
      router.replace("/(patient)" as any);
    } catch (error: any) {
      clearWarmup();
      const isTimeout = error?.name === 'AbortError' || String(error?.message || '').includes('timeout');
      const msg = isTimeout ? t('login.timeout') : (error.message || t('login.loginFailed'));
      setErrorMsg(msg);
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
            onPress={() => setLanguage(lang as Language)}
          >
            <Text style={[styles.langBtnText, currentLanguage === lang && styles.langBtnTextActive]}>
              {LANGUAGE_NAMES[lang as Language]}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.title}>{t('login.patientTitle')}</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder={t('login.phoneOrEmailPlaceholder') || 'Telefon veya E-posta'}
          value={phoneOrEmail}
          onChangeText={v => { setPhoneOrEmail(v); setErrorMsg(''); }}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder={t('login.passwordPlaceholder') ?? 'Şifre (opsiyonel)'}
          value={password}
          onChangeText={v => { setPassword(v); setErrorMsg(''); }}
          secureTextEntry
          autoCapitalize="none"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder={t('login.clinicCodePlaceholder')}
          value={clinicCode}
          onChangeText={v => { setClinicCode(v.toUpperCase()); setErrorMsg(''); }}
          autoCapitalize="characters"
          editable={!loading}
        />

        {/* Inline error with retry */}
        {!!errorMsg && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
            <Pressable style={styles.retryBtn} onPress={handlePatientLogin}>
              <Text style={styles.retryBtnText}>🔄 {t('common.retry') ?? 'Retry'}</Text>
            </Pressable>
          </View>
        )}

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handlePatientLogin}
          disabled={loading}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#ffffff" />
              {!!statusMsg && (
                <Text style={styles.statusText}>{statusMsg}</Text>
              )}
            </View>
          ) : (
            <Text style={styles.buttonText}>{t('login.patientTitle')}</Text>
          )}
        </Pressable>

        <Pressable
          style={[styles.altButton, { alignSelf: 'center', marginTop: 4, minWidth: 200 }]}
          onPress={() => router.push('/register-patient')}
        >
          <Text style={styles.altButtonText}>{t('login.registerPatient')}</Text>
        </Pressable>

        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>{t('login.back')}</Text>
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
    marginBottom: 12,
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
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 13,
    flexShrink: 1,
  },
  errorCard: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  errorText: {
    fontSize: 13,
    color: '#b91c1c',
    lineHeight: 18,
  },
  retryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#2563eb',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
