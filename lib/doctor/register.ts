// lib/doctor/register.ts
// Doctor registration logic - NO OTP required
import { registerDoctor, DoctorRegisterRequest } from './api';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { useAuth } from '../auth';

export async function handleDoctorRegistration(formData: DoctorRegisterRequest) {
  try {
    const result = await registerDoctor(formData);
    
    if (result.ok && result.token) {
      // 🔥 CRITICAL: Doctor role finalized at registration time
      // NO OTP required for doctors
      const { signIn } = useAuth();
      await signIn({
        token: result.token,
        doctorId: result.doctorId,
        clinicId: result.clinicId,
        type: "doctor",
        role: "DOCTOR",
        status: result.status,
      });
      
      Alert.alert(
        "Başvuru alındı",
        "Doktor hesabınız admin onayından sonra Aktif edilecektir.",
        [
          {
            text: "Tamam",
            onPress: () => {
              // Route based on doctor status - NO OTP
              const targetRoute = result.status === "ACTIVE" 
                ? "/doctor/dashboard" 
                : "/waiting-approval";
              router.replace(targetRoute);
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
