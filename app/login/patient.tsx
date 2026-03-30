import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useAuth } from '../../lib/auth';
import { API_BASE } from '../../lib/api';
import { useRouter } from 'expo-router';
import { useLanguage } from '../../lib/language-context';
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, Language } from '../../lib/i18n';


export default function PatientLogin() {
  const { signIn } = useAuth();
  const router = useRouter();
  const { t, currentLanguage, setLanguage } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState("");
  const [clinicCode, setClinicCode] = useState("");

  const handlePatientLogin = async () => {
    if (!phone.trim()) {
      Alert.alert(t('login.error'), t('login.phoneRequired'));
      return;
    }
    if (!clinicCode.trim()) {
      Alert.alert(t('login.error'), t('login.clinicCode') + ' ' + t('login.phoneRequired'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/patient/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), clinicCode: clinicCode.trim() })
      });
      const json = await res.json();

      // Backend currently returns { ok, user: { ... } } for patient login.
      // To stay backwards-compatible with any older flat responses,
      // prefer json.user if it exists, otherwise fall back to json itself.
      const payload = json?.user ?? json;

      if (!res.ok || !payload?.token) {
        throw new Error(payload?.message || payload?.error || t('login.loginFailed'));
      }

      await signIn({
        token: payload.token,
        id: payload.id || payload.patientId,
        patientId: payload.patientId || payload.id,
        type: "patient",
        role: payload.role || "PATIENT",
        phone: phone.trim(),
        name: payload.name || "",
        clinicId: payload.clinicId,
        clinicCode: payload.clinicCode,
        status: payload.status,
        language: payload.language,
        referralCode: payload.referralCode || null,
      });
      router.replace("/(patient)" as any);
    } catch (error: any) {
      Alert.alert(t('login.error'), error.message || t('login.loginFailed'));
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

      <Text style={styles.title}>{t('login.patientTitle')}</Text>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder={t('login.clinicCodePlaceholder')}
          value={clinicCode}
          onChangeText={v => setClinicCode(v.toUpperCase())}
          autoCapitalize="characters"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder={t('login.phonePlaceholder')}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          autoCapitalize="none"
          editable={!loading}
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handlePatientLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.buttonText}>{t('login.patientTitle')}</Text>
          )}
        </Pressable>

        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>{t('login.back')}</Text>
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
});
