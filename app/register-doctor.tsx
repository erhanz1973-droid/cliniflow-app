// app/register-doctor.tsx
import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { handleDoctorRegistration } from "../lib/doctor/register";

export default function RegisterDoctorScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    clinicCode: '',
    licenseNumber: '',
    department: '',
    specialties: '',
    title: '',
    experienceYears: '',
    languages: '',
  });

  const handleRegister = async () => {
    // Validation
    if (!formData.fullName || !formData.email || !formData.phone) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurun');
      return;
    }

    // Email validation
    const emailRegex = /^[^s@]+@[^s@]+.[^s@]+$/;
    if (!emailRegex.test(formData.email)) {
      Alert.alert('Hata', 'Geçerli bir e-posta adresi girin');
      return;
    }

    // Phone validation
    if (formData.phone.length < 10) {
      Alert.alert('Hata', 'Telefon numarası en az 10 haneli olmalıdır');
      return;
    }

    // Doctor-specific validation
    if (!formData.clinicCode || !formData.licenseNumber) {
      Alert.alert('Hata', 'Doktor için klinik kodu ve lisans numarası gereklidir');
      return;
    }

    setLoading(true);
    
    try {
      await handleDoctorRegistration({
        name: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        clinicCode: formData.clinicCode,
        licenseNumber: formData.licenseNumber,
        department: formData.department,
        specialties: formData.specialties,
        title: formData.title,
        experienceYears: formData.experienceYears,
        languages: formData.languages,
      });
    } catch (error: any) {
      console.error('Doctor registration error:', error);
      Alert.alert('Hata', error.message || 'Kayıt başarısız oldu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Doktor Kaydı</Text>
      
      <TextInput
        placeholder="Ad Soyad"
        value={formData.fullName}
        onChangeText={(text) => setFormData({...formData, fullName: text})}
        style={styles.input}
      />
      
      <TextInput
        placeholder="E-posta"
        value={formData.email}
        onChangeText={(text) => setFormData({...formData, email: text})}
        keyboardType="email-address"
        style={styles.input}
      />
      
      <TextInput
        placeholder="Telefon"
        value={formData.phone}
        onChangeText={(text) => setFormData({...formData, phone: text})}
        keyboardType="phone-pad"
        style={styles.input}
      />

      <Text style={styles.sectionTitle}>Doktor Bilgileri</Text>
      
      <TextInput
        placeholder="Klinik Kodu *"
        value={formData.clinicCode}
        onChangeText={(text) => setFormData({...formData, clinicCode: text})}
        style={styles.input}
        autoCapitalize="characters"
      />
      
      <TextInput
        placeholder="Lisans Numarası *"
        value={formData.licenseNumber}
        onChangeText={(text) => setFormData({...formData, licenseNumber: text})}
        style={styles.input}
      />

      <TextInput
        placeholder="Departman"
        value={formData.department}
        onChangeText={(text) => setFormData({...formData, department: text})}
        style={styles.input}
      />

      <TextInput
        placeholder="Uzmanlık Alanları"
        value={formData.specialties}
        onChangeText={(text) => setFormData({...formData, specialties: text})}
        style={styles.input}
      />

      <TextInput
        placeholder="Unvan"
        value={formData.title}
        onChangeText={(text) => setFormData({...formData, title: text})}
        style={styles.input}
      />

      <TextInput
        placeholder="Deneyim Yılı"
        value={formData.experienceYears}
        onChangeText={(text) => setFormData({...formData, experienceYears: text})}
        keyboardType="numeric"
        style={styles.input}
      />

      <TextInput
        placeholder="Diller"
        value={formData.languages}
        onChangeText={(text) => setFormData({...formData, languages: text})}
        style={styles.input}
      />

      <Pressable 
        style={[styles.registerButton, loading && styles.disabledButton]} 
        onPress={handleRegister}
        disabled={loading}
      >
        <Text style={styles.registerButtonText}>
          {loading ? 'Kaydediliyor...' : 'Doktor Kaydı'}
        </Text>
      </Pressable>

      <Pressable onPress={() => router.replace('/register-patient')}>
        <Text style={styles.loginLink}>Hasta olarak kayıt ol</Text>
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
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: '#111827',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#374151',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  registerButton: {
    backgroundColor: '#2563EB',
    padding: 18,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  registerButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  loginLink: {
    textAlign: 'center',
    color: '#2563EB',
    fontSize: 16,
  },
});
