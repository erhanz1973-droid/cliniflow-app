// lib/doctor/register.ts
// Doctor registration logic
import { registerDoctor, DoctorRegisterRequest } from './api';
import { router } from 'expo-router';
import { Alert } from 'react-native';

export async function handleDoctorRegistration(formData: DoctorRegisterRequest) {
  try {
    const result = await registerDoctor(formData);
    
    if (result.ok) {
      Alert.alert(
        "Başarılı",
        "Doktor kaydınız tamamlandı. OTP doğrulaması için yönlendiriliyorsunuz.",
        [
          {
            text: "Tamam",
            onPress: () => {
              // Navigate to OTP screen with doctor source
              router.push({
                pathname: '/otp',
                params: {
                  email: formData.email,
                  phone: formData.phone,
                  source: 'doctor' // Explicit doctor source
                }
              });
            },
          },
        ]
      );
    } else {
      Alert.alert("Hata", result.error || "Doktor kaydı başarısız");
    }
  } catch (error) {
    console.error('Doctor registration error:', error);
    Alert.alert("Hata", "Bağlantı hatası");
  }
}
