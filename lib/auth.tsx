// lib/auth.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
  type MutableRefObject,
} from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { API_BASE, setAuthToken } from "./api";
import { resetAppIconBadgeCount } from "./chatAckOpen";
import { registerExpoPushForSession } from "./registerExpoPush";
import { installForegroundChatNotificationEffects } from "./chatPushForegroundBehavior";
import { SplashBootstrap } from "./splash-bootstrap";
import { clearClinic } from "../store/useClinicStore";
import { emitAuthTelemetryV1 } from "./authTelemetry";
import { getSupabaseAuthClient } from "./supabaseAuthClient";

/* ================= TYPES ================= */

export type UserRole = "PATIENT" | "DOCTOR" | "ADMIN";

type User = {
  id: string;
  token: string;
  type: "patient" | "doctor" | "admin"; // 🔥 REQUIRED: type is PRIMARY routing key
  role: "PATIENT" | "DOCTOR" | "ADMIN";
  name?: string;
  email?: string;
  phone?: string;
  patientId?: string; // For patients
  doctorId?: string; // For doctors
  clinicId?: string; // For doctors, admins, and patients who have joined a clinic
  clinicCode?: string; // For admins and patients who have joined a clinic
  status?: string; // For doctors
  profilePhotoUrl?: string;
  diplomaFileUrl?: string;
  department?: string;
  specialties?: string[];
  title?: string;
  experienceYears?: number;
  languages?: string[];
};

type AuthContextValue = {
  user: User | null;
  /** Monotonic session generation: bumps on successful sign-in and sign-out. Capture before `await`, then bail if `authSessionEpochRef.current !== snapshot` to avoid post-logout setState / native calls. */
  authSessionEpochRef: MutableRefObject<number>;
  isAuthLoading: boolean;
  isAuthReady: boolean;
  isAuthed: boolean;
  isDoctor: boolean;
  isPatient: boolean;
  isAdmin: boolean;
  isOtpVerified: boolean; // 🔥 CRITICAL: OTP verification flag
  isInitialized: boolean; // 🔥 CRITICAL: Initialization state
  signIn: (input: any) => Promise<void>;
  /** @param opts.replaceTo expo-router href; default `"/"` (index routes by saved role). */
  signOut: (opts?: { replaceTo?: string }) => Promise<void>;
  refreshAuth: () => Promise<void>;
  patchUser: (patch: Partial<User>) => Promise<void>;
  setOtpVerified: (verified: boolean) => void;
  updateRole: (newRole: UserRole) => Promise<any>;
};

const AUTH_KEY = "clinifly.auth.v1";
/** Same key as `app/access.tsx` — cleared on logout so quick-access state cannot outlive session. */
const SECURE_QUICK_ACCESS_PATIENT_KEY = "CLINIFLOW_PATIENT_ID";

const EXTRA_AUTH_CLEAR_KEYS = ["clinifly.patient.v1"] as const;

/* ================= CONTEXT ================= */

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function PushNotificationEffects() {
  const ctx = useContext(AuthContext);
  const user = ctx?.user ?? null;
  const isAuthReady = ctx?.isAuthReady ?? false;
  const authSessionEpochRef = ctx?.authSessionEpochRef;

  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    if (!authSessionEpochRef || !isAuthReady || !user?.token) return;
    const role =
      user.type === "doctor" ? "doctor" : user.type === "patient" ? "patient" : null;
    if (!role) return;

    const ac = new AbortController();
    const token = user.token;
    const epochAtStart = authSessionEpochRef.current;
    void registerExpoPushForSession({
      role,
      authToken: token,
      signal: ac.signal,
      authSessionEpochAtStart: epochAtStart,
      authSessionEpochRef,
    });

    return () => {
      ac.abort();
    };
  }, [isAuthReady, user?.token, user?.type, authSessionEpochRef]);

  useEffect(() => {
    if (!authSessionEpochRef || !isAuthReady || !user?.token) return;
    const t = String(user.type || "").toLowerCase();
    if (t !== "patient" && t !== "doctor") return;

    const unsub = installForegroundChatNotificationEffects(() => {
      const u = userRef.current;
      if (!u?.token) return null;
      const role = String(u.type || "").toLowerCase();
      if (role === "patient") {
        return { type: "patient", patientId: u.patientId || u.id };
      }
      if (role === "doctor") {
        return { type: "doctor", doctorId: u.doctorId || u.id };
      }
      return null;
    });
    return unsub;
  }, [isAuthReady, user?.token, user?.type, user?.id, user?.patientId, user?.doctorId, authSessionEpochRef]);

  return null;
}

/* ================= HELPERS ================= */

function pickToken(input: any): string | null {
  if (!input) return null;
  return (
    input.token ??
    input.accessToken ??
    input.access_token ??
    input.jwt ??
    input?.session?.token ??
    input?.data?.token ??
    null
  );
}

function pickId(input: any): string {
  const raw =
    input?.id ??
    input?.userId ??
    input?.patientId ??
    input?.doctorId ??
    input?.clinicId ??
    input?.user?.id ??
    input?.data?.id ??
    null;
  const id = typeof raw === "string" ? raw.trim() : raw != null ? String(raw) : "";
  if (!id) throw new Error("signIn failed: id missing");
  return id;
}

function pickRole(input: any): UserRole {
  const rawRole = input?.role ?? input?.user?.role ?? input?.data?.role;
  // 🔥 NORMALIZE ROLE TO UPPERCASE WITH TYPE GUARD
  if (!rawRole) {
    throw new Error("signIn blocked: role missing from backend");
  }
  const normalizedRole = (rawRole as string).toUpperCase();
  // 🔥 VALIDATE ROLE IS ONE OF ALLOWED VALUES
  if (normalizedRole !== "PATIENT" && normalizedRole !== "DOCTOR" && normalizedRole !== "ADMIN") {
    throw new Error(`signIn blocked: invalid role "${normalizedRole}"`);
  }
  return normalizedRole as UserRole;
}

function pickName(input: any): string | undefined {
  return input?.name ?? input?.user?.name ?? input?.data?.name;
}

function pickEmail(input: any): string | undefined {
  return input?.email ?? input?.user?.email ?? input?.data?.email;
}

function pickPhone(input: any): string | undefined {
  return input?.phone ?? input?.user?.phone ?? input?.data?.phone;
}

function pickClinicId(input: any): string | undefined {
  return input?.clinicId ?? input?.user?.clinicId ?? input?.data?.clinicId;
}

function pickClinicCode(input: any): string | undefined {
  return input?.clinicCode ?? input?.user?.clinicCode ?? input?.data?.clinicCode;
}

function pickStatus(input: any): string | undefined {
  return input?.status ?? input?.user?.status ?? input?.data?.status;
}

// ✅ Web'de AsyncStorage yerine localStorage (verifying takılmasını keser)
async function storageGet(key: string): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    }
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function storageSet(key: string, val: string | null): Promise<void> {
  try {
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return;
      if (val === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, val);
      return;
    }
    if (val === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, val);
  } catch {
    // ignore
  }
}

/** Decode the payload of a JWT without verifying signature (client-side only). */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/** Client-side JWT `exp` check (server still authorizes). `skewMs` avoids edge clock skew. */
function isCliniflyJwtLikelyExpired(token: string, skewMs = 120_000): boolean {
  const p = decodeJwtPayload(token);
  const exp = p && typeof p.exp === "number" ? p.exp : null;
  if (exp == null) return false;
  return exp * 1000 < Date.now() + skewMs;
}

function safeParseUser(raw: string | null): User | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as User;
    if (!parsed?.token) return null;

    // For patients: if clinicId is missing from the stored object,
    // try to recover it from the JWT payload (handles sessions created before the fix).
    if (parsed.type === "patient" && !parsed.clinicId) {
      const payload = decodeJwtPayload(parsed.token);
      if (payload?.clinicId) {
        parsed.clinicId = String(payload.clinicId);
      }
      if (payload?.clinicCode && !parsed.clinicCode) {
        parsed.clinicCode = String(payload.clinicCode);
      }
    }

    return parsed;
  } catch {
    return null;
  }
}

/* ================= PROVIDER ================= */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authSessionEpochRef = useRef(0);
  const refreshAuthPromiseRef = useRef<Promise<void> | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isOtpVerified, setIsOtpVerified] = useState(false); // 🔥 CRITICAL: OTP verification flag
  const [isInitialized, setIsInitialized] = useState(false); // 🔥 CRITICAL: Initialization state

  // Stable callback for setIsOtpVerified
  const handleSetOtpVerified = useCallback((verified: boolean) => {
    setIsOtpVerified(verified);
  }, []);

  const refreshAuth = useCallback(async () => {
    if (!refreshAuthPromiseRef.current) {
      refreshAuthPromiseRef.current = (async () => {
        console.log('[AuthProvider] refreshAuth called');
        setIsAuthLoading(true);

        try {
          let raw: string | null = null;
          try {
            raw = await storageGet(AUTH_KEY);
          } catch {
            emitAuthTelemetryV1("session_restore_fail", { reason: "storage_read" });
            raw = null;
          }
          console.log('[AUTH] Raw storage data:', raw ? 'exists' : 'missing');
          let parsed = safeParseUser(raw);

          if (raw && !parsed) {
            emitAuthTelemetryV1("session_restore_cleared_invalid", { reason: "corrupt_json" });
            await storageSet(AUTH_KEY, null);
            setUser(null);
            setAuthToken(null);
            console.log('[AUTH] Cleared corrupt auth storage');
          } else if (parsed?.token && isCliniflyJwtLikelyExpired(parsed.token)) {
            emitAuthTelemetryV1("session_restore_cleared_expired", { userType: parsed.type });
            await storageSet(AUTH_KEY, null);
            setUser(null);
            setAuthToken(null);
            parsed = null;
            console.log('[AUTH] Cleared expired JWT from storage');
          } else if (parsed) {
            setUser(parsed);
            console.log('[AUTH] Setting token for user:', parsed.id, 'Token:', parsed.token ? 'exists' : 'missing');
            setAuthToken(parsed.token); // 🔥 CRITICAL: Sync token with API layer
            console.log('[AUTH] Token set to API layer');
            emitAuthTelemetryV1("session_restore_ok", { userType: parsed.type });
            if (parsed.type === "patient") {
              try {
                const supa = getSupabaseAuthClient();
                if (supa) {
                  const { error } = await supa.auth.getSession();
                  if (error)
                    emitAuthTelemetryV1("supabase_session_error", {
                      message: String(error.message || error).slice(0, 160),
                    });
                }
              } catch (e) {
                emitAuthTelemetryV1("supabase_session_error", {
                  message: String(e instanceof Error ? e.message : e).slice(0, 160),
                });
              }
            }
          }

          if (!parsed) {
            await storageSet(AUTH_KEY, null);
            setUser(null);
            setAuthToken(null); // 🔥 CRITICAL: Clear token from API layer
            console.log('[AUTH] No user found, token cleared');
          }

          console.log('[AuthProvider] Auth data loaded:', parsed ? 'User found' : 'No user');
        } catch (error) {
          console.error("[AUTH] Error loading auth:", error);
          await storageSet(AUTH_KEY, null);
          setUser(null);
          setAuthToken(null); // 🔥 CRITICAL: Clear token from API layer
        } finally {
          setIsAuthLoading(false);
          setIsInitialized(true); // 🔥 CRITICAL: Mark as initialized
          console.log('[AuthProvider] refreshAuth complete');
          refreshAuthPromiseRef.current = null;
        }
      })();
    }
    await refreshAuthPromiseRef.current;
  }, []);

  const signIn = useCallback(async (input: any) => {
    //  EKSTRA: Doctor signIn security log
    if (input.type === "doctor") {
      console.log("[AUTH] Doctor signIn without OTP allowed");
    }

    // 🔥 HARD GUARDS - NON-NEGOTIABLE
    
    // A) Type validation - MUST be one of: patient | doctor | admin
    if (!input?.type) {
      throw new Error("signIn blocked: user type missing");
    }
    
    if (!["patient", "doctor", "admin"].includes(input.type)) {
      throw new Error(`signIn blocked: invalid type "${input.type}". Must be: patient | doctor | admin`);
    }

    // B) ID validation based on type
    if (input.type === "doctor" && !input.doctorId) {
      throw new Error("signIn blocked: doctorId missing for doctor type");
    }

    if (input.type === "patient" && !input.patientId) {
      throw new Error("signIn blocked: patientId missing for patient type");
    }

    if (input.type === "admin" && !input.clinicId) {
      throw new Error("signIn blocked: clinicId missing for admin type");
    }

    // C) Token validation
    const token = pickToken(input);
    if (!token) throw new Error("signIn failed: token missing");

    // D) ID extraction
    const id = pickId(input);
    if (user?.id === id && user?.token === token) return;

    // E) 🔥 CRITICAL: Type comes from input ONLY - NO INFERENCE
    const type = input.type;

    // F) Role validation - MUST come from backend
    const role = pickRole(input);

    // G) Build user object with STRICT type-based fields
    const next: User = {
      id,
      token,
      type, // 🔥 PRIMARY routing key - NO FALLBACKS
      role, // 🔥 MUST come from backend
      name: pickName(input),
      email: pickEmail(input),
      phone: pickPhone(input),
      // 🔥 TYPE-SPECIFIC FIELDS - NO CROSS-CONTAMINATION
      patientId: type === "patient" ? input.patientId : undefined,
      doctorId: type === "doctor" ? input.doctorId : undefined,
      // clinicId is valid for doctors, admins, AND patients who have joined a clinic
      clinicId: input.clinicId || undefined,
      clinicCode: (type === "admin" || type === "patient") ? (input.clinicCode || undefined) : undefined,
      status: type === "doctor" ? input.status : undefined,
      profilePhotoUrl: input.profilePhotoUrl,
      diplomaFileUrl: input.diplomaFileUrl,
      department: input.department,
      specialties: input.specialties,
      title: input.title,
      experienceYears: input.experienceYears,
      languages: input.languages,
    };
    
    // 🔒 EKSTRA GÜVENLİK: Clear patient storage when signing in as doctor
    if (type === "doctor") {
      try {
        await AsyncStorage.removeItem("clinifly.patient.v1");
      } catch (error) {
        console.warn("[AUTH] Failed to clear patient storage:", error);
      }
    }
    
    authSessionEpochRef.current += 1;
    setUser(next);
    await storageSet(AUTH_KEY, JSON.stringify(next));
    setAuthToken(token); // 🔥 CRITICAL: Sync token with API layer
    console.log('[AUTH] User signed in:', type, 'ID:', id);
  }, [user]);

  const signOut = useCallback(async (opts?: { replaceTo?: string }) => {
    authSessionEpochRef.current += 1;
    try {
      await getSupabaseAuthClient()?.auth.signOut();
    } catch {
      /* ignore */
    }
    clearClinic();
    setUser(null);
    setAuthToken(null);
    setIsOtpVerified(false);
    await storageSet(AUTH_KEY, null);
    try {
      await AsyncStorage.multiRemove([...EXTRA_AUTH_CLEAR_KEYS]).catch(() => {});
    } catch {
      /* ignore */
    }
    try {
      await SecureStore.deleteItemAsync(SECURE_QUICK_ACCESS_PATIENT_KEY);
    } catch {
      /* not set or unsupported */
    }
    try {
      await resetAppIconBadgeCount();
    } catch {
      /* expo-notifications may be unavailable */
    }
    console.log("[AUTH] User signed out");

    const dest = opts?.replaceTo?.trim() || "/";

    /* Defer navigation to the next frame so push/socket effects can clean up without racing native calls. */
    requestAnimationFrame(() => {
      try {
        /* dismissAll triggers POP_TO_TOP on a single-route stack → dev warnings / loops */
        if (typeof router.canDismiss === "function" && router.canDismiss()) {
          router.dismissAll?.();
        }
      } catch (e) {
        console.warn("[AUTH] dismissAll:", e);
      }
      try {
        router.replace(dest as any);
      } catch (e) {
        console.warn("[AUTH] Post-signOut navigation:", e);
      }
    });
  }, []);

  const patchUser = useCallback(async (patch: Partial<User>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      storageSet(AUTH_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  useEffect(() => {
    console.log('[AuthProvider] Starting auth initialization...');
    void (async () => {
      try {
        await refreshAuth();
      } catch (error) {
        console.error('[AuthProvider] Auth initialization error:', error);
        setIsAuthLoading(false);
        console.log('[AuthProvider] Auth initialization failed but loading false');
      }
    })();
  }, [refreshAuth]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      authSessionEpochRef,
      isAuthLoading,
      isAuthReady: !isAuthLoading, // 🔥 FIX: Ready when loading is false, regardless of user
      isAuthed: !!user?.token,
      // 🔥 CLEAN SEPARATION: Type-based logic - PRIMARY routing key
      isDoctor: user?.type === "doctor",
      isPatient: user?.type === "patient",
      isAdmin: user?.type === "admin",
      isOtpVerified, // 🔥 CRITICAL: OTP verification flag
      isInitialized, // 🔥 CRITICAL: Initialization state
      signIn,
      signOut,
      refreshAuth,
      patchUser,
      setOtpVerified: handleSetOtpVerified,
      updateRole: async (newRole: UserRole) => {
        if (!user?.token) {
          throw new Error("No token found");
        }

        try {
          const response = await fetch(`${API_BASE}/api/patient/role`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${user.token}`,
              Accept: "application/json",
            },
            body: JSON.stringify({ newRole }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Failed to update role");
          }

          const data = await response.json();
          
          // Update user object with new role and token
          const updatedUser = {
            ...user,
            role: newRole,
            token: data.token,
          };

          setUser(updatedUser);
          await storageSet(AUTH_KEY, JSON.stringify(updatedUser));
          console.log('[AUTH] Role updated:', newRole);
        } catch (error) {
          console.error('[AUTH] Failed to update role:', error);
        }
      },
    }),
    [user, isAuthLoading, isOtpVerified, isInitialized, signIn, signOut, refreshAuth, patchUser, handleSetOtpVerified]
  );

  return (
    <AuthContext.Provider value={value}>
      <SplashBootstrap />
      <PushNotificationEffects />
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** @returns true if logout/login happened since `epochSnapshot`. */
export function isAuthSessionStale(epochSnapshot: number, epochRef: MutableRefObject<number>): boolean {
  return epochRef.current !== epochSnapshot;
}
