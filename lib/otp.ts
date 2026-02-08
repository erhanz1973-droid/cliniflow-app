// lib/otp.ts
import { ADMIN_API_BASE } from './api';

export async function sendOTP(phone: string, email?: string) {
  try {
    console.log("[OTP] Sending OTP:", { phone, email });
    
    const response = await fetch(`${ADMIN_API_BASE}/auth/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone,
        email,
      }),
    });

    // Safe JSON parsing
    const text = await response.text();
    let data;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error("Invalid OTP response (not JSON)");
    }
    
    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(data?.message || 'OTP çok sık talep ediliyor. Lütfen 2 dakika bekleyin.');
      }
      throw new Error(data?.message || 'OTP gönderilemedi');
    }

    console.log("[OTP] OTP sent successfully:", data);
    return data;
  } catch (error) {
    console.error("[OTP] Send error:", error);
    throw error;
  }
}
