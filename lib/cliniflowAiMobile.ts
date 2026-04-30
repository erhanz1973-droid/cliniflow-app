/**
 * Shared helpers aligned with cliniflow-backend `lib/cliniflowAiMobile.js`.
 * This app persists the session under `clinifly.auth.v1` (see `auth.tsx`); `authToken` is optional.
 */
import { Platform } from "react-native";
import type AsyncStorageStatic from "@react-native-async-storage/async-storage";

export const AUTH_TOKEN_STORAGE_KEY = "authToken";

const AUTH_SESSION_KEY = "clinifly.auth.v1";

async function storageGet(
  AS: AsyncStorageStatic,
  key: string,
): Promise<string | null> {
  try {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return window.localStorage.getItem(key);
    }
    return await AS.getItem(key);
  } catch {
    return null;
  }
}

function stripBearerPrefix(s: string): string {
  const t = String(s || "").trim();
  if (t.toLowerCase().startsWith("bearer ")) return t.slice(7).trim();
  return t;
}

/** Decode JWT payload without verifying signature (base64url-safe). */
export function decodeJwtPayloadNoVerify(token: string): Record<string, unknown> | null {
  try {
    const parts = String(token || "").trim().split(".");
    if (parts.length < 2) return null;
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    let jsonStr: string;
    if (typeof Buffer !== "undefined") {
      jsonStr = Buffer.from(b64, "base64").toString("utf8");
    } else if (typeof atob !== "undefined") {
      jsonStr = decodeURIComponent(
        Array.from(atob(b64), (c) => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`).join(""),
      );
    } else {
      return null;
    }
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** `:patientId` for `/api/patient/:patientId/medical-form` — must match JWT `patientId` / `sub`. */
export function getPatientIdFromToken(token: string): string {
  const pl = decodeJwtPayloadNoVerify(token);
  if (!pl || typeof pl !== "object") return "";
  const raw =
    pl.patientId ?? pl.sub ?? pl.patientUuid ?? pl.patient_uuid ?? "";
  return String(raw).trim();
}

/**
 * Latest persisted patient JWT (raw). Tries `authToken`, then `clinifly.auth.v1` → `user.token`.
 */
export async function getCliniflowAuthToken(
  AsyncStorage: AsyncStorageStatic | null | undefined,
): Promise<string> {
  if (!AsyncStorage || typeof AsyncStorage.getItem !== "function") return "";
  try {
    const direct = await storageGet(AsyncStorage, AUTH_TOKEN_STORAGE_KEY);
    if (direct && direct.trim()) return stripBearerPrefix(direct);

    const raw = await storageGet(AsyncStorage, AUTH_SESSION_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw) as { token?: string };
    const t = parsed?.token;
    if (typeof t === "string" && t.trim()) return stripBearerPrefix(t);
  } catch {
    /* non-fatal */
  }
  return "";
}
