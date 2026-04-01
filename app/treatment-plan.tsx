import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { API_BASE } from '../lib/api';
import { API_ROUTES } from '../lib/api-routes';
import { secureGet, securePost } from '../lib/secure-fetch';

export default function TreatmentPlanScreen() {
  const router = useRouter();
  const { patientId, encounterId } = useLocalSearchParams();
  const { user } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [encounter, setEncounter] = useState(null);
  const [diagnoses, setDiagnoses] = useState([]);
  const [treatmentPlan, setTreatmentPlan] = useState(null);
  const [treatmentItems, setTreatmentItems] = useState([]);
  
  // Treatment item form
  const [toothFDICode, setToothFDICode] = useState('');
  const [procedureCode, setProcedureCode] = useState('');
  const [procedureName, setProcedureName] = useState('');

  useEffect(() => {
    loadTreatmentData();
  }, [encounterId]);

  const loadTreatmentData = async () => {
    try {
      setLoading(true);
      
      // Get encounter and diagnoses
      const encounterData = await secureGet(
        API_ROUTES.doctor.encounterById(encounterId as string),
        user?.token
      );
      setEncounter(encounterData);
      
      // Get diagnoses
      const diagnosesData = await secureGet(
        API_ROUTES.doctor.encounterDiagnoses(encounterId as string),
        user?.token
      );
      const diagnoses = diagnosesData?.data || diagnosesData?.diagnoses || diagnosesData || [];
      setDiagnoses(diagnoses);
      
      // CRITICAL: Check if primary diagnosis exists
      const primaryDiagnosis = diagnoses.find((d: any) => d.is_primary);
      if (!primaryDiagnosis) {
        Alert.alert('Hata', 'Önce birincil tanı girilmelidir');
        router.replace({
          pathname: '/doctor/diagnosis',
          params: { patientId, encounterId }
        });
        return;
      }
      
      // Get treatment plans
      const plansData = await secureGet(
        API_ROUTES.TREATMENT_ENCOUNTERS_TREATMENT_PLANS(encounterId as string),
        user?.token
      );
      const activePlan = plansData.find((p: any) => p.status !== 'completed' && p.status !== 'rejected');
      
      if (!activePlan) {
        // Create new treatment plan
        await createTreatmentPlan();
      } else {
        setTreatmentPlan(activePlan);
        
        // Get treatment items
        const itemsData = await secureGet(
          API_ROUTES.TREATMENT_PLANS_ITEMS(activePlan.id),
          user?.token
        );
        setTreatmentItems(itemsData);
      }
      
    } catch (error) {
      console.error('Load treatment data error:', error);
      Alert.alert('Hata', 'Veri yüklenirken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const createTreatmentPlan = async () => {
    try {
      const response = await fetch(`${API_BASE}${API_ROUTES.TREATMENT_ENCOUNTERS_TREATMENT_PLANS(encounterId as string)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user?.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const newPlan = await response.json();
        setTreatmentPlan(newPlan);
      } else {
        const error = await response.json();
        Alert.alert('Hata', error.error || 'Tedavi planı oluşturulamadı');
      }
    } catch (error) {
      console.error('Create treatment plan error:', error);
      Alert.alert('Hata', 'Tedavi planı oluşturulurken hata oluştu');
    }
  };

  const addTreatmentItem = async () => {
    if (!toothFDICode || !procedureCode || !procedureName) {
      Alert.alert('Hata', 'Diş kodu, işlem kodu ve adı gereklidir');
      return;
    }

    const toothCode = parseInt(toothFDICode);
    if (isNaN(toothCode) || toothCode < 11 || toothCode > 48) {
      Alert.alert('Hata', 'Diş kodu 11-48 arasında olmalıdır');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}${API_ROUTES.TREATMENT_PLANS_ITEMS(treatmentPlan.id)}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${user?.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tooth_fdi_code: toothCode,
          procedure_code: procedureCode,
          procedure_name: procedureName,
          linked_icd10_code: diagnoses.find((d: any) => d.is_primary)?.icd10_code
        })
      });

      if (response.ok) {
        Alert.alert('Başarılı', 'Tedavi eklendi');
        setToothFDICode('');
        setProcedureCode('');
        setProcedureName('');
        loadTreatmentData(); // Reload to get updated items
      } else {
        const error = await response.json();
        Alert.alert('Hata', error.error || 'Tedavi eklenemedi');
      }
    } catch (error) {
      console.error('Add treatment item error:', error);
      Alert.alert('Hata', 'Tedavi eklenirken hata oluştu');
    }
  };

  const updateItemStatus = async (itemId: string, status: string) => {
    try {
      const response = await fetch(`${API_BASE}${API_ROUTES.TREATMENT_ITEMS_STATUS(itemId)}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${user?.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });

      if (response.ok) {
        loadTreatmentData(); // Reload to get updated items
      } else {
        const error = await response.json();
        Alert.alert('Hata', error.error || 'Durum güncellenemedi');
      }
    } catch (error) {
      console.error('Update item status error:', error);
      Alert.alert('Hata', 'Durum güncellenirken hata oluştu');
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  const primaryDiagnosis = diagnoses.find((d: any) => d.is_primary);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tedavi Planı</Text>
        <Text style={styles.subtitle}>Hasta: {patientId}</Text>
        {primaryDiagnosis && (
          <View style={styles.diagnosisBadge}>
            <Text style={styles.diagnosisText}>
              🔴 {primaryDiagnosis.icd10_code}: {primaryDiagnosis.icd10_description}
            </Text>
          </View>
        )}
      </View>

      {/* Treatment Plan Status */}
      {treatmentPlan && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Plan Durumu</Text>
          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>Durum: {treatmentPlan.status}</Text>
            <TouchableOpacity 
              style={styles.statusButton}
              onPress={() => updateItemStatus(treatmentPlan.id, 'proposed')}
            >
              <Text style={styles.statusButtonText}>Onaya Gönder</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Treatment Items */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tedavi Kalemleri</Text>
        
        {treatmentItems.length === 0 ? (
          <Text style={styles.emptyText}>Henüz tedavi eklenmemiş</Text>
        ) : (
          treatmentItems.map((item: any) => (
            <View key={item.id} style={styles.treatmentItem}>
              <View style={styles.itemHeader}>
                <Text style={styles.toothCode}>Diş #{item.tooth_fdi_code}</Text>
                <Text style={[styles.itemStatus, styles[`status${item.status}`]]}>
                  {item.status}
                </Text>
              </View>
              <Text style={styles.procedureCode}>{item.procedure_code}</Text>
              <Text style={styles.procedureName}>{item.procedure_name}</Text>
              
              <View style={styles.itemActions}>
                {item.status === 'planned' && (
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.startButton]}
                    onPress={() => updateItemStatus(item.id, 'in_progress')}
                  >
                    <Text style={styles.actionButtonText}>Başlat</Text>
                  </TouchableOpacity>
                )}
                {item.status === 'in_progress' && (
                  <TouchableOpacity 
                    style={[styles.actionButton, styles.completeButton]}
                    onPress={() => updateItemStatus(item.id, 'done')}
                  >
                    <Text style={styles.actionButtonText}>Tamamla</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          ))
        )}
      </View>

      {/* Add Treatment Item Form */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Yeni Tedavi Ekle</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Diş Kodu (FDI 11-48)"
          value={toothFDICode}
          onChangeText={setToothFDICode}
          keyboardType="numeric"
        />
        
        <TextInput
          style={styles.input}
          placeholder="İşlem Kodu"
          value={procedureCode}
          onChangeText={setProcedureCode}
        />
        
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="İşlem Adı"
          value={procedureName}
          onChangeText={setProcedureName}
        />
        
        <TouchableOpacity style={styles.addButton} onPress={addTreatmentItem}>
          <Text style={styles.addButtonText}>+ Tedavi Ekle</Text>
        </TouchableOpacity>
      </View>

      {/* Navigation */}
      <View style={styles.navigation}>
        <TouchableOpacity 
          style={styles.navButton}
          onPress={() => router.back()}
        >
          <Text style={styles.navButtonText}>← Geri</Text>
        </TouchableOpacity>
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
    marginBottom: 10,
  },
  diagnosisBadge: {
    backgroundColor: '#fef3c7',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  diagnosisText: {
    fontSize: 12,
    color: '#92400e',
    fontWeight: '600',
  },
  section: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  statusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusText: {
    fontSize: 16,
    color: '#666',
  },
  statusButton: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
  },
  statusButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 20,
  },
  treatmentItem: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  toothCode: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  itemStatus: {
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusplanned: {
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
  },
  statusin_progress: {
    backgroundColor: '#fff3e0',
    color: '#f57c00',
  },
  statusdone: {
    backgroundColor: '#e8f5e8',
    color: '#388e3c',
  },
  procedureCode: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  procedureName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 10,
  },
  itemActions: {
    flexDirection: 'row',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    marginRight: 8,
  },
  startButton: {
    backgroundColor: '#f57c00',
  },
  completeButton: {
    backgroundColor: '#388e3c',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 12,
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
    height: 60,
    textAlignVertical: 'top',
  },
  addButton: {
    backgroundColor: '#2563EB',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  navigation: {
    paddingVertical: 20,
  },
  navButton: {
    backgroundColor: '#6b7280',
    padding: 12,
    borderRadius: 5,
    alignItems: 'center',
  },
  navButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
