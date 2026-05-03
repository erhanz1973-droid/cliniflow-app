// lib/patient/register.ts — patient signup + hook (use lib/patient/api.ts for non-hook API helpers)
import { useCallback } from "react";
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { apiGet, apiPost } from '../api';

export interface PatientRegisterRequest {
  name: string;
  patientName: string;
  email: string;
  phone: string;
  clinicCode?: string;
  password?: string;
  inviterReferralCode?: string;
  userType: string;
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

  const handlePatientRegistration = useCallback(async (data: {
    name: string;
    email?: string;
    phone: string;
    clinicCode?: string;
    password?: string;
    inviterReferralCode?: string;
  }) => {
    const result = await registerPatient({
      name: data.name,
      patientName: data.name,
      email: data.email || '',
      phone: data.phone,
      clinicCode: data.clinicCode,
      password: data.password,
      inviterReferralCode: data.inviterReferralCode,
      userType: 'PATIENT',
    });

    if (!result.ok) {
      const err = new Error(result.error || 'registration_failed') as any;
      err.code = result.error;
      throw err;
    }

    // If OTP is required, go to verification screen
    if ((result as any).requiresOTP) {
      router.replace({
        pathname: '/otp' as any,
        params: {
          phone: data.phone,
          email: data.email || '',
          patientId: (result as any).patientId || '',
          source: 'patient',
          emailSent: (result as any).emailSent === false ? '0' : '1',
        },
      });
      return result;
    }

    // No OTP required (e.g. reviewer bypass) → go directly to login
    Alert.alert(
      'Başarılı',
      'Kayıt başarılı! Giriş yapabilirsiniz.',
      [{ text: 'Tamam', onPress: () => router.replace('/login/patient' as any) }]
    );

    return result;
  }, [router]);

  return { handlePatientRegistration };
}
