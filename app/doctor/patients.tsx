import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, Alert, SafeAreaView, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { apiGet } from '../../lib/api';

interface Patient {
  id: string;
  name: string;
  patient_id: string;
  phone: string;
  status: string;
  created_at: string;
  treatment_group?: {
    id: string;
    name: string;
    status: string;
  };
}

interface ApiResponse {
  ok: boolean;
  patients?: Patient[];
  error?: string;
}

export default function DoctorPatientsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadPatients = async () => {
    try {
      setLoading(true);
      const response = await apiGet<ApiResponse>('/api/doctor/patients');
      
      if (response.ok && response.patients) {
        setPatients(response.patients);
      } else {
        console.error('Load patients error:', response.error);
        Alert.alert('Hata', 'Hastalar yüklenirken bir hata oluştu');
      }
    } catch (error) {
      console.error('Load patients error:', error);
      Alert.alert('Hata', 'Hastalar yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadPatients();
  };

  useEffect(() => {
    if (user) {
      loadPatients();
    }
  }, [user]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return '#10B981';
      case 'PENDING':
        return '#F59E0B';
      case 'INACTIVE':
        return '#6B7280';
      default:
        return '#6B7280';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ACTIVE':
        return 'Aktif';
      case 'PENDING':
        return 'Beklemede';
      case 'INACTIVE':
        return 'Pasif';
      default:
        return status;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('tr-TR');
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' }}>
        <Text>Hastalar yükleniyor...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      {/* Header with back */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
        <Pressable onPress={() => router.back()} style={{ marginRight: 12, padding: 4 }}>
          <Text style={{ fontSize: 22 }}>←</Text>
        </Pressable>
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>Hastalarım</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={{ padding: 16 }}>
          
          {patients.length === 0 ? (
            <View style={{ 
              flex: 1, 
              justifyContent: 'center', 
              alignItems: 'center', 
              paddingVertical: 64 
            }}>
              <Text style={{ fontSize: 48, marginBottom: 16 }}>👥</Text>
              <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
                Henüz hasta atanmamış
              </Text>
              <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center' }}>
                Size atanmış henüz bir hasta bulunmuyor.
              </Text>
            </View>
          ) : (
            patients.map((patient) => (
              <TouchableOpacity
                key={patient.id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 12,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 },
                  shadowOpacity: 0.1,
                  shadowRadius: 2,
                  elevation: 2,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 4 }}>
                      {patient.name}
                    </Text>
                    <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 8 }}>
                      {patient.patient_id}
                    </Text>
                    <Text style={{ fontSize: 14, color: '#6B7280', marginBottom: 4 }}>
                      📱 {patient.phone}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#6B7280' }}>
                      📅 {formatDate(patient.created_at)}
                    </Text>
                  </View>
                  <View style={{
                    backgroundColor: getStatusColor(patient.status),
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 6,
                  }}>
                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '600' }}>
                      {getStatusText(patient.status)}
                    </Text>
                  </View>
                </View>
                
                {patient.treatment_group && (
                  <View style={{
                    marginTop: 12,
                    paddingTop: 12,
                    borderTopWidth: 1,
                    borderTopColor: '#E5E7EB',
                  }}>
                    <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>
                      Tedavi Grubu
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '500' }}>
                      {patient.treatment_group.name}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
