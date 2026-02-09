// lib/doctor/register.ts
// Doctor registration logic - ONLY API CALL
import { registerDoctor, DoctorRegisterRequest } from './api';

export async function handleDoctorRegistration(formData: DoctorRegisterRequest) {
  const result = await registerDoctor(formData);
  return result;
}
