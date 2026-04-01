// lib/patient/api.ts
// Patient-specific API layer
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { apiGet, apiPost } from '../api';

export interface PatientRegisterRequest {
  name: string;
  patientName: string; // ✅ Add patientName field
  email: string;
  phone: string;
  clinicCode?: string;
  inviterReferralCode?: string; // Add referral code field
  userType: string; // ✅ Add userType field
}

export interface PatientLoginRequest {
  phone: string;
  otp: string;
  email?: string;
}

export interface PatientResponse {
  ok: boolean;
  patientId?: string;
  token?: string;
  name?: string;
  role?: string;
  status?: string;
  error?: string; // Add error property
}

// Patient registration
export async function registerPatient(data: PatientRegisterRequest): Promise<PatientResponse> {
  return apiPost<PatientResponse>('/api/register/patient', {
    ...data,
    userType: 'PATIENT' // Explicit patient role
  });
}

// Patient login/OTP verification
export async function verifyPatientOtp(data: { phone: string; otp: string; email?: string }): Promise<PatientResponse> {
  return apiPost<PatientResponse>('/auth/verify-otp', {
    ...data,
    type: 'patient' // Explicit patient type
  });
}

// Get patient data
export async function getPatientData(patientId: string): Promise<any> {
  return apiGet<any>(`/api/patient/${patientId}`);
}

// Hook that wraps registration and handles navigation on success
export function usePatientRegistration() {
  const router = useRouter();

  const handlePatientRegistration = async (data: {
    name: string;
    email?: string;
    phone: string;
    clinicCode?: string;
    inviterReferralCode?: string;
  }) => {
    const result = await registerPatient({
      name: data.name,
      patientName: data.name,
      email: data.email || '',
      phone: data.phone,
      clinicCode: data.clinicCode,
      inviterReferralCode: data.inviterReferralCode,
      userType: 'PATIENT',
    });

    if (!result.ok) {
      // Preserve the error code so the caller can show a specific message
      const err = new Error(result.error || 'registration_failed') as any;
      err.code = result.error;
      throw err;
    }

    Alert.alert(
      'Başarılı',
      'Kayıt başarılı! Giriş yapabilirsiniz.',
      [{ text: 'Tamam', onPress: () => router.replace('/login/patient' as any) }]
    );

    return result;
  };

  return { handlePatientRegistration };
}
