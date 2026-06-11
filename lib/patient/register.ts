// lib/patient/register.ts — patient signup + hook (use lib/patient/api.ts for non-hook API helpers)
import { useCallback } from "react";
import { useRouter } from 'expo-router';
import { Alert } from 'react-native';
import { apiGet, apiPost, API_BASE, TIMEOUT_POST } from '../api';
import { savePendingOtpSession } from '../pendingOtpSession';
import { trackMetaCompleteRegistration } from '../metaAppEvents';

export interface PatientRegisterRequest {
  name: string;
  patientName: string;
  email: string;
  phone: string;
  clinicCode?: string;
  joinedViaInvitation?: boolean;
  invitationSource?: string;
  password?: string;
  inviterReferralCode?: string;
  language?: string;
  userType: string;
  /** When set with `oauthProvider`, backend persists `patients.auth_user_id` for the OAuth JWT bridge. */
  supabaseAccessToken?: string;
  oauthProvider?: "google" | "apple";
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

/** POST /api/register/patient — returns JSON body on 4xx so caller can handle user_already_exists without losing OTP recovery. */
export async function registerPatient(data: PatientRegisterRequest): Promise<PatientResponse> {
  const url = `${API_BASE}/api/register/patient`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_POST);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        ...data,
        userType: "PATIENT",
        ...(data.joinedViaInvitation
          ? { joinedViaInvitation: true, invitationSource: data.invitationSource || "clinic_qr" }
          : {}),
        ...(data.supabaseAccessToken && data.oauthProvider
          ? { supabaseAccessToken: data.supabaseAccessToken, oauthProvider: data.oauthProvider }
          : {}),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    const text = await res.text();
    let json: PatientResponse & { requiresOTP?: boolean; patientId?: string; emailSent?: boolean } = {} as any;
    try {
      json = text ? JSON.parse(text) : ({} as any);
    } catch {
      throw new Error(`Invalid JSON from register: ${text.slice(0, 200)}`);
    }
    if (!res.ok) {
      return {
        ok: false,
        error: (json as any)?.error || `http_${res.status}`,
        ...(typeof json === "object" && json ? json : {}),
      } as PatientResponse;
    }
    return json;
  } catch (e: any) {
    clearTimeout(timeoutId);
    if (e?.name === "AbortError") throw new Error("register_timeout");
    throw e;
  }
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
    joinedViaInvitation?: boolean;
    password?: string;
    inviterReferralCode?: string;
    language?: string;
    supabaseAccessToken?: string;
    oauthProvider?: "google" | "apple";
  }) => {
    const result = await registerPatient({
      name: data.name,
      patientName: data.name,
      email: data.email || '',
      phone: data.phone,
      clinicCode: data.clinicCode,
      joinedViaInvitation: data.joinedViaInvitation,
      invitationSource: data.joinedViaInvitation ? "clinic_qr" : undefined,
      password: data.password,
      inviterReferralCode: data.inviterReferralCode,
      language: data.language,
      userType: 'PATIENT',
      ...(data.supabaseAccessToken && data.oauthProvider
        ? { supabaseAccessToken: data.supabaseAccessToken, oauthProvider: data.oauthProvider }
        : {}),
    });

    if (!result.ok) {
      const err = new Error(result.error || 'registration_failed') as any;
      err.code = result.error;
      err.registerResult = result;
      throw err;
    }

    // If OTP is required, go to verification screen
    if ((result as any).requiresOTP) {
      // OTP completion fires CompleteRegistration in otp.tsx after verify.
      await savePendingOtpSession({
        email: data.email || "",
        phone: data.phone,
        patientId: String((result as any).patientId || ""),
        clinicCode: data.clinicCode || "",
        flow: "register",
        emailSent: (result as any).emailSent === false ? "0" : "1",
      });
      router.replace({
        pathname: '/otp' as any,
        params: {
          phone: data.phone,
          email: data.email || '',
          patientId: (result as any).patientId || '',
          source: 'patient',
          clinicCode: data.clinicCode || '',
          flow: 'register',
          emailSent: (result as any).emailSent === false ? '0' : '1',
        },
      });
      return result;
    }

    trackMetaCompleteRegistration(data.oauthProvider ? `oauth_${data.oauthProvider}` : "email");

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
