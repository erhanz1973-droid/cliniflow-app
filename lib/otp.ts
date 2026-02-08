// lib/otp.ts
import { API_BASE } from './api';

export async function sendOTP(phone: string, email?: string) {
  try {
    console.log("[OTP] Sending OTP:", { phone, email });
    
    const response = await fetch(`${API_BASE}/auth/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone,
        email,
      }),
    });

    const data = await response.json();
    
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(data.message || 'OTP çok sık talep ediliyor. Lütfen 2 dakika bekleyin.');
      }
      throw new Error(data.message || 'OTP gönderilemedi');
    }

    console.log("[OTP] OTP sent successfully:", data);
    return data;
  } catch (error) {
    console.error("[OTP] Send error:", error);
    throw error;
  }
}
