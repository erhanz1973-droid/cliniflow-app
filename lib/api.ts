// cliniflow-app/lib/api.ts

/**
 * API configuration with environment variable support
 * Single source of truth for all API calls
 */

const DEFAULT_API =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_BASE)
    ? String(process.env.EXPO_PUBLIC_API_BASE).replace(/\/+$/, "")
    : (typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_URL)
      ? String(process.env.EXPO_PUBLIC_API_URL).replace(/\/+$/, "")
      : "https://cliniflow-backend-dg8a.onrender.com";

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

export const API_BASE = DEFAULT_API;
export const AUTH_API_BASE = API_BASE;
export const ADMIN_API_BASE = API_BASE;

if (!API_BASE) {
  throw new Error(
    `API_BASE is not defined.`
  );
}

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
  console.log('[API] Auth headers:', AUTH_TOKEN ? `Bearer ${AUTH_TOKEN.substring(0, 20)}...` : 'No token');
  return headers;
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
  console.log("[API] GET", url);

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
    console.log("[API] GET response", res.status, text.substring(0, 200));

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
  console.log("[API] POST", url, JSON.stringify(body).substring(0, 200));

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
    console.log("[API] POST response", res.status, text.substring(0, 200));

    if (!res.ok) {
      console.error("[API] POST error response:", text);
      throw new Error(`POST ${url} -> ${res.status}: ${text}`);
    }

    return parseJsonSafe<T>(url, text);
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`POST timeout: ${url}`);
    }
    console.error("[API] POST error:", err.message);
    throw err;
  }
}

// =====================
// PUT
// =====================

export async function apiPut<T>(path: string, body: any): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  console.log("[API] PUT", url, JSON.stringify(body).substring(0, 200));

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
    console.log("[API] PUT response", res.status, text.substring(0, 200));

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
