// lib/doctor/login.ts
// Doctor login/OTP logic
import { verifyDoctorOtp, DoctorLoginRequest } from './api';

export async function handleDoctorLogin(data: DoctorLoginRequest) {
  try {
    // Ensure OTP is provided for verification
    if (!data.otp) {
      throw new Error('OTP is required for doctor login');
    }
    
    const result = await verifyDoctorOtp({
      phone: data.phone,
      otp: data.otp,
      email: data.email
    });
    return result;
  } catch (error) {
    console.error('Doctor login error:', error);
    throw error;
  }
}
