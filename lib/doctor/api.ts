// lib/doctor/api.ts
import { apiGet, apiPost } from '../api';

export interface DoctorRegisterRequest {
  name: string;
  email: string;
  phone: string;
  clinicCode: string;
  licenseNumber: string; // ✅ Backend requires license number
  department?: string;
  specialties?: string; // ✅ Database might expect string
  title?: string;
  experienceYears?: string;
  languages?: string;
}

export interface DoctorLoginRequest {
  phone: string;
  otp: string;
  email?: string;
}

export interface DoctorResponse {
  ok: boolean;
  doctorId?: string;
  token?: string;
  name?: string;
  role?: string;
  status?: string;
  clinicId?: string;
  error?: string;
}

// Doctor registration - EXPLICIT DOCTOR ENDPOINT
export async function registerDoctor(data: DoctorRegisterRequest): Promise<DoctorResponse> {
  return apiPost<DoctorResponse>('/api/register/doctor', {
    ...data,
    // ❌ DON'T send userType - backend already sets it to "DOCTOR"
    // userType: 'DOCTOR', 
  });
}

// ❌ OTP YOK – doktor için kapalı
export async function verifyDoctorOtp() {
  throw new Error('Doctor OTP flow is disabled');
}

// Get doctor data
export async function getDoctorData(doctorId: string): Promise<any> {
  return apiGet<any>(`/api/doctor/${doctorId}`);
}

// Get doctor applications (admin only)
export async function getDoctorApplications(): Promise<any> {
  return apiGet<any>('/api/admin/doctor-applications');
}

// Approve doctor (admin only)
export async function approveDoctor(doctorId: string): Promise<any> {
  return apiPost<any>('/api/admin/approve-doctor', { doctorId });
}
