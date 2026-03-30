// lib/otp.ts
import { ADMIN_API_BASE } from './api';

export async function sendOTP(params: {
  email?: string;
  phone?: string;
  userType: "patient" | "doctor";
}) {
  // 🔥 KESİN GUARD
  if (params.userType === "doctor") {
    console.log("[OTP] Skipping OTP for doctor");
    return { skipped: true };
  }

  // 🔒 EKSTRA KİLİT - Log all sendOTP calls
  console.log("[OTP] sendOTP called with userType =", params.userType);

  // 👇 bundan sonrası SADECE patient
  try {
    console.log("[OTP] Sending OTP:", { phone: params.phone, email: params.email });
    
    const response = await fetch(`${ADMIN_API_BASE}/auth/send-otp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        phone: params.phone?.trim(),
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
  } catch (err: any) {
    console.error("[OTP] send failed:", err.message);
    // ❌ hard reset YOK
    throw err;
  }
}
