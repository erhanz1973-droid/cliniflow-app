// app/doctor/diagnosis.tsx
// Doctor ICD-10 Diagnosis Screen (UI + Role Guard + Mock)

import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuth } from '../../lib/auth';

export default function DoctorDiagnosis() {
  const { user } = useAuth();

  // 🔐 ROLE GUARD
  if (!user || user.role !== 'DOCTOR') {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          Bu sayfaya sadece doktorlar erişebilir.
        </Text>
      </View>
    );
  }

  const [selectedTooth, setSelectedTooth] = useState<string | null>(null);
  const [selectedDiagnosis, setSelectedDiagnosis] = useState<string | null>(null);

  // 🦷 Basit diş numaraları (mock)
  const teeth = Array.from({ length: 32 }, (_, i) => (i + 11).toString());

  // 📘 ICD-10 MOCK (ileride API'den gelecek)
  const icd10List = [
    'K02.0 - Mine çürüğü',
    'K02.1 - Dentin çürüğü',
    'K02.2 - Cementum çürüğü',
    'K04.0 - Pulpitis',
    'K04.1 - Pulpa nekrozu',
  ];

  const handleSave = () => {
    if (!selectedTooth || !selectedDiagnosis) {
      Alert.alert('Eksik Bilgi', 'Lütfen diş ve tanı seçin.');
      return;
    }

    // ❗ Backend POST burada YOK (bilinçli)
    Alert.alert(
      'Başarılı',
      `Diş: ${selectedTooth}\nTanı: ${selectedDiagnosis}`
    );

    // reset (opsiyonel)
    setSelectedTooth(null);
    setSelectedDiagnosis(null);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🦷 Doktor Tanı Ekranı</Text>

      {/* 🦷 Diş Seçimi */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Diş Seçimi</Text>
        <View style={styles.toothGrid}>
          {teeth.map((tooth) => (
            <Pressable
              key={tooth}
              style={[
                styles.tooth,
                selectedTooth === tooth && styles.toothSelected,
              ]}
              onPress={() => setSelectedTooth(tooth)}
            >
              <Text
                style={[
                  styles.toothNumber,
                  selectedTooth === tooth && styles.toothNumberSelected,
                ]}
              >
                {tooth}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 📘 ICD-10 Tanı */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ICD-10 Tanısı</Text>

        {icd10List.map((item) => (
          <Pressable
            key={item}
            style={[
              styles.icdItem,
              selectedDiagnosis === item && styles.icdItemSelected,
            ]}
            onPress={() => setSelectedDiagnosis(item)}
          >
            <Text
              style={[
                styles.icdText,
                selectedDiagnosis === item && styles.icdTextSelected,
              ]}
            >
              {item}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* 💾 Kaydet */}
      <Pressable style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Tanıyı Kaydet</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F9FAFB',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#DC2626',
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
  },
  toothGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  tooth: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    margin: 5,
  },
  toothSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  toothNumber: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#111827',
  },
  toothNumberSelected: {
    color: '#FFFFFF',
  },
  icdItem: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  icdItemSelected: {
    backgroundColor: '#DBEAFE',
    borderColor: '#2563EB',
  },
  icdText: {
    fontSize: 15,
    color: '#374151',
  },
  icdTextSelected: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#10B981',
    padding: 18,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 40,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
