// app/register.tsx - Test için hızlı kayıt ekranı
import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { useLanguage } from "../lib/language-context";

export default function RegisterScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const { t } = useLanguage();
  const [userType, setUserType] = useState<'patient' | 'doctor'>('patient');
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    userType: 'patient',
    clinicCode: '',
    licenseNumber: '',
  });
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!formData.fullName || !formData.email || !formData.phone) {
      Alert.alert('Hata', 'Lütfen tüm alanları doldurun');
      return;
    }

    if (userType === 'doctor' && (!formData.clinicCode || !formData.licenseNumber)) {
      Alert.alert('Hata', 'Doktor için klinik kodu ve lisans numarası gereklidir');
      return;
    }

    setLoading(true);
    try {
      // Test için basit auth simülasyonu
      const testUser = {
        id: 'test-' + Date.now(),
        token: 'test-token-' + Date.now(),
        role: userType === 'doctor' ? 'doctor' : 'patient',
        fullName: formData.fullName,
        email: formData.email,
        phone: formData.phone,
        clinicCode: formData.clinicCode,
        licenseNumber: formData.licenseNumber,
      };

      // Auth context'e kaydet
      await signIn(testUser);

      Alert.alert('Başarılı', `${userType === 'doctor' ? 'Doktor' : 'Hasta'} kaydı oluşturuldu!`);
      
      // Role göre yönlendir
      if (userType === 'doctor') {
        router.replace('/doctor/dashboard');
      } else {
        router.replace('/home');
      }

    } catch (error) {
      Alert.alert('Hata', 'Kayıt başarısız oldu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Hesap Oluştur</Text>
      
      {/* KULLANICI TİPİ SEÇİMİ */}
      <View style={styles.userTypeContainer}>
        <Pressable
          style={[
            styles.userTypeButton,
            userType === 'patient' && styles.userTypeSelected
          ]}
          onPress={() => setUserType('patient')}
        >
          <Text style={styles.userTypeText}>🧑‍⚕️ Hasta</Text>
        </Pressable>
        
        <Pressable
          style={[
            styles.userTypeButton,
            userType === 'doctor' && styles.userTypeSelected
          ]}
          onPress={() => setUserType('doctor')}
        >
          <Text style={styles.userTypeText}>👨‍⚕️ Doktor</Text>
        </Pressable>
      </View>

      {/* ORTAK ALANLAR */}
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

      {/* DOKTORA ÖZEL ALANLAR */}
      {userType === 'doctor' && (
        <View style={styles.doctorSection}>
          <Text style={styles.sectionTitle}>Doktor Bilgileri</Text>
          
          <TextInput
            placeholder="Klinik Kodu"
            value={formData.clinicCode}
            onChangeText={(text) => setFormData({...formData, clinicCode: text})}
            style={styles.input}
          />
          
          <TextInput
            placeholder="Lisans Numarası"
            value={formData.licenseNumber}
            onChangeText={(text) => setFormData({...formData, licenseNumber: text})}
            style={styles.input}
          />
        </View>
      )}

      <Pressable 
        style={[styles.registerButton, loading && styles.disabledButton]} 
        onPress={handleRegister}
        disabled={loading}
      >
        <Text style={styles.registerButtonText}>
          {loading ? 'Kaydediliyor...' : `${userType === 'doctor' ? 'Doktor' : 'Hasta'} Kaydı`}
        </Text>
      </Pressable>

      <Pressable onPress={() => router.replace('/login')}>
        <Text style={styles.loginLink}>Zaten hesabınız var mı? Giriş yapın</Text>
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
  userTypeContainer: {
    flexDirection: 'row',
    marginBottom: 30,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 4,
  },
  userTypeButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  userTypeSelected: {
    backgroundColor: '#2563EB',
  },
  userTypeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  userSelectedText: {
    color: '#FFFFFF',
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
  doctorSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#374151',
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
