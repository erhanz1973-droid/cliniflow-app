// app/clinic-onboarding.tsx
// Post-registration clinic selection — multi-select (max 3), city filter, search.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView, ActivityIndicator, Alert, Modal, Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/language-context';
import { API_BASE } from '../lib/api';

const MAX_SELECT = 3;
const ALL = '__ALL__';

type Clinic = {
  id: string;
  clinic_code: string;
  name: string;
  city: string | null;
  address: string | null;
};

export default function ClinicOnboardingScreen() {
  const router          = useRouter();
  const { user } = useAuth();
  const { t }           = useLanguage();

  const [query, setQuery]               = useState('');
  const [clinics, setClinics]           = useState<Clinic[]>([]);
  const [cities, setCities]             = useState<string[]>([]);
  const [selectedCity, setSelectedCity] = useState<string>(ALL);
  const [loading, setLoading]           = useState(true);
  const [submitting]     = useState(false); // kept for footer btn style reuse
  const [cityModal, setCityModal]       = useState(false);

  // Multi-select state
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── fetch helper ──────────────────────────────────────────────────────────
  const fetchClinics = useCallback(async (q: string, city: string) => {
    setLoading(true);
    try {
      let url: string;
      if (q.trim()) {
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

  // Initial load — also extract unique cities
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res  = await fetch(`${API_BASE}/api/clinics`);
        const data = await res.json();
        const list: Clinic[] = data?.clinics || [];
        setClinics(list);
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

  // ── Search (debounced) ────────────────────────────────────────────────────
  const onSearch = (text: string) => {
    setQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchClinics(text, selectedCity), 350);
  };
  const clearSearch = () => { setQuery(''); fetchClinics('', selectedCity); };

  // ── City selection ────────────────────────────────────────────────────────
  const chooseCity = (city: string) => {
    setSelectedCity(city);
    setCityModal(false);
    fetchClinics(query, city);
  };

  // ── Multi-select toggle ───────────────────────────────────────────────────
  const toggleClinic = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= MAX_SELECT) {
          Alert.alert(
            'Maximum reached',
            `You can select up to ${MAX_SELECT} clinics.`
          );
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  // ── Submit: navigate to quote-request screen with selected clinics ──
  const handleGetQuotes = () => {
    if (selected.size === 0) {
      Alert.alert('No clinic selected', 'Please select at least 1 clinic.');
      return;
    }
    const selectedClinics = clinics.filter(c => selected.has(c.id));
    const clinicsParam    = encodeURIComponent(JSON.stringify(selectedClinics));
    router.push(`/quote-request?clinics=${clinicsParam}` as any);
  };

  const skipAndContinue = () => router.replace('/(patient)' as any);

  // ── Render helpers ────────────────────────────────────────────────────────
  const cityLabel    = selectedCity === ALL ? (t('clinicOnboard.allCities') || 'All Cities') : selectedCity;
  const selCount     = selected.size;
  const limitReached = selCount >= MAX_SELECT;

  const renderClinic = ({ item }: { item: Clinic }) => {
    const isSelected  = selected.has(item.id);
    const isDisabled  = !isSelected && limitReached;

    return (
      <TouchableOpacity
        style={[
          styles.card,
          isSelected  && styles.cardSelected,
          isDisabled  && styles.cardDisabled,
        ]}
        onPress={() => toggleClinic(item.id)}
        activeOpacity={isDisabled ? 1 : 0.75}
      >
        {/* Checkbox */}
        <View style={[styles.checkbox, isSelected && styles.checkboxChecked]}>
          {isSelected && <Text style={styles.checkboxTick}>✓</Text>}
        </View>

        {/* Info */}
        <View style={styles.cardInfo}>
          <Text style={[styles.cardName, isDisabled && { color: '#9CA3AF' }]}>{item.name}</Text>
          {item.city   ? <Text style={styles.cardCity}>📍 {item.city}</Text>   : null}
          {item.address ? <Text style={styles.cardAddr} numberOfLines={1}>{item.address}</Text> : null}
          <Text style={styles.cardCode}>{item.clinic_code}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const emptyTitle = query
    ? (t('clinicOnboard.emptySearch') || 'No results')
    : selectedCity !== ALL
      ? (t('clinicOnboard.emptyCity') || 'No clinics in this city')
      : (t('clinicOnboard.empty') || 'No clinics found');

  return (
    <SafeAreaView style={styles.safe}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.title}>{t('clinicOnboard.title') || 'Find a Clinic'}</Text>
        <Text style={styles.subtitle}>
          {t('clinicOnboard.subtitle') || 'Select up to 3 clinics to get quotes'}
        </Text>
        {/* Info text */}
        <View style={styles.infoBanner}>
          <Text style={styles.infoText}>
            ℹ️  To ensure fast responses, your request will be sent to up to {MAX_SELECT} clinics.
          </Text>
        </View>
      </View>

      {/* ── City selector ── */}
      <View style={styles.cityRow}>
        <Text style={styles.cityLabel}>{t('clinicOnboard.cityLabel') || 'City'}</Text>
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
          placeholder={t('clinicOnboard.searchPlaceholder') || 'Search clinic name or code...'}
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

      {/* ── Counter bar ── */}
      <View style={styles.counterBar}>
        <Text style={styles.counterText}>
          Selected:{' '}
          <Text style={[styles.counterNum, limitReached && styles.counterNumMax]}>
            {selCount}
          </Text>
          {' '}/ {MAX_SELECT}
        </Text>
        {selCount > 0 && (
          <TouchableOpacity onPress={() => setSelected(new Set())}>
            <Text style={styles.clearAllBtn}>Clear all</Text>
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
              <View style={styles.emptyActions}>
                {selectedCity !== ALL && (
                  <TouchableOpacity style={styles.emptyActionBtn} onPress={() => chooseCity(ALL)}>
                    <Text style={styles.emptyActionText}>{t('clinicOnboard.showAll') || 'Show all cities'}</Text>
                  </TouchableOpacity>
                )}
                {query.length > 0 && (
                  <TouchableOpacity style={[styles.emptyActionBtn, styles.emptyActionBtnGhost]} onPress={clearSearch}>
                    <Text style={styles.emptyActionTextGhost}>{t('clinicOnboard.clearSearch') || 'Clear search'}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={[styles.emptyActionBtn, styles.emptyActionBtnGhost]} onPress={skipAndContinue}>
                  <Text style={styles.emptyActionTextGhost}>{t('clinicOnboard.skipShort') || 'Continue without clinic'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          }
        />
      )}

      {/* ── Footer ── */}
      <View style={styles.footer}>
        {selCount > 0 ? (
          <TouchableOpacity
            style={[styles.quoteBtn, submitting && styles.quoteBtnDisabled]}
            onPress={handleGetQuotes}
            disabled={submitting}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.quoteBtnText}>
                  Get Quotes from {selCount} Clinic{selCount > 1 ? 's' : ''}
                </Text>
            }
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.skipBtn} onPress={skipAndContinue}>
            <Text style={styles.skipText}>{t('clinicOnboard.skip') || 'Continue without clinic'}</Text>
          </TouchableOpacity>
        )}
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
            <Text style={styles.modalTitle}>{t('clinicOnboard.cityLabel') || 'City'}</Text>
            <ScrollView>
              <TouchableOpacity
                style={[styles.cityOption, selectedCity === ALL && styles.cityOptionActive]}
                onPress={() => chooseCity(ALL)}
              >
                <Text style={[styles.cityOptionText, selectedCity === ALL && styles.cityOptionTextActive]}>
                  🌍 {t('clinicOnboard.allCities') || 'All Cities'}
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
                <Text style={styles.noCitiesText}>{t('clinicOnboard.noCities') || 'No cities available'}</Text>
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

  // Header
  header: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 10 },
  title: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 3 },
  subtitle: { fontSize: 13, color: '#6B7280', lineHeight: 18, marginBottom: 10 },
  infoBanner: {
    backgroundColor: '#EFF6FF', borderRadius: 10, borderWidth: 1,
    borderColor: '#BFDBFE', paddingHorizontal: 12, paddingVertical: 8,
  },
  infoText: { fontSize: 12, color: '#1D4ED8', lineHeight: 17 },

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
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, fontSize: 14, color: '#111827' },
  clearBtn: { fontSize: 14, color: '#9CA3AF', paddingHorizontal: 4 },

  // Counter bar
  counterBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7,
  },
  counterText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  counterNum: { fontSize: 14, fontWeight: '800', color: '#2563EB' },
  counterNumMax: { color: '#EF4444' },
  clearAllBtn: { fontSize: 12, color: '#6B7280', fontWeight: '600', textDecorationLine: 'underline' },

  // List
  list: { paddingHorizontal: 16, paddingBottom: 16 },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB',
    padding: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  cardSelected: {
    borderColor: '#2563EB', backgroundColor: '#EFF6FF',
    shadowColor: '#2563EB', shadowOpacity: 0.12,
  },
  cardDisabled: { opacity: 0.45 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 2 },
  cardCity: { fontSize: 12, color: '#6B7280', marginBottom: 2 },
  cardAddr: { fontSize: 11, color: '#9CA3AF', marginBottom: 3 },
  cardCode: { fontSize: 10, color: '#9CA3AF', fontWeight: '600', letterSpacing: 0.5 },

  // Checkbox
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB',
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  checkboxTick: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 16 },

  // Empty state
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 50, paddingHorizontal: 24 },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#374151', textAlign: 'center', marginBottom: 20 },
  emptyActions: { gap: 10, width: '100%' },
  emptyActionBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  emptyActionBtnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#D1D5DB' },
  emptyActionText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyActionTextGhost: { color: '#6B7280', fontWeight: '600', fontSize: 14 },

  // Footer
  footer: {
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
    backgroundColor: '#fff', paddingVertical: 14, paddingHorizontal: 20,
  },
  quoteBtn: {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  quoteBtnDisabled: { backgroundColor: '#93C5FD' },
  quoteBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  skipBtn: { alignItems: 'center', paddingVertical: 4 },
  skipText: { fontSize: 14, color: '#6B7280', fontWeight: '600' },

  // City modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, paddingBottom: 32, maxHeight: '70%',
  },
  modalHandle: {
    width: 36, height: 4, backgroundColor: '#D1D5DB', borderRadius: 2,
    alignSelf: 'center', marginBottom: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827', paddingHorizontal: 20, marginBottom: 8 },
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
