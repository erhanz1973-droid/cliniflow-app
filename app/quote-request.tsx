// app/quote-request.tsx
// "Tell us about your treatment" — submitted after multi-clinic selection.
// Flow: form → loading (per-clinic) → success → My Requests
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/language-context';
import { API_BASE } from '../lib/api';

type Clinic = {
  id: string;
  clinic_code: string;
  name: string;
  city: string | null;
  address: string | null;
};

type Phase = 'form' | 'loading' | 'success';

export default function QuoteRequestScreen() {
  const router  = useRouter();
  const { user } = useAuth();
  const { t }   = useLanguage();
  const params  = useLocalSearchParams<{ clinics?: string }>();

  const selectedClinics: Clinic[] = (() => {
    try { return JSON.parse(decodeURIComponent(params.clinics || '[]')); }
    catch { return []; }
  })();

  const [phase, setPhase]             = useState<Phase>('form');
  const [description, setDescription] = useState('');
  const [sentIds, setSentIds]         = useState<string[]>([]);

  const cliniCount = selectedClinics.length;

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const trimmed = description.trim();
    if (!trimmed) {
      Alert.alert(t('quoteRequest.descRequired') || 'Description required',
        t('quoteRequest.descRequiredMsg') || 'Please tell us a bit about your treatment.');
      return;
    }
    if (!user?.token) {
      router.replace('/(patient)' as any);
      return;
    }

    setPhase('loading');
    const confirmed: string[] = [];

    for (const clinic of selectedClinics) {
      try {
        const res = await fetch(`${API_BASE}/api/patient/treatment-requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({
            description: trimmed,
            target_clinic_id: clinic.id,
          }),
        });
        const data = await res.json();
        if (data?.ok) {
          confirmed.push(clinic.id);
          setSentIds(prev => [...prev, clinic.id]);
        }
      } catch {
        // continue even if one fails
      }
    }

    // Small pause so the user sees each tick animate
    await new Promise(r => setTimeout(r, 400));
    setPhase('success');
  };

  // ── Form screen ───────────────────────────────────────────────────────────
  if (phase === 'form') {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">

            {/* Header */}
            <View style={styles.formHeader}>
              <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                <Text style={styles.backBtnText}>‹  {t('common.back') || 'Back'}</Text>
              </TouchableOpacity>
              <Text style={styles.formTitle}>
                {t('quoteRequest.title') || 'Tell us about your treatment'}
              </Text>
              <Text style={styles.formSubtitle}>
                {t('quoteRequest.subtitle', { count: cliniCount }) ||
                  `Your request will be sent to ${cliniCount} clinic(s).`}
              </Text>
            </View>

            {/* Selected clinic chips */}
            <View style={styles.chipRow}>
              {selectedClinics.map(c => (
                <View key={c.id} style={styles.chip}>
                  <Text style={styles.chipText} numberOfLines={1}>{c.name}</Text>
                </View>
              ))}
            </View>

            {/* Description */}
            <View style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>
                {t('quoteRequest.descLabel') || 'Describe your treatment needs'}
                <Text style={styles.required}> *</Text>
              </Text>
              <TextInput
                style={styles.textarea}
                placeholder={
                  t('quoteRequest.descPlaceholder') ||
                  'e.g. I need a dental implant on my upper left molar. I had an X-ray last month...'
                }
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                value={description}
                onChangeText={setDescription}
                maxLength={2000}
              />
              <Text style={styles.charCount}>{description.length} / 2000</Text>
            </View>

            {/* Photo upload — optional placeholder */}
            <View style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>
                {t('quoteRequest.photoLabel') || 'Attach a photo'}
                <Text style={styles.optional}>  ({t('quoteRequest.optional') || 'optional'})</Text>
              </Text>
              <TouchableOpacity style={styles.photoPlaceholder} activeOpacity={0.7}
                onPress={() => Alert.alert('Coming soon', 'Photo upload will be available in a future update.')}
              >
                <Text style={styles.photoIcon}>📷</Text>
                <Text style={styles.photoHint}>
                  {t('quoteRequest.photoHint') || 'Tap to add a photo (X-ray, intraoral, etc.)'}
                </Text>
              </TouchableOpacity>
            </View>

          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
              <Text style={styles.submitBtnText}>
                {t('quoteRequest.sendBtn', { count: cliniCount }) ||
                  `Send Request to ${cliniCount} Clinics`}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Loading screen ────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <SafeAreaView style={[styles.safe, styles.centerSafe]}>
        <ActivityIndicator size="large" color="#2563EB" style={{ marginBottom: 24 }} />
        <Text style={styles.loadingTitle}>
          {t('quoteRequest.sending') || 'Sending to clinics...'}
        </Text>
        <View style={styles.clinicTickList}>
          {selectedClinics.map(c => {
            const done = sentIds.includes(c.id);
            return (
              <View key={c.id} style={styles.clinicTickRow}>
                <Text style={[styles.clinicTick, done && styles.clinicTickDone]}>
                  {done ? '✔' : '○'}
                </Text>
                <Text style={[styles.clinicTickName, done && styles.clinicTickNameDone]}>
                  {c.name}
                </Text>
              </View>
            );
          })}
        </View>
      </SafeAreaView>
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.safe, styles.centerSafe]}>
      <Text style={styles.successEmoji}>🎉</Text>
      <Text style={styles.successTitle}>
        {t('quoteRequest.successTitle') || 'Your request has been sent'}
      </Text>
      <Text style={styles.successSub}>
        {t('quoteRequest.successSub') || 'You will receive offers shortly'}
      </Text>

      {/* Clinic confirmation list */}
      <View style={styles.confirmList}>
        {selectedClinics.map(c => (
          <View key={c.id} style={styles.confirmRow}>
            <Text style={styles.confirmTick}>✔</Text>
            <Text style={styles.confirmName}>{c.name}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.goBtn}
        onPress={() => router.replace('/my-requests' as any)}
        activeOpacity={0.85}
      >
        <Text style={styles.goBtnText}>
          {t('quoteRequest.goToRequests') || 'Go to My Requests'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.homeLink}
        onPress={() => router.replace('/(patient)' as any)}
      >
        <Text style={styles.homeLinkText}>
          {t('quoteRequest.backToHome') || 'Back to Home'}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  centerSafe: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },

  // ── Form ──
  formScroll: { paddingBottom: 20 },
  formHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  backBtn: { marginBottom: 14 },
  backBtnText: { fontSize: 15, color: '#2563EB', fontWeight: '600' },
  formTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 5 },
  formSubtitle: { fontSize: 13, color: '#6B7280', lineHeight: 18 },

  chipRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 20, paddingBottom: 14,
  },
  chip: {
    backgroundColor: '#EFF6FF', borderRadius: 20, borderWidth: 1,
    borderColor: '#BFDBFE', paddingHorizontal: 12, paddingVertical: 5, maxWidth: 160,
  },
  chipText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },

  fieldCard: {
    backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 16, marginBottom: 12,
    padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 10 },
  required: { color: '#EF4444' },
  optional: { fontWeight: '400', color: '#9CA3AF' },

  textarea: {
    minHeight: 120, fontSize: 14, color: '#111827', lineHeight: 21,
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 5 },

  photoPlaceholder: {
    borderWidth: 1.5, borderColor: '#D1D5DB', borderStyle: 'dashed', borderRadius: 12,
    paddingVertical: 20, alignItems: 'center', gap: 8, backgroundColor: '#F9FAFB',
  },
  photoIcon: { fontSize: 28 },
  photoHint: { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },

  footer: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB',
    paddingVertical: 14, paddingHorizontal: 20,
  },
  submitBtn: {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },

  // ── Loading ──
  loadingTitle: {
    fontSize: 18, fontWeight: '700', color: '#111827',
    marginBottom: 24, textAlign: 'center',
  },
  clinicTickList: { gap: 12, width: '100%', paddingHorizontal: 8 },
  clinicTickRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clinicTick: { fontSize: 18, color: '#D1D5DB', width: 24, textAlign: 'center' },
  clinicTickDone: { color: '#16A34A' },
  clinicTickName: { fontSize: 15, color: '#6B7280', fontWeight: '600', flex: 1 },
  clinicTickNameDone: { color: '#111827' },

  // ── Success ──
  successEmoji: { fontSize: 56, marginBottom: 16, textAlign: 'center' },
  successTitle: {
    fontSize: 22, fontWeight: '800', color: '#111827',
    marginBottom: 8, textAlign: 'center',
  },
  successSub: {
    fontSize: 14, color: '#6B7280', lineHeight: 20,
    textAlign: 'center', marginBottom: 24,
  },
  confirmList: {
    width: '100%', gap: 10, marginBottom: 28,
    backgroundColor: '#F0FDF4', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confirmTick: { fontSize: 16, color: '#16A34A', width: 22, textAlign: 'center' },
  confirmName: { fontSize: 14, fontWeight: '600', color: '#166534', flex: 1 },

  goBtn: {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center',
    width: '100%', marginBottom: 12,
  },
  goBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  homeLink: { paddingVertical: 8 },
  homeLinkText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
});
