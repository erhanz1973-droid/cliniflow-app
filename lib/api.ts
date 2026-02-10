// cliniflow-app/lib/api.ts

/**
 * Merkezi API helper
 * - SINGLE source of truth for API base
 * - DEV / PROD farkı YOK
 * - Unsafe local IP'ler otomatik clamp edilir
 */

function normalizeApiBase(raw: string): string {
  const base = String(raw || "").trim().replace(/\/+$/, "");
  if (!base) return "";

  // ❌ Asla izin verilmeyen adresler
  if (
    base.includes("172.20.") ||
    base.includes("localhost") ||
    base.includes(":5050")
  ) {
    console.warn(
      "[API] Unsafe API base detected, forcing production backend:",
      base
    );
    return "https://clinic.clinifly.net";
  }

  return base;
}

// 🔥 TEK KAYNAK - Production backend
export const AUTH_API_BASE = "https://clinic.clinifly.net";

// 🔥 Admin backend AYRI
export const ADMIN_API_BASE = "https://cliniflow-admin.onrender.com";

// 🔥 LEGACY - Backward compatibility (will be removed)
export const API_BASE = AUTH_API_BASE;

console.log("🔥 FINAL API CONFIG", {
  API_BASE,
  ADMIN_API_BASE,
});

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
  return AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {};
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
  const timeoutId = setTimeout(() => controller.abort(), 30000);

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
  const timeoutId = setTimeout(() => controller.abort(), 30000);

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
      throw new Error(`POST ${url} -> ${res.status}`);
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
  const timeoutId = setTimeout(() => controller.abort(), 30000);

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
