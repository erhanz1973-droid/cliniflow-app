// lib/doctor/register.ts
// Doctor registration logic - NO OTP required
import { registerDoctor, DoctorRegisterRequest } from './api';
import { router } from 'expo-router';
import { Alert } from 'react-native';

export async function handleDoctorRegistration(formData: DoctorRegisterRequest) {
  const result = await registerDoctor(formData);
  return result;
}
