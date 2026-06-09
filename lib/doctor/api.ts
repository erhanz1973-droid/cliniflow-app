// lib/doctor/api.ts
import { apiGet, apiPost, apiPut, API_BASE, TIMEOUT_POST } from "../api";

export interface DoctorRegisterRequest {
  name: string;
  email: string;
  phone: string;
  password: string;
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

// Doctor registration — return JSON body on 4xx so UI can show localized errors (not raw HTTP text).
export async function registerDoctor(data: DoctorRegisterRequest): Promise<DoctorResponse> {
  const payload = {
    name: data.name,
    email: data.email,
    phone: data.phone,
    password: data.password,
    clinicCode: data.clinicCode,
    licenseNumber: data.licenseNumber,
    department: data.department || "General",
    specialties: data.specialties || "General",
  };

  const url = `${API_BASE}/api/register/doctor`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_POST);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const text = await res.text();
    let json: DoctorResponse = { ok: false };
    try {
      json = text ? JSON.parse(text) : { ok: false };
    } catch {
      throw new Error(`Invalid JSON from register/doctor: ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      return {
        ok: false,
        error: json.error || `http_${res.status}`,
        ...(typeof json === "object" && json ? json : {}),
      };
    }
    return json;
  } catch (e: unknown) {
    clearTimeout(timeoutId);
    const err = e as { name?: string };
    if (err?.name === "AbortError") throw new Error("register_timeout");
    throw e;
  }
}

// ❌ OTP YOK – doktor için kapalı (imza uyumluluğu için argüman varsayılan yok sayılır)
export async function verifyDoctorOtp(_unused?: Partial<DoctorLoginRequest>): Promise<never> {
  void _unused;
  throw new Error("Doctor OTP flow is disabled");
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

// Get current doctor profile
export async function getCurrentDoctorProfile(): Promise<any> {
  return apiGet<any>('/api/doctor/me');
}

// Update current doctor profile
export async function updateCurrentDoctorProfile(data: {
  name?: string;
  phone?: string;
  department?: string;
  title?: string;
  experience_years?: string | number;
  languages?: string;
  specialties?: string;
}): Promise<any> {
  return apiPut<any>('/api/doctor/me', data);
}
