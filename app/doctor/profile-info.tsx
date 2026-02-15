import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  StyleSheet
} from 'react-native';
import { useRouter } from 'expo-router';
import { getCurrentDoctorProfile, updateCurrentDoctorProfile } from '../../lib/doctor/api';

interface DoctorProfile {
  doctorId: string;
  name: string;
  email: string;
  phone: string;
  department?: string;
  title?: string;
  experience_years?: string;
  languages?: string;
  specialties?: string;
  status: string;
  clinic_code: string;
}

export default function DoctorProfileScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    department: '',
    title: '',
    experience_years: '',
    languages: '',
    specialties: ''
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const response = await getCurrentDoctorProfile();
      
      if (response.ok && response.doctor) {
        setProfile(response.doctor);
        setFormData({
          name: response.doctor.name || '',
          phone: response.doctor.phone || '',
          department: response.doctor.department || '',
          title: response.doctor.title || '',
          experience_years: response.doctor.experience_years?.toString() || '',
          languages: response.doctor.languages || '',
          specialties: response.doctor.specialties || ''
        });
      } else {
        Alert.alert('Hata', 'Profil bilgileri yüklenemedi');
      }
    } catch (error) {
      console.error('Profile load error:', error);
      Alert.alert('Hata', 'Profil bilgileri yüklenirken bir hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;

    try {
      setSaving(true);
      const response = await updateCurrentDoctorProfile({
        name: formData.name,
        phone: formData.phone,
        department: formData.department,
        title: formData.title,
        experience_years: formData.experience_years,
        languages: formData.languages,
        specialties: formData.specialties
      });

      if (response.ok) {
        Alert.alert('Başarılı', 'Profil bilgileriniz güncellendi');
        // Reload profile to get updated data
        await loadProfile();
      } else {
        Alert.alert('Hata', 'Profil güncellenemedi');
      }
    } catch (error) {
      console.error('Profile update error:', error);
      Alert.alert('Hata', 'Profil güncellenirken bir hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'APPROVED':
        return '#4CAF50';
      case 'PENDING':
        return '#FF9800';
      case 'SUSPENDED':
        return '#F44336';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusText = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'APPROVED':
        return 'Onaylı';
      case 'PENDING':
        return 'Beklemede';
      case 'SUSPENDED':
        return 'Askıda';
      default:
        return status;
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Profil yükleniyor...</Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Profil bilgileri bulunamadı</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.back()}>
          <Text style={styles.buttonText}>Geri</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Text style={styles.backButtonText}>← Geri</Text>
        </TouchableOpacity>
        
        <Text style={styles.headerTitle}>Profil Bilgilerim</Text>
        
        <View style={styles.statusBadge}>
          <Text style={[styles.statusText, { color: getStatusColor(profile.status) }]}>
            {getStatusText(profile.status)}
          </Text>
        </View>
      </View>

      <View style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Ad Soyad</Text>
          <TextInput
            style={styles.input}
            value={formData.name}
            onChangeText={(text) => setFormData({ ...formData, name: text })}
            placeholder="Adınızı soyadınızı girin"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={[styles.input, styles.readOnly]}
            value={profile.email || ''}
            editable={false}
            placeholder="Email"
          />
          <Text style={styles.readOnlyText}>Email değiştirilemez</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Telefon</Text>
          <TextInput
            style={styles.input}
            value={formData.phone}
            onChangeText={(text) => setFormData({ ...formData, phone: text })}
            placeholder="Telefon numaranızı girin"
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Departman</Text>
          <TextInput
            style={styles.input}
            value={formData.department}
            onChangeText={(text) => setFormData({ ...formData, department: text })}
            placeholder="Departmanınızı girin"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Ünvan</Text>
          <TextInput
            style={styles.input}
            value={formData.title}
            onChangeText={(text) => setFormData({ ...formData, title: text })}
            placeholder="Ünvanınızı girin"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Deneyim (Yıl)</Text>
          <TextInput
            style={styles.input}
            value={formData.experience_years}
            onChangeText={(text) => setFormData({ ...formData, experience_years: text })}
            placeholder="Deneyim yılınızı girin"
            keyboardType="numeric"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Diller (Virgülle ayırın)</Text>
          <TextInput
            style={styles.input}
            value={formData.languages}
            onChangeText={(text) => setFormData({ ...formData, languages: text })}
            placeholder="Türkçe, İngilizce, Almanca"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Uzmanlık Alanları (Virgülle ayırın)</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={formData.specialties}
            onChangeText={(text) => setFormData({ ...formData, specialties: text })}
            placeholder="Ortodonti, Pedodonti, Cerrahi"
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Klinik Kodu</Text>
          <TextInput
            style={[styles.input, styles.readOnly]}
            value={profile.clinic_code || ''}
            editable={false}
            placeholder="Klinik kodu"
          />
          <Text style={styles.readOnlyText}>Klinik kodu değiştirilemez</Text>
        </View>

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.disabledButton]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveButtonText}>Kaydet</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 20,
  },
  statusBadge: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  form: {
    padding: 20,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#333',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  readOnly: {
    backgroundColor: '#f8f8f8',
    borderColor: '#ccc',
  },
  readOnlyText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    fontStyle: 'italic',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  disabledButton: {
    backgroundColor: '#ccc',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
