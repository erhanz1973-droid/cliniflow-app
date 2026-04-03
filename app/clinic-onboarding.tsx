// app/clinic-onboarding.tsx
// Post-registration clinic selection — city chips + search, fully skippable.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert, Modal, Pressable,
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

const ALL = '__ALL__';

export default function ClinicOnboardingScreen() {
  const router   = useRouter();
  const { user, signIn } = useAuth();
  const { t } = useLanguage();

  const [query, setQuery]           = useState('');
  const [clinics, setClinics]       = useState<Clinic[]>([]);
  const [allClinics, setAllClinics] = useState<Clinic[]>([]); // for city extraction
  const [cities, setCities]         = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>(ALL);
  const [loading, setLoading]       = useState(true);
  const [selecting, setSelecting]   = useState<string | null>(null);
  const [cityModal, setCityModal]   = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── fetch helper ────────────────────────────────────────────────────────────
  const fetchClinics = useCallback(async (q: string, city: string) => {
    setLoading(true);
    try {
      let url: string;
      if (q.trim()) {
        // Search overrides city filter
        url = `${API_BASE}/api/clinics/search?q=${encodeURIComponent(q.trim())}`;
      } else if (city && city !== ALL) {
        url = `${API_BASE}/api/clinics?city=${encodeURIComponent(city)}`;
      } else {
        url = `${API_BASE}/api/clinics`;
      }
      const res  = await fetch(url);
      const data = await res.json();
      setClinics(data?.clinics || []);
    } catch {
      setClinics([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load — fetch all to extract cities
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res  = await fetch(`${API_BASE}/api/clinics`);
        const data = await res.json();
        const list: Clinic[] = data?.clinics || [];
        setAllClinics(list);
        setClinics(list);
        // Extract unique non-null cities, sort
        const citySet = Array.from(
          new Set(list.map(c => c.city).filter(Boolean) as string[])
        ).sort();
        setCities(citySet);
      } catch {
        setClinics([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Search (debounced 350ms) ─────────────────────────────────────────────────
  const onSearch = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchClinics(text, selectedCity), 350);
  };

  const clearSearch = () => {
    setQuery('');
    fetchClinics('', selectedCity);
  };

  // ── City selection ───────────────────────────────────────────────────────────
  const chooseCity = (city: string) => {
    setSelectedCity(city);
    setCityModal(false);
    fetchClinics(query, city);
  };

  // ── Clinic select ────────────────────────────────────────────────────────────
  const selectClinic = async (clinic: Clinic) => {
    if (!user?.token) return;
    setSelecting(clinic.id);
    try {
      const res  = await fetch(`${API_BASE}/api/patient/clinic`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${user.token}` },
        body: JSON.stringify({ clinic_code: clinic.clinic_code }),
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'error');

      if (data.token) {
        await signIn({
          token: data.token,
          patientId: user.patientId,
          name: user.name,
          phone: user.phone,
          email: user.email,
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

  const skipAndContinue = () => router.replace('/(patient)' as any);

  // ── Render helpers ───────────────────────────────────────────────────────────
  const cityLabel = selectedCity === ALL ? t('clinicOnboard.allCities') : selectedCity;

  const renderClinic = ({ item }: { item: Clinic }) => (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <View style={styles.cardIcon}>
          <Text style={styles.cardIconText}>🏥</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardName}>{item.name}</Text>
          {item.city ? (
            <Text style={styles.cardCity}>📍 {item.city}</Text>
          ) : null}
          {item.description ? (
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
          ) : null}
          {item.specialty ? (
            <View style={styles.specialtyBadge}>
              <Text style={styles.specialtyText}>{item.specialty}</Text>
            </View>
          ) : null}
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

  // Empty state text depends on context
  const emptyTitle = query
    ? t('clinicOnboard.emptySearch')
    : selectedCity !== ALL
      ? t('clinicOnboard.emptyCity')
      : t('clinicOnboard.empty');

  const emptyHint = query
    ? t('clinicOnboard.emptySearchHint')
    : selectedCity !== ALL
      ? t('clinicOnboard.emptyCityHint')
      : null;

  return (
    <SafeAreaView style={styles.safe}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('clinicOnboard.title')}</Text>
        <Text style={styles.subtitle}>{t('clinicOnboard.subtitle')}</Text>
      </View>

      {/* ── City selector ── */}
      <View style={styles.cityRow}>
        <Text style={styles.cityLabel}>{t('clinicOnboard.cityLabel')}</Text>
        <TouchableOpacity style={styles.cityPicker} onPress={() => setCityModal(true)}>
          <Text style={styles.cityPickerText}>{cityLabel}</Text>
          <Text style={styles.cityPickerArrow}>▾</Text>
        </TouchableOpacity>
      </View>

      {/* ── Search ── */}
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
          <TouchableOpacity onPress={clearSearch}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Clinic list ── */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={clinics}
          keyExtractor={item => item.id}
          renderItem={renderClinic}
          contentContainerStyle={[styles.list, clinics.length === 0 && { flex: 1 }]}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyText}>{emptyTitle}</Text>
              {emptyHint ? <Text style={styles.emptySub}>{emptyHint}</Text> : null}
              {/* Actionable escapes */}
              <View style={styles.emptyActions}>
                {selectedCity !== ALL && (
                  <TouchableOpacity
                    style={styles.emptyActionBtn}
                    onPress={() => chooseCity(ALL)}
                  >
                    <Text style={styles.emptyActionText}>{t('clinicOnboard.showAll')}</Text>
                  </TouchableOpacity>
                )}
                {query.length > 0 && (
                  <TouchableOpacity
                    style={[styles.emptyActionBtn, styles.emptyActionBtnGhost]}
                    onPress={clearSearch}
                  >
                    <Text style={styles.emptyActionTextGhost}>{t('clinicOnboard.clearSearch')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.emptyActionBtn, styles.emptyActionBtnGhost]}
                  onPress={skipAndContinue}
                >
                  <Text style={styles.emptyActionTextGhost}>{t('clinicOnboard.skipShort')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
        />
      )}

      {/* ── Skip footer ── */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.skipBtn} onPress={skipAndContinue}>
          <Text style={styles.skipText}>{t('clinicOnboard.skip')}</Text>
        </TouchableOpacity>
      </View>

      {/* ── City modal ── */}
      <Modal
        visible={cityModal}
        transparent
        animationType="slide"
        onRequestClose={() => setCityModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCityModal(false)}>
          <Pressable style={styles.modalSheet} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>{t('clinicOnboard.cityLabel')}</Text>
            <ScrollView>
              {/* All Cities option */}
              <TouchableOpacity
                style={[styles.cityOption, selectedCity === ALL && styles.cityOptionActive]}
                onPress={() => chooseCity(ALL)}
              >
                <Text style={[styles.cityOptionText, selectedCity === ALL && styles.cityOptionTextActive]}>
                  🌍 {t('clinicOnboard.allCities')}
                </Text>
                {selectedCity === ALL && <Text style={styles.checkmark}>✓</Text>}
              </TouchableOpacity>

              {cities.map(city => (
                <TouchableOpacity
                  key={city}
                  style={[styles.cityOption, selectedCity === city && styles.cityOptionActive]}
                  onPress={() => chooseCity(city)}
                >
                  <Text style={[styles.cityOptionText, selectedCity === city && styles.cityOptionTextActive]}>
                    📍 {city}
                  </Text>
                  {selectedCity === city && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              ))}

              {cities.length === 0 && (
                <Text style={styles.noCitiesText}>{t('clinicOnboard.noCities')}</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 3 },
  subtitle: { fontSize: 13, color: '#6B7280', lineHeight: 18 },

  // City row
  cityRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, marginBottom: 10,
  },
  cityLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  cityPicker: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB',
    paddingHorizontal: 12, paddingVertical: 9,
  },
  cityPickerText: { fontSize: 14, fontWeight: '600', color: '#2563EB' },
  cityPickerArrow: { fontSize: 12, color: '#6B7280', marginLeft: 4 },

  // Search
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  clearBtn: { fontSize: 14, color: '#9CA3AF', paddingHorizontal: 4 },

  // List
  list: { paddingHorizontal: 16, paddingBottom: 16 },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB',
    padding: 14, marginBottom: 10, flexDirection: 'row',
    alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
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

  // Empty state
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 50, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#374151', textAlign: 'center', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  emptyActions: { gap: 10, width: '100%' },
  emptyActionBtn: {
    backgroundColor: '#2563EB', borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
  },
  emptyActionBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#D1D5DB' },
  emptyActionText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyActionTextGhost: { color: '#6B7280', fontWeight: '600', fontSize: 14 },

  // Footer
  footer: {
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
    backgroundColor: '#fff', paddingVertical: 14, paddingHorizontal: 20,
  },
  skipBtn: { alignItems: 'center', paddingVertical: 4 },
  skipText: { fontSize: 14, color: '#6B7280', fontWeight: '600' },

  // City modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, paddingBottom: 32, maxHeight: '70%',
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: '#D1D5DB', borderRadius: 2,
    alignSelf: 'center', marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16, fontWeight: '700', color: '#111827',
    paddingHorizontal: 20, marginBottom: 8,
  },
  cityOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  cityOptionActive: { backgroundColor: '#EFF6FF' },
  cityOptionText: { fontSize: 15, color: '#374151' },
  cityOptionTextActive: { color: '#2563EB', fontWeight: '700' },
  checkmark: { fontSize: 16, color: '#2563EB', fontWeight: '700' },
  noCitiesText: { textAlign: 'center', color: '#9CA3AF', padding: 20, fontSize: 14 },
});
