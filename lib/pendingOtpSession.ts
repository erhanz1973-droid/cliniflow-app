/**
 * Resumable patient OTP verification — survives app background / navigation loss.
 * Cleared after successful verify (see otp.tsx) or when expired.
 */
import { API_BASE } from "./api";
import { safeGetItem, safeRemoveItem, safeSetItem } from "./asyncStorageSafe";

export const PENDING_OTP_STORAGE_KEY = "@cliniflow:pending_otp_session_v1";

/** Max age for "continue verification" (client guard; server OTP may differ). */
export const PENDING_OTP_TTL_MS = 30 * 60 * 1000;

/** Min seconds between resend prompts (client-side UX). */
export const OTP_RESEND_COOLDOWN_SEC = 60;

export type PendingOtpFlow = "register" | "login";

export type PendingOtpSession = {
  v: 1;
  email: string;
  phone: string;
  patientId: string;
  clinicCode: string;
  flow: PendingOtpFlow;
  issuedAt: number;
  /** ISO param for otp screen */
  emailSent?: string;
  lastResendAt?: number;
};

function normalizePhone(s: string): string {
  return String(s || "").replace(/\D/g, "");
}

function normalizeEmail(s: string): string {
  return String(s || "").trim().toLowerCase();
}

export function isPendingOtpSessionFresh(s: PendingOtpSession | null, now = Date.now()): boolean {
  if (!s || s.v !== 1) return false;
  if (!s.issuedAt || now - s.issuedAt > PENDING_OTP_TTL_MS) return false;
  const hasChannel = !!(normalizePhone(s.phone) || normalizeEmail(s.email) || String(s.patientId || "").trim());
  return hasChannel;
}

export async function savePendingOtpSession(partial: Omit<PendingOtpSession, "v" | "issuedAt"> & { issuedAt?: number }): Promise<void> {
  const row: PendingOtpSession = {
    v: 1,
    email: normalizeEmail(partial.email),
    phone: String(partial.phone || "").trim(),
    patientId: String(partial.patientId || "").trim(),
    clinicCode: String(partial.clinicCode || "").trim().toUpperCase(),
    flow: partial.flow === "login" ? "login" : "register",
    issuedAt: typeof partial.issuedAt === "number" ? partial.issuedAt : Date.now(),
    emailSent: partial.emailSent,
    lastResendAt: partial.lastResendAt,
  };
  await safeSetItem(PENDING_OTP_STORAGE_KEY, JSON.stringify(row));
}

export async function loadPendingOtpSession(): Promise<PendingOtpSession | null> {
  const raw = await safeGetItem(PENDING_OTP_STORAGE_KEY);
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as PendingOtpSession;
    if (!o || o.v !== 1) return null;
    if (!isPendingOtpSessionFresh(o)) {
      await safeRemoveItem(PENDING_OTP_STORAGE_KEY);
      return null;
    }
    return o;
  } catch {
    return null;
  }
}

export async function clearPendingOtpSession(): Promise<void> {
  await safeRemoveItem(PENDING_OTP_STORAGE_KEY);
}

export function pendingOtpMatchesIdentity(
  pending: PendingOtpSession,
  opts: { phone?: string; email?: string },
): boolean {
  const pPhone = normalizePhone(pending.phone);
  const oPhone = normalizePhone(opts.phone || "");
  if (pPhone && oPhone && pPhone === oPhone) return true;
  const pEm = normalizeEmail(pending.email);
  const oEm = normalizeEmail(opts.email || "");
  if (pEm && oEm && pEm === oEm) return true;
  return false;
}

export function resendCooldownRemainingSec(session: PendingOtpSession | null, now = Date.now()): number {
  if (!session?.lastResendAt) return 0;
  const elapsed = Math.floor((now - session.lastResendAt) / 1000);
  return Math.max(0, OTP_RESEND_COOLDOWN_SEC - elapsed);
}

export async function touchPendingOtpResend(): Promise<void> {
  const raw = await safeGetItem(PENDING_OTP_STORAGE_KEY);
  if (!raw) return;
  try {
    const cur = JSON.parse(raw) as PendingOtpSession;
    if (!cur || cur.v !== 1) return;
    await savePendingOtpSession({
      email: cur.email,
      phone: cur.phone,
      patientId: cur.patientId,
      clinicCode: cur.clinicCode,
      flow: cur.flow,
      emailSent: cur.emailSent,
      issuedAt: cur.issuedAt,
      lastResendAt: Date.now(),
    });
  } catch {
    /* ignore */
  }
}

/** POST /auth/request-otp — used when resuming after "already exists" without a stored session row. */
export async function requestPatientOtp(body: {
  phone?: string;
  email?: string;
  clinicCode?: string;
  clinic_code?: string;
}): Promise<{ ok: boolean; error?: string; raw?: Record<string, unknown> }> {
  const payload = {
    role: "PATIENT",
    ...(body.phone ? { phone: body.phone } : {}),
    ...(body.email ? { email: body.email } : {}),
    ...(body.clinicCode ? { clinicCode: body.clinicCode, clinic_code: body.clinicCode } : {}),
    ...(body.clinic_code ? { clinic_code: body.clinic_code } : {}),
  };
  try {
    const res = await fetch(`${API_BASE}/auth/request-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      /* ignore */
    }
    return { ok: res.ok, error: typeof json.error === "string" ? json.error : undefined, raw: json };
  } catch {
    return { ok: false, error: "network" };
  }
}
