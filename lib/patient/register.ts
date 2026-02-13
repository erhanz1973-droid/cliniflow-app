// lib/patient/register.ts
// Patient registration logic
import { registerPatient, PatientRegisterRequest } from './api';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { signIn } from '../auth';

export async function handlePatientRegistration(formData: PatientRegisterRequest) {
  try {
    const result = await registerPatient(formData);
    
    if (result.ok) {
      // Check if patient is already approved
      if (result.status === 'ACTIVE' || result.status === 'APPROVED') {
        // Sign in the patient immediately
        if (result.token && result.patientId) {
          await signIn({
            token: result.token,
            id: result.patientId,
            patientId: result.patientId,
            type: 'patient',
            role: result.role || 'PATIENT',
          });
        }
        
        Alert.alert(
          "Başarılı",
          "Hesabınız zaten onaylı. Giriş yapılıyorsunuz.",
          [
            {
              text: "Tamam",
              onPress: () => {
                // Navigate directly to home for approved patients
                router.replace('/home');
              },
            },
          ]
        );
      } else {
        Alert.alert(
          "Başarılı",
          "Hasta kaydınız tamamlandı. OTP doğrulaması için yönlendiriliyorsunuz.",
          [
            {
              text: "Tamam",
              onPress: () => {
                // Navigate to OTP screen for pending patients
                router.push({
                  pathname: '/otp',
                  params: {
                    email: formData.email,
                    phone: formData.phone,
                    source: 'patient'
                  }
                });
              },
            },
          ]
        );
      }
    } else {
      Alert.alert("Hata", result.error || "Kayıt başarısız");
    }
  } catch (error) {
    console.error('Patient registration error:', error);
    Alert.alert("Hata", "Bağlantı hatası");
  }
}
