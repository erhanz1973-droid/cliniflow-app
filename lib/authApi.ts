// lib/authApi.ts
// 🔥 KRİTİK: Auth ve OTP için TEK ve SABIT backend
import { AUTH_API_BASE } from './api';

// =====================
// AUTH REQUESTS (SADECE clinic.clinifly.net)
// =====================

export async function authRequestOTP(payload: {
  phone?: string;
  email?: string;
  role: "DOCTOR" | "PATIENT";
}) {
  const url = `${AUTH_API_BASE}/auth/request-otp`;
  console.log("[AUTH API] POST", url, JSON.stringify(payload));
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  
  const text = await res.text();
  console.log("[AUTH API] POST response", res.status, text.substring(0, 200));
  
  if (!res.ok) {
    throw new Error(`POST ${url} -> ${res.status}`);
  }
  
  return JSON.parse(text);
}

export async function authVerifyOTP(payload: {
  phone?: string;
  email?: string;
  otp: string;
  role: "DOCTOR" | "PATIENT";
}) {
  const url = `${AUTH_API_BASE}/auth/verify-otp`;
  console.log("[AUTH API] POST", url, JSON.stringify(payload));
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  
  const text = await res.text();
  console.log("[AUTH API] POST response", res.status, text.substring(0, 200));
  
  if (!res.ok) {
    throw new Error(`POST ${url} -> ${res.status}`);
  }
  
  return JSON.parse(text);
}

// 🔥 KURAL: Asla admin backend'ine auth isteği gitmez
