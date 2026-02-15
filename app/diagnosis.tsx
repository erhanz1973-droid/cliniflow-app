import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { API_BASE } from '../lib/api';
import ICD10Dropdown from '../components/ICD10Dropdown';

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
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  
  // Form state
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState<{ code: string; description: string }>({ code: '', description: '' });
  const [secondaryDiagnoses, setSecondaryDiagnoses] = useState<{ code: string; description: string }[]>([{ code: '', description: '' }]);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (encounterId) {
      loadEncounterData();
    } else {
      // Create new encounter first
      createEncounter();
    }
  }, [patientId, encounterId]);

  const createEncounter = async () => {
    try {
      setLoading(true);
      console.log("[DIAGNOSIS] Creating new encounter for patient:", patientId);
      
      const response = await fetch(`${API_BASE}/api/treatment/encounters`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user?.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patient_id: patientId
        })
      });

      const encounterData = await response.json();
      console.log("[DIAGNOSIS] New encounter created:", encounterData);
      
      if (response.ok) {
        setEncounter(encounterData);
      } else {
        console.error("[DIAGNOSIS] Failed to create encounter:", encounterData);
        Alert.alert('Hata', 'Muayene oluşturulamadı');
      }
    } catch (error) {
      console.error('Create encounter error:', error);
      Alert.alert('Hata', 'Muayene oluşturulamadı');
    } finally {
      setLoading(false);
    }
  };

  const loadEncounterData = async () => {
    try {
      setLoading(true);
      
      // Get encounter data
      const encounterResponse = await fetch(`${API_BASE}/api/treatment/encounters/${encounterId}`, {
        headers: {
          'Authorization': `Bearer ${user?.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const encounterData = await encounterResponse.json();
      console.log("[DIAGNOSIS] Encounter data:", encounterData);
      setEncounter(encounterData);
      
      // Get existing diagnoses
      const diagnosesResponse = await fetch(`${API_BASE}/api/treatment/encounters/${encounterId}/diagnoses`, {
        headers: {
          'Authorization': `Bearer ${user?.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const diagnosesData = await diagnosesResponse.json();
      console.log("[DIAGNOSIS] Diagnoses response:", diagnosesData);
      
      // 🔥 CRITICAL: Handle different response formats
      const diagnosesArray = Array.isArray(diagnosesData) 
        ? diagnosesData 
        : diagnosesData?.data || diagnosesData?.diagnoses || [];
      
      console.log("[DIAGNOSIS] Parsed diagnoses array:", diagnosesArray);
      setDiagnoses(diagnosesArray);
      
      // Pre-fill form with existing data
      const primaryDiagnosis = diagnosesArray.find((d: any) => d.is_primary);
      if (primaryDiagnosis) {
        setPrimaryDiagnosis({
          code: primaryDiagnosis.icd10_code,
          description: primaryDiagnosis.icd10_description
        });
      }
      
      const secondaryDiagnoses = diagnosesArray.filter((d: any) => !d.is_primary);
      if (secondaryDiagnoses.length > 0) {
        setSecondaryDiagnoses(secondaryDiagnoses.map((d: any) => ({ 
          code: d.icd10_code, 
          description: d.icd10_description 
        })));
      }
      
    } catch (error) {
      console.error('Load encounter error:', error);
      Alert.alert('Hata', 'Veri yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const addSecondaryDiagnosis = () => {
    setSecondaryDiagnoses([...secondaryDiagnoses, { code: '', description: '' }]);
  };

  const removeSecondaryDiagnosis = (index: number) => {
    const newSecondaryDiagnoses = secondaryDiagnoses.filter((_, i) => i !== index);
    setSecondaryDiagnoses(newSecondaryDiagnoses);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      
      // Validate primary diagnosis
      if (!primaryDiagnosis.code) {
        Alert.alert('Hata', 'Birincil tanı seçilmelidir');
        return;
      }

      // Only one primary diagnosis allowed
      const hasPrimaryInSecondary = secondaryDiagnoses.some(d => d.code === primaryDiagnosis.code);
      if (hasPrimaryInSecondary) {
        Alert.alert('Hata', 'Birincil tanı ikincil tanılar olarak eklenemez');
        return;
      }

      // Prepare diagnoses array
      const diagnosesToSubmit = [
        {
          icd10_code: primaryDiagnosis.code,
          icd10_description: primaryDiagnosis.description,
          is_primary: true
        },
        ...secondaryDiagnoses.filter(d => d.code).map(d => ({
          icd10_code: d.code,
          icd10_description: d.description,
          is_primary: false
        }))
      ];

      console.log("[DIAGNOSIS] Submitting diagnoses:", diagnosesToSubmit);

      const response = await fetch(`${API_BASE}/api/treatment/encounters/${encounterId}/diagnoses`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user?.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          diagnoses: diagnosesToSubmit
        })
      });

      const result = await response.json();
      console.log("[DIAGNOSIS] Submit response:", result);

      if (response.ok) {
        Alert.alert('Başarılı', 'Tanılar kaydedildi');
        router.back();
      } else {
        Alert.alert('Hata', result.message || 'Tanılar kaydedilemedi');
      }
    } catch (error) {
      console.error('Submit diagnoses error:', error);
      Alert.alert('Hata', 'Tanılar kaydedilemedi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tanı Belirleme</Text>
        <Text style={styles.subtitle}>Hasta: {patientId}</Text>
        {encounter && encounter.id && (
          <Text style={styles.encounterInfo}>Muayene #{encounter.id.substring(0, 8)}</Text>
        )}
      </View>

      {/* Primary Diagnosis (Zorunlu) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔴 Birincil Tanı (Zorunlu)</Text>
        
        <ICD10Dropdown
          selectedCode={primaryDiagnosis.code}
          onCodeSelect={(code) => setPrimaryDiagnosis({ code: code.code, description: code.description })}
          placeholder="ICD-10 kodu ara..."
        />
        
        <TextInput
          style={styles.input}
          placeholder="Açıklama"
          value={primaryDiagnosis.description}
          onChangeText={setPrimaryDiagnosis}
          multiline
          numberOfLines={3}
          editable={false} // Read-only, populated from dropdown
        />
      </View>

      {/* Secondary Diagnoses */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔵 İkincil Tanılar</Text>
        
        {secondaryDiagnoses.map((diagnosis, index) => (
          <View key={index} style={styles.secondaryDiagnosisRow}>
            <View style={styles.secondaryDiagnosisInput}>
              <ICD10Dropdown
                selectedCode={diagnosis.code}
                onCodeSelect={(code) => {
                  const newSecondaryDiagnoses = [...secondaryDiagnoses];
                  newSecondaryDiagnoses[index] = { code: code.code, description: code.description };
                  setSecondaryDiagnoses(newSecondaryDiagnoses);
                }}
                placeholder="ICD-10 kodu ara..."
              />
              
              <TextInput
                style={styles.secondaryInput}
                placeholder="Açıklama"
                value={diagnosis.description}
                onChangeText={(text: string) => {
                  const newSecondaryDiagnoses = [...secondaryDiagnoses];
                  newSecondaryDiagnoses[index] = { code: diagnosis.code, description: text };
                  setSecondaryDiagnoses(newSecondaryDiagnoses);
                }}
                multiline
                numberOfLines={2}
                editable={false} // Read-only, populated from dropdown
              />
            </View>
            
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => removeSecondaryDiagnosis(index)}
            >
              <Text style={styles.removeButtonText}>Sil</Text>
            </TouchableOpacity>
          </View>
        ))}
        
        <TouchableOpacity style={styles.addButton} onPress={addSecondaryDiagnosis}>
          <Text style={styles.addButtonText}>+ İkincil Tanı Ekle</Text>
        </TouchableOpacity>
      </View>

      {/* Notes */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📝 Notlar</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="Ek notlar..."
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
        />
      </View>

      {/* Submit Button */}
      <TouchableOpacity 
        style={[styles.submitButton, loading && styles.submitButtonDisabled]} 
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Tanıları Kaydet</Text>
        )}
      </TouchableOpacity>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
  },
  encounterInfo: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: '600',
  },
  section: {
    backgroundColor: '#fff',
    margin: 10,
    padding: 15,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  secondaryDiagnosisRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  secondaryDiagnosisInput: {
    flex: 1,
    marginRight: 10,
  },
  secondaryInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    backgroundColor: '#fff',
  },
  removeButton: {
    backgroundColor: '#ff4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    margin: 20,
  },
  submitButtonDisabled: {
    backgroundColor: '#ccc',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
