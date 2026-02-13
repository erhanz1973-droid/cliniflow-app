// lib/patient/api.ts
// Patient-specific API layer
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
