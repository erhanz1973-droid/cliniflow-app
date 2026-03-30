import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, FlatList } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { API_BASE } from '../../lib/api';
import { API_ROUTES } from '../../lib/api-routes';
import { securePost, secureGet } from '../../lib/secure-fetch';

interface Encounter {
  id: string;
  patient_id: string;
  doctor_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export default function TreatmentScreen() {
  const router = useRouter();
  const { patientId } = useLocalSearchParams<{ patientId?: string | string[] }>();
  const { user, isInitialized } = useAuth();
  
  // 🔥 CRITICAL: Handle patientId as string or string array
  const patientIdStr = Array.isArray(patientId) ? patientId[0] : patientId || '';
  
  const [loading, setLoading] = useState(false);
  const [patients, setPatients] = useState([]);
  const [encounter, setEncounter] = useState<Encounter | null>(null);
  const [hasPrimaryDiagnosis, setHasPrimaryDiagnosis] = useState(false);

  useEffect(() => {
    // 🔥 CRITICAL: Wait for initialization before checking auth
    if (!isInitialized) return;
    
    if (patientIdStr) {
      checkEncounterStatus();
    } else {
      loadPatients();
    }
  }, [patientIdStr, isInitialized]);

  const loadPatients = async () => {
    try {
      setLoading(true);
      
      const response = await secureGet('/api/patients');
      const patientsData = response.patients;
      setPatients(patientsData || []);
      
    } catch (error) {
      console.error('Load patients error:', error);
      Alert.alert('Hata', 'Hastalar yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const checkEncounterStatus = async () => {
    try {
      setLoading(true);
      
      // Get existing encounters for this patient
      const encounterJson = await secureGet(
        API_ROUTES.doctor.encountersByPatient(patientId as string),
        user?.token
      );
      
      console.log("[Encounter] API response:", encounterJson);
      
      // Normalize response - handle different response formats
      const encounters = encounterJson?.data || encounterJson?.encounters || encounterJson || [];
      console.log("[Encounter] Parsed encounters:", encounters);
      
      if (!encounters || encounters.length === 0) {
        console.log("[Encounter] No encounters found for patient:", patientId);
        setEncounter(null);
        setHasPrimaryDiagnosis(false);
        return;
      }
      
      // Get the most recent encounter
      const recentEncounter = encounters[0];
      console.log("[Encounter] Recent encounter:", recentEncounter);
      
      // Null guard before accessing .id
      if (!recentEncounter?.id) {
        console.log("[Encounter] No recent encounter found or missing ID");
        setEncounter(null);
        setHasPrimaryDiagnosis(false);
        return;
      }
      
      setEncounter(recentEncounter);
      
      // Get encounter data
      const encounterData = await secureGet(
        API_ROUTES.doctor.encounterById(recentEncounter.id),
        user?.token
      );
      
      // Check if it has primary diagnosis
      const diagnosesData = await secureGet(
        API_ROUTES.doctor.encounterDiagnoses(recentEncounter.id),
        user?.token
      );
      
      const diagnoses = diagnosesData?.data || diagnosesData?.diagnoses || diagnosesData || [];
      const primaryDiagnosis = diagnoses.find((d: any) => d.is_primary);
      setHasPrimaryDiagnosis(!!primaryDiagnosis);
      
    } catch (error) {
      console.error('Check encounter status error:', error);
      Alert.alert('Hata', 'Durum kontrol edilirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handlePatientSelect = (patient: any) => {
    router.push({
      pathname: '/treatment',
      params: { patientId: patient.id }
    });
  };

  const handleDiagnosisPress = async () => {
    try {
      setLoading(true);

      let encounterId = encounter?.id;

      // 🔥 CRITICAL: Eğer encounter yoksa oluştur
      if (!encounterId) {
        console.log("[Encounter] No encounter found, creating new one...");
        
        const json = await securePost(
          API_ROUTES.doctor.encounters,
          {
            patient_id: patientIdStr,
            notes: "Initial examination"
          },
          user?.token
        );

        encounterId = json.encounter?.id || json.id;
        console.log("[Encounter] New encounter created:", encounterId);

        // 🔥 CRITICAL: State'i güncelle
        setEncounter({
          id: encounterId!,
          patient_id: patientIdStr,
          doctor_id: user?.id || '',
          status: 'OPEN',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      // 🔥 CRITICAL: Diagnosis ekranına yönlendir
      router.push({
        pathname: '/diagnosis',
        params: { patientId: patientIdStr, encounterId }
      });

    } catch (error) {
      console.error("Start encounter error:", error);
      Alert.alert("Hata", "Yeni muayene başlatılamadı");
    } finally {
      setLoading(false);
    }
  };

  const handleTreatmentPlanPress = () => {
    if (!patientIdStr) {
      console.log("[Treatment Plan] No patientId found, cannot navigate to treatments");
      return;
    }

    router.push({
      pathname: '/treatment-plan',
      params: { 
        patientId: patientIdStr,
        encounterId: encounter?.id
      }
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  // Show patient selection if no patientId provided
  if (!patientId) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Tedavi Planlama</Text>
          <Text style={styles.subtitle}>Hasta Seçimi</Text>
        </View>

        <View style={styles.patientList}>
          <Text style={styles.listTitle}>Hastalar</Text>
          
          {patients.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Henüz hasta bulunmuyor</Text>
            </View>
          ) : (
            <FlatList
              data={patients}
              keyExtractor={(item: any) => item.id}
              renderItem={({ item }: any) => (
                <TouchableOpacity 
                  style={styles.patientItem}
                  onPress={() => handlePatientSelect(item)}
                >
                  <View style={styles.patientInfo}>
                    <Text style={styles.patientName}>{item.name}</Text>
                    <Text style={styles.patientDetails}>
                      {item.phone} • {item.referralCode}
                    </Text>
                  </View>
                  <Text style={styles.patientArrow}>→</Text>
                </TouchableOpacity>
              )}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tedavi Modülü</Text>
        <Text style={styles.subtitle}>Hasta: {patientId}</Text>
        {encounter?.id && (
          <Text style={styles.encounterInfo}>
            Muayene #{encounter.id.substring(0, 8)} - {encounter.status || 'Unknown'}
          </Text>
        )}
      </View>

      {/* Status Card */}
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>Durum</Text>
        
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Birincil Tanı:</Text>
          <View style={[styles.statusIndicator, hasPrimaryDiagnosis ? styles.complete : styles.pending]}>
            <Text style={styles.statusIndicatorText}>
              {hasPrimaryDiagnosis ? '✅ Tamamlandı' : '⏳ Bekliyor'}
            </Text>
          </View>
        </View>
        
        <View style={styles.statusItem}>
          <Text style={styles.statusLabel}>Tedavi Planı:</Text>
          <View style={[styles.statusIndicator, hasPrimaryDiagnosis ? styles.available : styles.disabled]}>
            <Text style={styles.statusIndicatorText}>
              {hasPrimaryDiagnosis ? '📋 Oluşturulabilir' : '🔒 Kilitli'}
            </Text>
          </View>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity 
          style={[styles.button, styles.diagnosisButton]} 
          onPress={handleDiagnosisPress}
        >
          <Text style={styles.buttonText}>🔴 Tanı Belirle</Text>
          <Text style={styles.buttonSubtext}>
            {encounter ? 'Tanıları düzenle' : 'Yeni muayene başlat'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[
            styles.button, 
            styles.planButton,
            !hasPrimaryDiagnosis && styles.disabledButton
          ]} 
          onPress={handleTreatmentPlanPress}
          disabled={!hasPrimaryDiagnosis}
        >
          <Text style={styles.buttonText}>📋 Tedavi Planı</Text>
          <Text style={styles.buttonSubtext}>
            {hasPrimaryDiagnosis ? 'Diş işlemlerini planla' : 'Önce tanı gerekli'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Warning */}
      {!hasPrimaryDiagnosis && (
        <View style={styles.warning}>
          <Text style={styles.warningTitle}>⚠️ Kilitli Özellik</Text>
          <Text style={styles.warningText}>
            Birincil ICD-10 tanısı girilmeden tedavi planı oluşturulamaz ve diş seçimi yapılamaz.
          </Text>
        </View>
      )}

      {/* Info */}
      <View style={styles.info}>
        <Text style={styles.infoTitle}>📋 Akış</Text>
        <Text style={styles.infoText}>1. 🔴 Birincil tanı gir (zorunlu)</Text>
        <Text style={styles.infoText}>2. 📋 Tedavi planı oluştur</Text>
        <Text style={styles.infoText}>3. 🦷 Diş işlemlerini ekle</Text>
      </View>
    </View>
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
  statusCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  statusItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusLabel: {
    fontSize: 16,
    color: '#333',
  },
  statusIndicator: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  complete: {
    backgroundColor: '#e8f5e8',
  },
  pending: {
    backgroundColor: '#fff3e0',
  },
  available: {
    backgroundColor: '#e3f2fd',
  },
  disabled: {
    backgroundColor: '#f5f5f5',
  },
  statusIndicatorText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  actions: {
    marginBottom: 20,
  },
  button: {
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: 'flex-start',
  },
  diagnosisButton: {
    backgroundColor: '#dc2626',
  },
  planButton: {
    backgroundColor: '#2563EB',
  },
  disabledButton: {
    backgroundColor: '#d1d5db',
  },
  buttonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  buttonSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  warning: {
    backgroundColor: '#fef3c7',
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
    marginBottom: 20,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 5,
  },
  warningText: {
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
  info: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  // Patient selection styles
  patientList: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  listTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
  },
  patientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    marginBottom: 10,
  },
  patientInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  patientDetails: {
    fontSize: 14,
    color: '#666',
  },
  patientArrow: {
    fontSize: 18,
    color: '#2563EB',
    fontWeight: 'bold',
  },
});
