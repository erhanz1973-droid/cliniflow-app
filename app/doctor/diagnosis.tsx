// app/doctor/diagnosis.tsx - Test tanı ekranı
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';

export default function DoctorDiagnosis() {
  const router = useRouter();
  const { user } = useAuth();
  const [selectedTooth, setSelectedTooth] = useState('');
  const [selectedDiagnosis, setSelectedDiagnosis] = useState('');

  const teeth = Array.from({ length: 32 }, (_, i) => (i + 11).toString());

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🦷 Tanı</Text>
      
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Diş Seçimi</Text>
        <View style={styles.toothGrid}>
          {teeth.map(tooth => (
            <Pressable
              key={tooth}
              style={[
                styles.tooth,
                selectedTooth === tooth && styles.toothSelected
              ]}
              onPress={() => setSelectedTooth(tooth)}
            >
              <Text style={styles.toothNumber}>{tooth}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ICD-10 Tanısı</Text>
        <Pressable 
          style={styles.icd10Button}
          onPress={() => setSelectedDiagnosis('K02.1 - Dentin çürüğü')}
        >
          <Text style={styles.icd10Text}>
            {selectedDiagnosis || 'ICD-10 kodu seç...'}
          </Text>
        </Pressable>
      </View>

      <Pressable 
        style={styles.saveButton}
        onPress={() => Alert.alert('Başarılı', 'Tanı kaydedildi!')}
      >
        <Text style={styles.saveButtonText}>Kaydet</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F9FAFB' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 30 },
  section: { marginBottom: 30 },
  sectionTitle: { fontSize: 18, fontWeight: '600', marginBottom: 15 },
  toothGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
  tooth: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    backgroundColor: '#FFFFFF', 
    borderWidth: 1, 
    borderColor: '#D1D5DB',
    justifyContent: 'center', 
    alignItems: 'center',
    margin: 5
  },
  toothSelected: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  toothNumber: { fontSize: 12, fontWeight: 'bold' },
  icd10Button: { 
    backgroundColor: '#FFFFFF', 
    borderWidth: 1, 
    borderColor: '#D1D5DB',
    borderRadius: 8, 
    padding: 15 
  },
  icd10Text: { fontSize: 16, color: '#6B7280' },
  saveButton: { backgroundColor: '#10B981', padding: 18, borderRadius: 8, alignItems: 'center' },
  saveButtonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
});
