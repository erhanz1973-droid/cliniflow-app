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

  /* ------------------ ICD SEARCH ------------------ */

  const searchIcd = async (query: string) => {
  setPrimaryQuery(query);

  if (!query || query.length < 2) {
    setIcdResults([]);
    return;
  }

  try {
    console.log("ICD search triggered:", query);

    const response = await secureFetch(
      `/api/icd/search?q=${encodeURIComponent(query)}` 
    );

    const data = await response.json();

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

      const list = diagnosesData?.data || diagnosesData || [];

      const primary = list.find((d: Diagnosis) => d.is_primary);
      if (primary) {
        setPrimaryDiagnosis({
          code: primary.icd10_code,
          description: primary.icd10_description
        });
        setPrimaryQuery(primary.icd10_code);
      }

      const secondary = list.filter((d: Diagnosis) => !d.is_primary);
      if (secondary.length > 0) {
        setSecondaryDiagnoses(
          secondary.map((d: Diagnosis) => ({
            code: d.icd10_code,
            description: d.icd10_description
          }))
        );
      }
    } catch (error) {
      Alert.alert('Hata', 'Veri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  /* ------------------ TOOTH ------------------ */

  const toggleTooth = (tooth: string) => {
    setSelectedTeeth(prev =>
      prev.includes(tooth)
        ? prev.filter(t => t !== tooth)
        : [...prev, tooth]
    );
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
          is_primary: true
        },
        ...secondaryDiagnoses
          .filter(d => d.code)
          .map(d => ({
            icd10_code: d.code,
            icd10_description: d.description,
            is_primary: false
          }))
      ];

      await securePost(
        API_ROUTES.doctor.encounterDiagnoses(finalEncounterId),
        {
          diagnoses: diagnosesToSubmit,
          toothNumbers: selectedTeeth,
          notes
        },
        user?.token
      );

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
            {selectedTeeth.length === 0 ? (
              <Text style={{ color: '#888' }}>Diş seçilmedi</Text>
            ) : (
              selectedTeeth.map(t => (
                <View key={t} style={styles.toothChip}>
                  <Text style={{ color: '#fff' }}>{t}</Text>
                </View>
              ))
            )}
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setIsToothModalVisible(true)}
          >
            <Text style={styles.primaryButtonText}>Diş Seç</Text>
          </TouchableOpacity>
        </View>

        {/* Primary */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔴 Birincil Tanı</Text>

          <TextInput
            value={primaryQuery}
            onChangeText={searchIcd}
            placeholder="ICD-10 kodu ara..."
            style={styles.input}
          />

          {icdResults.length > 0 && (
            <View style={styles.dropdown}>
              <ScrollView keyboardShouldPersistTaps="handled">
                {icdResults.map((item, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.dropdownItem}
                    onPress={() => {
                      setPrimaryDiagnosis({
                        code: item.code,
                        description: item.category
                      });
                      setPrimaryQuery(item.code);
                      setIcdResults([]);
                    }}
                  >
                    <Text style={{ fontWeight: 'bold' }}>{item.code}</Text>
                    <Text style={{ fontSize: 12, color: '#666' }}>
                      {item.category}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Secondary */}
        <View style={styles.section}>
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
          disabled={loading}
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
  dropdown: {
    backgroundColor: '#fff',
    borderRadius: 8,
    maxHeight: 200,
    marginTop: 5,
    borderWidth: 1,
    borderColor: '#eee'
  },
  dropdownItem: { padding: 10, borderBottomWidth: 1, borderColor: '#eee' },
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
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 16 }
});
