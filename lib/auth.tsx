// lib/auth.tsx
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE, setAuthToken } from "./api";

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
  clinicId?: string; // For doctors and admins
  clinicCode?: string; // For admins
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
  isAuthLoading: boolean;
  isAuthReady: boolean;
  isAuthed: boolean;
  isDoctor: boolean;
  isPatient: boolean;
  isAdmin: boolean;
  isOtpVerified: boolean; // 🔥 CRITICAL: OTP verification flag
  signIn: (input: any) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
  setOtpVerified: (verified: boolean) => void; // 🔥 CRITICAL: Set OTP verification flag
  updateRole: (newRole: UserRole) => Promise<any>;
};

const AUTH_KEY = "clinifly.auth.v1";

/* ================= CONTEXT ================= */

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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
  const raw = input?.id ?? input?.userId ?? input?.user?.id ?? input?.data?.id ?? null;
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

function safeParseUser(raw: string | null): User | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as User;
    if (!parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

/* ================= PROVIDER ================= */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isOtpVerified, setIsOtpVerified] = useState(false); // 🔥 CRITICAL: OTP verification flag

  // Stable callback for setIsOtpVerified
  const handleSetOtpVerified = useCallback((verified: boolean) => {
    setIsOtpVerified(verified);
  }, []);

  const refreshAuth = async () => {
    console.log('[AuthProvider] refreshAuth called');
    setIsAuthLoading(true);

    try {
      const raw = await storageGet(AUTH_KEY);
      console.log('[AUTH] Raw storage data:', raw ? 'exists' : 'missing');
      const parsed = safeParseUser(raw);
      console.log('[AUTH] Parsed user data:', parsed ? { id: parsed.id, hasToken: !!parsed.token } : 'null');
      
      if (parsed && JSON.stringify(parsed) !== JSON.stringify(user)) {
        setUser(parsed);
        console.log('[AUTH] Setting token for user:', parsed.id, 'Token:', parsed.token ? 'exists' : 'missing');
        setAuthToken(parsed.token); // 🔥 CRITICAL: Sync token with API layer
        console.log('[AUTH] Token set to API layer');
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
      console.log('[AuthProvider] refreshAuth complete');
    }
  };

  const signIn = async (input: any) => {
    // 🔥 CRITICAL: FAIL FAST GUARDS

    // 🔥 CRITICAL: OTP VERIFICATION CHECK - ONLY FOR PATIENTS
    // signIn() MUST THROW if patient and isOtpVerified === false
    if (input.type === "patient" && !input.otpVerified) {
      throw new Error("signIn blocked: OTP not verified for patient");
    }

    // 🔒 EKSTRA: Doctor signIn security log
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
      clinicId: (type === "doctor" || type === "admin") ? input.clinicId : undefined,
      clinicCode: type === "admin" ? input.clinicCode : undefined,
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
    
    setUser(next);
    await storageSet(AUTH_KEY, JSON.stringify(next));
    setAuthToken(token); // 🔥 CRITICAL: Sync token with API layer
    console.log('[AUTH] User signed in:', type, 'ID:', id);
  };

  const signOut = async () => {
    setUser(null);
    setAuthToken(null); // 🔥 CRITICAL: Clear token from API layer
    await storageSet(AUTH_KEY, null);
    console.log('[AUTH] User signed out');
  };

  useEffect(() => {
    console.log('[AuthProvider] Starting auth initialization...');
    (async () => {
      try {
        await refreshAuth();
      } catch (error) {
        console.error('[AuthProvider] Auth initialization error:', error);
        // Ensure loading is false even on error
        setIsAuthLoading(false);
        console.log('[AuthProvider] Auth initialization failed but loading false');
      }
    })();
  }, []); // Empty dependency array - run once on mount only

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthLoading,
      isAuthReady: !isAuthLoading, // 🔥 FIX: Ready when loading is false, regardless of user
      isAuthed: !!user?.token,
      // 🔥 CLEAN SEPARATION: Type-based logic - PRIMARY routing key
      isDoctor: user?.type === "doctor",
      isPatient: user?.type === "patient",
      isAdmin: user?.type === "admin",
      isOtpVerified, // 🔥 CRITICAL: OTP verification flag
      signIn,
      signOut,
      refreshAuth,
      setOtpVerified: handleSetOtpVerified, // 🔥 CRITICAL: Use stable callback
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
    [user, isAuthLoading, isOtpVerified, signIn, signOut, refreshAuth, handleSetOtpVerified]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
