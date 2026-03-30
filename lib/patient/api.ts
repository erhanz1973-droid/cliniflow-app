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

// Patient login/OTP verification — backend expects { phone, otp, type: "patient" }
export async function verifyPatientOtp(data: { phone: string; otp: string }): Promise<PatientResponse> {
  return apiPost<PatientResponse>('/auth/verify-otp', {
    phone: data.phone,
    otp: data.otp,
    type: 'patient',
  });
}

// Get patient data
export async function getPatientData(patientId: string): Promise<any> {
  return apiGet<any>(`/api/patient/${patientId}`);
}
