// lib/patient/login.ts
// Patient login/OTP logic
import { verifyPatientOtp, PatientLoginRequest } from './api';

export async function handlePatientLogin(data: PatientLoginRequest) {
  try {
    // Ensure OTP is provided for verification
    if (!data.otp) {
      throw new Error('OTP is required for patient login');
    }
    
    const result = await verifyPatientOtp({
      phone: data.phone,
      otp: data.otp,
    });
    return result;
  } catch (error) {
    console.error('Patient login error:', error);
    throw error;
  }
}
