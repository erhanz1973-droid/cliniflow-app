import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { API_BASE } from '../lib/api';

export default function DiagnosisScreen() {
  const router = useRouter();
  const { patientId, encounterId } = useLocalSearchParams();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [encounter, setEncounter] = useState(null);
  const [diagnoses, setDiagnoses] = useState([]);
  
  // Form state
  const [primaryICD10, setPrimaryICD10] = useState('');
  const [primaryDescription, setPrimaryDescription] = useState('');
  const [secondaryICD10s, setSecondaryICD10s] = useState([{ code: '', description: '' }]);
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
      
      const response = await fetch(`${API_BASE}/api/treatment/encounters`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          patient_id: patientId,
          encounter_type: 'initial'
        })
      });
      
      if (response.ok) {
        const newEncounter = await response.json();
        setEncounter(newEncounter);
        router.replace({ 
          pathname: '/diagnosis', 
          params: { patientId, encounterId: newEncounter.id } 
        });
      } else {
        throw new Error('Failed to create encounter');
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
      
      // Get encounter details
      const encounterResponse = await fetch(`${API_BASE}/api/treatment/encounters/${encounterId}`, {
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const encounterData = await encounterResponse.json();
      setEncounter(encounterData);
      
      // Get existing diagnoses
      const diagnosesResponse = await fetch(`${API_BASE}/api/treatment/encounters/${encounterId}/diagnoses`, {
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const diagnosesData = await diagnosesResponse.json();
      setDiagnoses(diagnosesData);
      
      // Pre-fill form with existing data
      const primaryDiagnosis = diagnosesData.find(d => d.is_primary);
      if (primaryDiagnosis) {
        setPrimaryICD10(primaryDiagnosis.icd10_code);
        setPrimaryDescription(primaryDiagnosis.icd10_description);
      }
      
      const secondaryDiagnoses = diagnosesData.filter(d => !d.is_primary);
      if (secondaryDiagnoses.length > 0) {
        setSecondaryICD10s(secondaryDiagnoses.map(d => ({ 
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
    setSecondaryICD10s([...secondaryICD10s, { code: '', description: '' }]);
  };

  const updateSecondaryDiagnosis = (index, field, value) => {
    const updated = [...secondaryICD10s];
    updated[index][field] = value;
    setSecondaryICD10s(updated);
  };

  const removeSecondaryDiagnosis = (index) => {
    setSecondaryICD10s(secondaryICD10s.filter((_, i) => i !== index));
  };

  const validateAndSave = async () => {
    // Validation
    if (!primaryICD10.trim()) {
      Alert.alert('Hata', 'Birincil ICD-10 kodu zorunludur');
      return;
    }
    
    if (!primaryDescription.trim()) {
      Alert.alert('Hata', 'Birincil tanı açıklaması zorunludur');
      return;
    }

    // Validate secondary diagnoses
    const validSecondary = secondaryICD10s.filter(d => d.code.trim() || d.description.trim());
    for (const secondary of validSecondary) {
      if (secondary.code.trim() && !secondary.description.trim()) {
        Alert.alert('Hata', 'İkincil tanılar için kod girildiğinde açıklama zorunludur');
        return;
      }
      if (!secondary.code.trim() && secondary.description.trim()) {
        Alert.alert('Hata', 'İkincil tanılar için açıklama girildiğinde kod zorunludur');
        return;
      }
    }

    try {
      setLoading(true);
      
      // Clear existing diagnoses first
      for (const diagnosis of diagnoses) {
        await fetch(`${API_BASE}/api/treatment/encounters/${encounterId}/diagnoses/${diagnosis.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${user.token}`,
            'Content-Type': 'application/json'
          }
        });
      }
      
      // Add primary diagnosis
      await fetch(`${API_BASE}/api/treatment/encounters/${encounterId}/diagnoses`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          icd10_code: primaryICD10.trim(),
          icd10_description: primaryDescription.trim(),
          is_primary: true
        })
      });
      
      // Add secondary diagnoses
      for (const secondary of validSecondary) {
        await fetch(`${API_BASE}/api/treatment/encounters/${encounterId}/diagnoses`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${user.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            icd10_code: secondary.code.trim(),
            icd10_description: secondary.description.trim(),
            is_primary: false
          })
        });
      }
      
      Alert.alert('Başarılı', 'Tanılar kaydedildi. Tedavi planı oluşturmaya yönlendiriliyorsunuz...', [
        {
          text: 'Tamam',
          onPress: () => {
            router.replace({
              pathname: '/treatment-plan',
              params: { patientId, encounterId }
            });
          }
        }
      ]);
      
    } catch (error) {
      console.error('Save diagnoses error:', error);
      Alert.alert('Hata', 'Tanılar kaydedilemedi');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !encounter) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Muayene oluşturuluyor...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tanı Belirleme</Text>
        <Text style={styles.subtitle}>Hasta: {patientId}</Text>
        {encounter && (
          <Text style={styles.encounterInfo}>Muayene #{encounter.id.substring(0, 8)}</Text>
        )}
      </View>

      {/* Primary Diagnosis (Zorunlu) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔴 Birincil Tanı (Zorunlu)</Text>
        
        <TextInput
          style={styles.input}
          placeholder="ICD-10 Kodu"
          value={primaryICD10}
          onChangeText={setPrimaryICD10}
          autoCapitalize="characters"
        />
        
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Birincil Tanı Açıklaması"
          value={primaryDescription}
          onChangeText={setPrimaryDescription}
          multiline
        />
      </View>

      {/* Secondary Diagnoses (Opsiyonel) */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>İkincil Tanılar (Opsiyonel)</Text>
          <TouchableOpacity style={styles.addButton} onPress={addSecondaryDiagnosis}>
            <Text style={styles.addButtonText}>+ Ekle</Text>
          </TouchableOpacity>
        </View>
        
        {secondaryICD10s.map((secondary, index) => (
          <View key={index} style={styles.secondaryDiagnosis}>
            <View style={styles.secondaryHeader}>
              <Text style={styles.secondaryTitle}>İkincil Tanı {index + 1}</Text>
              {secondaryICD10s.length > 1 && (
                <TouchableOpacity 
                  style={styles.removeButton} 
                  onPress={() => removeSecondaryDiagnosis(index)}
                >
                  <Text style={styles.removeButtonText}>Sil</Text>
                </TouchableOpacity>
              )}
            </View>
            
            <TextInput
              style={styles.input}
              placeholder="ICD-10 Kodu (opsiyonel)"
              value={secondary.code}
              onChangeText={(value) => updateSecondaryDiagnosis(index, 'code', value)}
              autoCapitalize="characters"
            />
            
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Tanı Açıklaması (opsiyonel)"
              value={secondary.description}
              onChangeText={(value) => updateSecondaryDiagnosis(index, 'description', value)}
              multiline
            />
          </View>
        ))}
      </View>

      {/* Notes (Opsiyonel) */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notlar (Opsiyonel)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Ek notlar veya gözlemler..."
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.button, styles.saveButton]} 
          onPress={validateAndSave}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>✅ Kaydet & Tedavi Planı Oluştur</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Navigation */}
      <View style={styles.navigation}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Geri</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.warning}>
        <Text style={styles.warningText}>
          ⚠️ Birincil ICD-10 tanısı olmadan tedavi planı oluşturulamaz ve diş seçimi yapılamaz.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  encounterInfo: {
    fontSize: 12,
    color: '#2563EB',
    backgroundColor: '#e3f2fd',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  section: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  addButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  secondaryDiagnosis: {
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  secondaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  secondaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  removeButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  removeButtonText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 5,
    padding: 12,
    marginBottom: 10,
    fontSize: 14,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  actions: {
    paddingVertical: 20,
  },
  button: {
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#2563EB',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  warning: {
    backgroundColor: '#fef3c7',
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  warningText: {
    fontSize: 12,
    color: '#92400e',
    lineHeight: 18,
  },
  navigation: {
    paddingVertical: 20,
  },
  backButton: {
    backgroundColor: '#6b7280',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
