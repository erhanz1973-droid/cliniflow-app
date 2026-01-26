// cliniflow-app/lib/api.ts

/**
 * Merkezi API helper
 * - PROD URL sabit: https://cliniflow-admin.onrender.com
 * - GET / POST ortak error handling
 * - Authorization token desteği
 * - Detaylı hata loglama
 */

function normalizeApiBase(raw: string): string {
  const base = String(raw || "").trim().replace(/\/+$/, "");
  if (!base) return "";

  // Safety clamp: prevent accidental usage of the wrong Render service.
  // The real backend is served from cliniflow-admin.onrender.com.
  if (base.includes("cliniflow-backend-dg8a.onrender.com")) {
    return "https://cliniflow-admin.onrender.com";
  }

  return base;
}

// API base must come from env (single source of truth)
const RAW_API_BASE = process.env.EXPO_PUBLIC_API_BASE || "";
export const API_BASE = normalizeApiBase(RAW_API_BASE);

if (!API_BASE) {
  throw new Error(
    `API_BASE is not defined. Set EXPO_PUBLIC_API_BASE in env. (raw: "${String(RAW_API_BASE)}")`
  );
}

if (RAW_API_BASE && RAW_API_BASE !== API_BASE) {
  console.warn("[API] Normalized API_BASE from:", RAW_API_BASE, "to:", API_BASE);
} else if (__DEV__) {
  console.log("[API] Using API_BASE:", API_BASE);
}

// Uygulamada token'ı tek yerden set etmek için
// Örnek: setAuthToken(token) login sonrası çağrılır
let AUTH_TOKEN: string | null = null;

export function setAuthToken(token: string | null) {
  AUTH_TOKEN = token;
}

function authHeaders() {
  return AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};
}

async function parseJsonSafe<T>(url: string, text: string): Promise<T> {
  if (!text) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid JSON from ${url}: ${text}`);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  console.log("[API] GET request:", url);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 saniye timeout

    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...authHeaders(),
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const text = await res.text();
    console.log("[API] GET response:", res.status, text.substring(0, 200));

    if (!res.ok) {
      throw new Error(`GET ${url} -> ${res.status} ${text}`);
    }

    return parseJsonSafe<T>(url, text);
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.error("[API] GET timeout:", url);
      throw new Error(`Zaman aşımı: ${url}`);
    }
    console.error("[API] GET error:", url, err.message);
    throw err;
  }
}

export async function apiPost<T>(path: string, body: any): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
  console.log("[API] POST request:", url, JSON.stringify(body).substring(0, 200));

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 saniye timeout

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
    console.log("[API] POST response:", res.status, text.substring(0, 200));

    if (!res.ok) {
      throw new Error(`POST ${url} -> ${res.status} ${text}`);
    }

    return parseJsonSafe<T>(url, text);
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.error("[API] POST timeout:", url);
      throw new Error(`Zaman aşımı: ${url}`);
    }
    console.error("[API] POST error:", url, err.message);
    throw err;
  }
}

