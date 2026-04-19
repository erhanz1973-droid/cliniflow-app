// cliniflow-app/lib/api.ts

/**
 * API base URL — embedded at EAS/Expo build time from EXPO_PUBLIC_* env.
 * Production backend is cliniflow-backend-clean on Railway only (no in-app /server).
 * Fallback keeps local runs working if .env is missing.
 */
const RAILWAY_DEFAULT = "https://cliniflow-backend-clean-production.up.railway.app";
const API_BASE = String(
  process.env.EXPO_PUBLIC_API_BASE ||
    process.env.EXPO_PUBLIC_API_URL ||
    RAILWAY_DEFAULT
).trim() || RAILWAY_DEFAULT;

console.log("USING API:", API_BASE);

// ── Timeout constants (ms) ───────────────────────────────────────────────────
export const TIMEOUT_GET  = 10_000;
export const TIMEOUT_POST = 15_000;
export const TIMEOUT_PUT  = 10_000;

// ── Error classification ─────────────────────────────────────────────────────
export type ApiErrorKind = 'timeout' | 'network' | 'server' | 'warmingUp' | 'auth' | 'generic';

export function classifyApiError(err: unknown): ApiErrorKind {
  const msg = String((err as any)?.message || '');
  if (msg.includes('timeout') || msg.includes('AbortError')) return 'timeout';
  if (msg.includes('Network request failed') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) return 'network';
  if (msg.includes('502') || msg.includes('503') || msg.includes('504')) return 'warmingUp';
  if (msg.includes('401') || msg.includes('403')) return 'auth';
  if (/5\d\d/.test(msg)) return 'server';
  return 'generic';
}

export { API_BASE };
export const AUTH_API_BASE = API_BASE;
export const ADMIN_API_BASE = API_BASE;

// =====================
// AUTH TOKEN
// =====================

let AUTH_TOKEN: string | null = null;

export function setAuthToken(token: string | null) {
  AUTH_TOKEN = token;
}

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (AUTH_TOKEN) {
    headers.Authorization = `Bearer ${AUTH_TOKEN}`;
  }
  return headers;
}

/** For multipart uploads (do not set Content-Type — boundary is set by fetch). */
export function getAuthHeaders(): Record<string, string> {
  return authHeaders();
}

// =====================
// SAFE JSON
// =====================

async function parseJsonSafe<T>(url: string, text: string): Promise<T> {
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from ${url}: ${text.substring(0, 200)}`);
  }
}

// =====================
// GET
// =====================

export async function apiGet<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  console.log("CALLING API:", url);
  console.trace("API TRACE", url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_GET);

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        ...authHeaders(),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`GET ${url} -> ${res.status}`);
    }

    return parseJsonSafe<T>(url, text);
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`GET timeout: ${url}`);
    }
    console.error("[API] GET error:", err.message);
    throw err;
  }
}

// =====================
// POST
// =====================

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  console.log("CALLING API:", url);
  console.trace("API TRACE", url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_POST);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`POST ${url} -> ${res.status}: ${text.substring(0, 200)}`);
    }

    return parseJsonSafe<T>(url, text);
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`POST timeout: ${url}`);
    }
    throw err;
  }
}

// =====================
// PUT
// =====================

export async function apiPut<T>(path: string, body: any): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  console.log("CALLING API:", url);
  console.trace("API TRACE", url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_PUT);

  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...authHeaders(),
      },
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`PUT ${url} -> ${res.status}`);
    }

    return parseJsonSafe<T>(url, text);
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`PUT timeout: ${url}`);
    }
    console.error("[API] PUT error:", err.message);
    throw err;
  }
}
