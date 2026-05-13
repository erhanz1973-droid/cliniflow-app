// cliniflow-app/lib/api.ts

import Constants from "expo-constants";

/**
 * Fallback when `.env` / EAS secrets omit `EXPO_PUBLIC_API_URL` — Railway production API.
 */
const DEFAULT_PUBLIC_API_URL = "https://cliniflow-backend-clean-production.up.railway.app";

function normalizeBaseUrl(raw: string | undefined | null): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) return null;
  return s.replace(/\/+$/, "");
}

/** Resolve public API origin: env (build-time) → `app.config` extra → default Railway URL. */
function resolvePublicApiUrl(): string {
  const envUrl =
    (typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_URL?.trim()) ||
    (typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_BASE?.trim()) ||
    "";

  const extra = Constants.expoConfig?.extra as
    | { API_URL?: string; api_url?: string }
    | undefined;
  const fromExtra =
    typeof extra?.API_URL === "string"
      ? extra.API_URL.trim()
      : typeof extra?.api_url === "string"
        ? extra.api_url.trim()
        : "";

  return (
    normalizeBaseUrl(envUrl) ||
    normalizeBaseUrl(fromExtra || null) ||
    DEFAULT_PUBLIC_API_URL
  );
}

/** Resolved HTTPS origin (no trailing slash). Logged once at startup to verify prod builds. */
const API_URL = resolvePublicApiUrl();
console.log("API_BASE:", API_URL);

if (typeof __DEV__ !== "undefined" && __DEV__) {
  const invalid =
    API_URL.includes("172.") ||
    API_URL.includes("localhost") ||
    API_URL.includes(":8081") ||
    API_URL.includes(":19000");

  if (invalid) {
    throw new Error(
      "[CONFIG ERROR] API_BASE is pointing to Metro/dev server. Fix your .env",
    );
  }
}

export const API_BASE = API_URL;

/**
 * Backend often returns path-only URLs (`/uploads/...`). `Linking.openURL` and `Image`
 * may interpret those as local paths (`file:///uploads/...`). Join with API origin.
 */
export function resolvePublicAssetUrl(raw: string | null | undefined): string {
  const u = String(raw ?? "").trim();
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith("//")) return `https:${u}`;
  const pathOnly = u.replace(/^file:\/\//i, "");
  const path = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
  return `${API_BASE.replace(/\/+$/, "")}${path}`;
}

if (typeof __DEV__ !== "undefined" && !__DEV__) {
  if (!API_BASE.startsWith("https://")) {
    console.error("[CONFIG ERROR] Invalid API_BASE in production:", API_BASE);
  }
}

/** POST /analyze-teeth on the same backend as API_BASE */
export const ANALYZE_TEETH_URL = `${API_BASE.replace(/\/+$/, "")}/analyze-teeth`;

// ── Timeout constants (ms) ───────────────────────────────────────────────────
export const TIMEOUT_GET  = 25_000;
/** Liste / ağır backend (ör. doctor patients + takvim birleşimi) */
export const TIMEOUT_GET_LONG = 55_000;
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

export async function apiGet<T>(path: string, opts?: { timeoutMs?: number }): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  const timeoutMs = opts?.timeoutMs ?? TIMEOUT_GET;

  if (__DEV__) console.log("CALLING API:", url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

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

  if (__DEV__) console.log("CALLING API:", url);

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

  if (__DEV__) console.log("CALLING API:", url);

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

