// app/clinic-onboarding.tsx
// Shown after registration when patient has no clinic.
// Patient can pick a clinic or skip (marketplace flow).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/language-context';
import { API_BASE } from '../lib/api';

type Clinic = {
  id: string;
  clinic_code: string;
  name: string;
  city: string | null;
  address: string | null;
  description: string | null;
  specialty: string | null;
};

export default function ClinicOnboardingScreen() {
  const router = useRouter();
  const { user, signIn, patchUser } = useAuth();
  const { t } = useLanguage();

  const [query, setQuery] = useState('');
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchClinics = useCallback(async (q = '') => {
    setLoading(true);
    try {
      const url = q.trim()
        ? `${API_BASE}/api/clinics/search?q=${encodeURIComponent(q.trim())}`
        : `${API_BASE}/api/clinics`;
      const res = await fetch(url);
      const data = await res.json();
      setClinics(data?.clinics || []);
    } catch {
      setClinics([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => { fetchClinics(); }, [fetchClinics]);

  // Debounced search
  const onSearch = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchClinics(text), 400);
  };

  const selectClinic = async (clinic: Clinic) => {
    if (!user?.token) return;
    setSelecting(clinic.id);
    try {
      const res = await fetch(`${API_BASE}/api/patient/clinic`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ clinic_code: clinic.clinic_code }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'error');

      // Update auth context with new token
      if (data.token) {
        await signIn({
          token: data.token,
          patientId: user.patientId,
          type: 'patient',
          role: 'PATIENT',
          otpVerified: true,
        });
      }
      router.replace('/(patient)' as any);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message || t('common.serverError'));
    } finally {
      setSelecting(null);
    }
  };

  const skipAndContinue = () => {
    router.replace('/(patient)' as any);
  };

  const renderClinic = ({ item }: { item: Clinic }) => (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <View style={styles.cardIcon}>
          <Text style={styles.cardIconText}>🏥</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{item.name}</Text>
          {item.city && <Text style={styles.cardCity}>📍 {item.city}</Text>}
          {item.description && (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          )}
          {item.specialty && (
            <View style={styles.specialtyBadge}>
              <Text style={styles.specialtyText}>{item.specialty}</Text>
            </View>
          )}
          <Text style={styles.cardCode}>{item.clinic_code}</Text>
        </View>
      </View>
      <TouchableOpacity
        style={[styles.selectBtn, selecting === item.id && styles.selectBtnDisabled]}
        onPress={() => selectClinic(item)}
        disabled={!!selecting}
      >
        {selecting === item.id
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={styles.selectBtnText}>{t('clinicOnboard.select')}</Text>
        }
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('clinicOnboard.title')}</Text>
        <Text style={styles.subtitle}>{t('clinicOnboard.subtitle')}</Text>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder={t('clinicOnboard.searchPlaceholder')}
          placeholderTextColor="#9CA3AF"
          value={query}
          onChangeText={onSearch}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => { setQuery(''); fetchClinics(''); }}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={clinics}
          keyExtractor={item => item.id}
          renderItem={renderClinic}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🏥</Text>
              <Text style={styles.emptyText}>{t('clinicOnboard.empty')}</Text>
              {query.length > 0 && (
                <Text style={styles.emptySub}>{t('clinicOnboard.emptySub')}</Text>
              )}
            </View>
          }
        />
      )}

      {/* Skip */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.skipBtn} onPress={skipAndContinue}>
          <Text style={styles.skipText}>{t('clinicOnboard.skip')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6B7280', lineHeight: 20 },

  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchIcon: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  clearBtn: { fontSize: 14, color: '#9CA3AF', paddingHorizontal: 4 },

  list: { paddingHorizontal: 16, paddingBottom: 16 },

  card: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB',
    padding: 14, marginBottom: 10, flexDirection: 'row',
    alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardLeft: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  cardIcon: {
    width: 42, height: 42, borderRadius: 10, backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  cardIconText: { fontSize: 20 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  cardCity: { fontSize: 12, color: '#6B7280', marginBottom: 3 },
  cardDesc: { fontSize: 12, color: '#6B7280', lineHeight: 17, marginBottom: 4 },
  cardCode: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', letterSpacing: 0.5 },
  specialtyBadge: {
    alignSelf: 'flex-start', backgroundColor: '#DBEAFE', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2, marginBottom: 4,
  },
  specialtyText: { fontSize: 10, color: '#1D4ED8', fontWeight: '700' },

  selectBtn: {
    backgroundColor: '#2563EB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, minWidth: 70, alignItems: 'center',
  },
  selectBtnDisabled: { backgroundColor: '#93C5FD' },
  selectBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

  emptyBox: { alignItems: 'center', paddingTop: 50 },
  emptyIcon: { fontSize: 44, marginBottom: 10 },
  emptyText: { fontSize: 15, fontWeight: '700', color: '#374151' },
  emptySub: { fontSize: 13, color: '#9CA3AF', marginTop: 4, textAlign: 'center' },

  footer: {
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
    backgroundColor: '#fff', paddingVertical: 14, paddingHorizontal: 20,
  },
  skipBtn: { alignItems: 'center', paddingVertical: 4 },
  skipText: { fontSize: 14, color: '#6B7280', fontWeight: '600' },
});
