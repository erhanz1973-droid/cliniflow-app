// lib/doctor/api.ts
// Doctor-specific API layer
import { apiGet, apiPost } from '../api';

export interface DoctorRegisterRequest {
  name: string;
  email: string;
  phone: string;
  clinicCode: string;
  licenseNumber: string;
  department?: string;
  specialties?: string;
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
    role: 'doctor' // Explicit doctor role
  });
}

// Doctor login/OTP verification
export async function verifyDoctorOtp(data: { phone: string; otp: string; email?: string }): Promise<DoctorResponse> {
  return apiPost<DoctorResponse>('/auth/verify-otp', {
    ...data,
    type: 'doctor' // Explicit doctor type
  });
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
