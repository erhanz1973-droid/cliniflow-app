// lib/patient/register.ts
// Patient registration logic
import { registerPatient, PatientRegisterRequest } from './api';
import { router } from 'expo-router';
import { Alert } from 'react-native';

export async function handlePatientRegistration(formData: PatientRegisterRequest) {
  try {
    const result = await registerPatient(formData);
    
    if (result.ok) {
      Alert.alert(
        "Başarılı",
        "Hasta kaydınız tamamlandı. OTP doğrulaması için yönlendiriliyorsunuz.",
        [
          {
            text: "Tamam",
            onPress: () => {
              // Navigate to OTP screen with patient source
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
    } else {
      Alert.alert("Hata", result.error || "Kayıt başarısız");
    }
  } catch (error) {
    console.error('Patient registration error:', error);
    Alert.alert("Hata", "Bağlantı hatası");
  }
}
