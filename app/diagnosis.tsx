import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  Modal
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { API_ROUTES } from '../lib/api-routes';
import { securePost, secureGet, secureFetch } from '../lib/secure-fetch';

interface Diagnosis {
  icd10_code: string;
  icd10_description: string;
  is_primary: boolean;
  tooth_number?: string;
}

export default function DiagnosisScreen() {
  const router = useRouter();
  const { patientId, encounterId } = useLocalSearchParams();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [encounter, setEncounter] = useState<any>(null);

  const [primaryDiagnosis, setPrimaryDiagnosis] = useState<{ code: string; description: string }>({
    code: '',
    description: ''
  });

  const [primaryQuery, setPrimaryQuery] = useState('');
  const [icdResults, setIcdResults] = useState<any[]>([]);

  const [secondaryDiagnoses, setSecondaryDiagnoses] = useState<
    { code: string; description: string }[]
  >([]);

  const [notes, setNotes] = useState('');
  const [selectedTeeth, setSelectedTeeth] = useState<string[]>([]);
  const [isToothModalVisible, setIsToothModalVisible] = useState(false);
  const [isIcdModalVisible, setIsIcdModalVisible] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeTooth, setActiveTooth] = useState<string | null>(null);

  /* ------------------ ICD SEARCH ------------------ */

  const searchIcd = async (query: string) => {
  setPrimaryQuery(query);

  if (!query) {
    setIcdResults([]);
    return;
  }

  // Intelligent minimum length logic
  if (query.length === 1 && !/[0-9]/.test(query)) {
    setIcdResults([]);
    return;
  }

  try {
    setSearching(true);
    console.log("ICD search triggered:", query);

    const data = await secureFetch(
      `/api/icd/search?q=${encodeURIComponent(query)}` 
    );

    console.log("ICD API RESPONSE:", data);

    const results =
      data?.results ||
      data?.data ||
      data?.diagnoses ||
      [];

    setIcdResults(results);

  } catch (err) {
    console.log("ICD search error:", err);
    setIcdResults([]);
  } finally {
    setSearching(false);
  }
};

  /* ------------------ ENCOUNTER INIT ------------------ */

  useEffect(() => {
    if (!patientId) return;

    if (encounterId) {
      loadEncounter();
    } else {
      createEncounter();
    }
  }, [patientId, encounterId]);

  const createEncounter = async () => {
    try {
      setLoading(true);

      const result = await securePost(
        API_ROUTES.doctor.encounters,
        {
          patient_id: patientId,
          notes: 'Initial examination for diagnosis'
        },
        user?.token
      );

      setEncounter(result?.encounter || result);
    } catch (error) {
      Alert.alert('Hata', 'Muayene oluşturulamadı');
    } finally {
      setLoading(false);
    }
  };

  const loadEncounter = async () => {
    try {
      setLoading(true);

      const encounterData = await secureGet(
        API_ROUTES.doctor.encounterById(encounterId as string),
        user?.token
      );

      setEncounter(encounterData);

      const diagnosesData = await secureGet(
        API_ROUTES.doctor.encounterDiagnoses(encounterId as string),
        user?.token
      );

      console.log("DIAGNOSES API RESPONSE:", diagnosesData);

      const list =
        diagnosesData?.diagnoses ||
        diagnosesData?.data ||
        [];

      console.log("PARSED DIAGNOSES LIST:", list);

      // Filter diagnoses by selected tooth
      const toothDiagnoses = activeTooth 
        ? list.filter((d: Diagnosis) => d.tooth_number === activeTooth)
        : [];

      console.log("FILTERED TOOTH DIAGNOSES:", toothDiagnoses);

      const primary = toothDiagnoses.find((d: Diagnosis) => d.is_primary);
      if (primary) {
        setPrimaryDiagnosis({
          code: primary.icd10_code,
          description: primary.icd10_description
        });
        setPrimaryQuery(primary.icd10_code);
      }

      const secondary = toothDiagnoses.filter((d: Diagnosis) => !d.is_primary);
      if (secondary.length > 0) {
        setSecondaryDiagnoses(
          secondary.map((d: Diagnosis) => ({
            code: d.icd10_code,
            description: d.icd10_description
          }))
        );
      }
    } catch (error) {
      console.log("LOAD ENCOUNTER ERROR:", error);
      Alert.alert('Hata', 'Veri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  /* ------------------ TOOTH ------------------ */

  const toggleTooth = (tooth: string) => {
    setActiveTooth(tooth);
    // Reset diagnosis form when changing tooth
    setPrimaryDiagnosis({ code: '', description: '' });
    setSecondaryDiagnoses([]);
  };

  /* ------------------ SECONDARY ------------------ */

  const addSecondary = () => {
    setSecondaryDiagnoses(prev => [...prev, { code: '', description: '' }]);
  };

  const removeSecondary = (index: number) => {
    setSecondaryDiagnoses(prev => prev.filter((_, i) => i !== index));
  };

  /* ------------------ SUBMIT ------------------ */

  const handleSubmit = async () => {
    if (loading) return;
    
    const finalEncounterId = encounterId || encounter?.id;

    if (!finalEncounterId) {
      Alert.alert('Hata', 'Muayene bulunamadı');
      return;
    }

    if (!primaryDiagnosis.code) {
      Alert.alert('Hata', 'Birincil tanı seçilmelidir');
      return;
    }

    try {
      setLoading(true);

      const diagnosesToSubmit = [
        {
          icd10_code: primaryDiagnosis.code,
          icd10_description: primaryDiagnosis.description,
          is_primary: true,
          tooth_number: activeTooth
        },
        ...secondaryDiagnoses
          .filter(d => d.code)
          .map(d => ({
            icd10_code: d.code,
            icd10_description: d.description,
            is_primary: false,
            tooth_number: activeTooth
          }))
      ];

      console.log("SUBMITTING DIAGNOSES:", diagnosesToSubmit);
      console.log("PRIMARY DIAGNOSIS:", primaryDiagnosis);
      console.log("SECONDARY DIAGNOSES:", secondaryDiagnoses);

      await securePost(
        API_ROUTES.doctor.encounterDiagnoses(finalEncounterId),
        {
          diagnoses: diagnosesToSubmit,
          toothNumbers: selectedTeeth,
          notes
        },
        user?.token
      );

      console.log("DIAGNOSES SAVED SUCCESSFULLY");
      Alert.alert('Başarılı', 'Tanılar kaydedildi');
      router.back();
    } catch (error) {
      Alert.alert('Hata', 'Kaydedilemedi');
    } finally {
      setLoading(false);
    }
  };

  /* ------------------ RENDER ------------------ */

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">

    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🦷 Diş Seçimi</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {!activeTooth ? (
          <Text style={{ color: '#888', padding: 10 }}>Lütfen bir diş seçin</Text>
        ) : (
          <View style={styles.toothChip}>
            <Text style={styles.toothChipText}>{activeTooth}</Text>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10 }}>
        {[...Array(32)].map((_, i) => {
          const tooth = (i + 1).toString();
          return (
            <TouchableOpacity
              key={tooth}
              style={[
                styles.toothButton,
                activeTooth === tooth && styles.toothButtonActive
              ]}
              onPress={() => toggleTooth(tooth)}
            >
              <Text style={[
                styles.toothButtonText,
                activeTooth === tooth && styles.toothButtonTextActive
              ]}>
                {tooth}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>

    {/* Primary */}
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🔴 Birincil Tanı</Text>

      <TouchableOpacity
        style={styles.icdSelector}
        onPress={() => setIsIcdModalVisible(true)}
      >
        <Text style={styles.icdSelectorText}>
          {primaryDiagnosis.code 
            ? `${primaryDiagnosis.code} - ${primaryDiagnosis.description}`
            : "ICD-10 kodu seçmek için dokunun..."
          }
        </Text>
        <Text style={styles.icdSelectorIcon}>🔍</Text>
      </TouchableOpacity>
    </View>

    {/* Secondary */}
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>🔵 İkincil Tanılar</Text>
          <Text style={styles.sectionTitle}>🔵 İkincil Tanılar</Text>

          {secondaryDiagnoses.map((d, index) => (
            <View key={index} style={styles.secondaryRow}>
              <TextInput
                style={styles.secondaryInput}
                placeholder="Kod"
                value={d.code}
                onChangeText={(text) => {
                  const copy = [...secondaryDiagnoses];
                  copy[index].code = text;
                  setSecondaryDiagnoses(copy);
                }}
              />

              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeSecondary(index)}
              >
                <Text style={{ color: '#fff' }}>Sil</Text>
              </TouchableOpacity>
            </View>
          ))}

          <TouchableOpacity style={styles.addButton} onPress={addSecondary}>
            <Text style={{ color: '#fff' }}>+ Ekle</Text>
          </TouchableOpacity>
        </View>

        {/* Notes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 Not</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>

        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={loading || !primaryDiagnosis.code || !activeTooth}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitText}>Kaydet</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      {/* Tooth Modal */}
      <Modal visible={isToothModalVisible} animationType="slide">
        <View style={{ flex: 1, padding: 20 }}>
          {[["18","17","16","15","14","13","12","11"],
            ["21","22","23","24","25","26","27","28"],
            ["48","47","46","45","44","43","42","41"],
            ["31","32","33","34","35","36","37","38"]].map((row, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6 }}>
              {row.map(t => {
                const selected = selectedTeeth.includes(t);
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => toggleTooth(t)}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 6,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? '#1976D2' : '#E0E0E0'
                    }}
                  >
                    <Text style={{ color: selected ? '#fff' : '#000' }}>{t}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setIsToothModalVisible(false)}
          >
            <Text style={styles.primaryButtonText}>Tamam</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ICD Search Modal */}
      <Modal visible={isIcdModalVisible} animationType="slide">
        <View style={styles.icdModalContainer}>
          {/* Modal Header */}
          <View style={styles.icdModalHeader}>
            <TouchableOpacity onPress={() => {
              setIsIcdModalVisible(false);
              setPrimaryQuery('');
              setIcdResults([]);
            }}>
              <Text style={styles.icdModalCloseButton}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.icdModalTitle}>ICD-10 Kodu Arama</Text>
            <View style={{ width: 30 }} />
          </View>

          {/* Search Input */}
          <View style={styles.icdSearchSection}>
            <TextInput
              style={styles.icdSearchInput}
              placeholder="ICD-10 kodu veya açıklama ara..."
              value={primaryQuery}
              onChangeText={searchIcd}
              autoFocus
            />
          </View>

          {/* Search Results */}
          <View style={styles.icdResultsSection}>
            {searching ? (
              <View style={styles.icdLoadingState}>
                <ActivityIndicator size="large" color="#007AFF" />
                <Text style={styles.icdLoadingText}>Aranıyor...</Text>
              </View>
            ) : icdResults.length > 0 ? (
              <ScrollView keyboardShouldPersistTaps="handled">
                {icdResults.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.icdResultItem}
                    onPress={() => {
                      setPrimaryDiagnosis({
                        code: item.code || item.icd10_code,
                        description: item.category || item.icd10_description
                      });
                      setIsIcdModalVisible(false);
                      setPrimaryQuery('');
                      setIcdResults([]);
                    }}
                  >
                    <Text style={styles.icdResultCode}>
                      {item.code || item.icd10_code}
                    </Text>
                    <Text style={styles.icdResultDescription}>
                      {item.category || item.icd10_description}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.icdEmptyState}>
                {primaryQuery.length === 1 && !/[0-9]/.test(primaryQuery) ? (
                  <View>
                    <Text style={styles.icdEmptyText}>
                      ICD kodu için en az 2 karakter girin (örn: K0)
                    </Text>
                    <Text style={styles.icdHelperText}>
                      Tek harf araması için rakam içermeli (örn: M1)
                    </Text>
                  </View>
                ) : primaryQuery.length === 0 ? (
                  <Text style={styles.icdEmptyText}>
                    ICD-10 kodu veya açıklama girin...
                  </Text>
                ) : (
                  <Text style={styles.icdEmptyText}>
                    Sonuç bulunamadı
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ------------------ STYLES ------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  section: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 15,
    borderRadius: 10
  },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 8
  },
  toothChip: {
    backgroundColor: '#1976D2',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 16,
    marginRight: 6,
    marginBottom: 6
  },
  primaryButton: {
    backgroundColor: '#1976D2',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10
  },
  primaryButtonText: { color: '#fff', fontWeight: 'bold' },
  secondaryRow: { flexDirection: 'row', marginBottom: 10 },
  secondaryInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 8
  },
  removeButton: {
    backgroundColor: '#ff4444',
    marginLeft: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: 8
  },
  addButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center'
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 10,
    borderRadius: 8,
    minHeight: 80
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    margin: 20
  },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  
  // ICD Selector Styles
  icdSelector: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  icdSelectorText: {
    flex: 1,
    fontSize: 16,
    color: '#000'
  },
  icdSelectorIcon: {
    fontSize: 18,
    color: '#666'
  },
  
  // ICD Modal Styles
  icdModalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  icdModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  icdModalCloseButton: {
    fontSize: 24,
    color: '#666',
    padding: 5
  },
  icdModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000'
  },
  icdSearchSection: {
    padding: 20,
    backgroundColor: '#fff'
  },
  icdSearchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 15,
    borderRadius: 10,
    fontSize: 16,
    backgroundColor: '#fff'
  },
  icdResultsSection: {
    flex: 1,
    padding: 20
  },
  icdResultItem: {
    backgroundColor: '#fff',
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee'
  },
  icdResultCode: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 5
  },
  icdResultDescription: {
    fontSize: 14,
    color: '#666'
  },
  icdEmptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  icdEmptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center'
  },
  icdHelperText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginTop: 8
  },
  icdLoadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40
  },
  icdLoadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
    textAlign: 'center'
  },
  toothChipText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold'
  },
  toothButton: {
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4
  },
  toothButtonActive: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF'
  },
  toothButtonText: {
    fontSize: 12,
    color: '#333',
    fontWeight: 'bold'
  },
  toothButtonTextActive: {
    color: '#fff'
  }
});
