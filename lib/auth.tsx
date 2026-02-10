// lib/auth.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./api";

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

const AUTH_KEY = "cliniflow.auth.v1";

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

  const refreshAuth = async () => {
    console.log('[AuthProvider] refreshAuth called');
    setIsAuthLoading(true);
    console.log('[AuthProvider] refreshAuth started, isAuthLoading:', true);

    try {
      // 🔥 CRITICAL: BLOCK AUTO RESTORE DURING OTP
      // OTP screen must be a NO-AUTH ZONE
      if (typeof window !== "undefined" && window.location.pathname === "/otp") {
        console.log('[AuthProvider] 🔥 OTP ROUTE DETECTED - BLOCKING auth restore');
        setUser(null);
        await storageSet(AUTH_KEY, null);
        setIsAuthLoading(false);
        setIsAuthReady(true);
        console.log('[AuthProvider] 🔥 OTP ROUTE - Auth blocked, isAuthLoading:', false, 'isAuthReady:', true);
        return;
      }

      const raw = await storageGet(AUTH_KEY);
      const parsed = safeParseUser(raw);
      
      // 🔥 FIX: Only set user if data is valid and different
      if (parsed && JSON.stringify(parsed) !== JSON.stringify(user)) {
        setUser(parsed);
      }
      
      if (!parsed) {
        await storageSet(AUTH_KEY, null);
      }
      
      console.log('[AuthProvider] Auth data loaded:', parsed ? 'User found' : 'No user', 'Raw data:', raw, 'Parsed:', parsed);
    } catch (error) {
      console.error("[AUTH] Error loading auth:", error);
      // On error, clear any corrupted data
      await storageSet(AUTH_KEY, null);
      setUser(null);
    } finally {
      // 🔥 FIX: Always set loading to false and ready to true
      setIsAuthLoading(false);
      setIsAuthReady(true);
      console.log('[AuthProvider] refreshAuth complete, isAuthLoading:', false, 'isAuthReady:', true);
    }
  };

  const signIn = async (input: any) => {
    // 🔥 CRITICAL: FAIL FAST GUARDS
    // Block signIn() if on OTP route
    if (typeof window !== "undefined" && window.location.pathname === "/otp") {
      throw new Error("signIn blocked: Cannot sign in on OTP route");
    }

    // 🔥 CRITICAL: OTP VERIFICATION CHECK - ONLY FOR PATIENTS
    // signIn() MUST THROW if patient and isOtpVerified === false
    if (input.type === "patient" && !isOtpVerified) {
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
        await AsyncStorage.removeItem("cliniflow.patient.v1");
      } catch (error) {
        console.warn("[AUTH] Failed to clear patient storage:", error);
      }
    }
    
    setUser(next);
    await storageSet(AUTH_KEY, JSON.stringify(next));
    console.log('[AUTH] User signed in:', type, 'ID:', id);
  };

  const signOut = async () => {
    setUser(null);
    await storageSet(AUTH_KEY, null);
    console.log('[AUTH] User signed out');
  };

  const setIsAuthReady = (ready: boolean) => {
    console.log('[AUTH] Auth ready set to:', ready);
  };

  useEffect(() => {
    console.log('[AuthProvider] Starting auth initialization...');
    (async () => {
      try {
        await refreshAuth();
      } catch (error) {
        console.error('[AuthProvider] Auth initialization error:', error);
        // Ensure isAuthReady becomes true even on error
        setIsAuthLoading(false);
        console.log('[AuthProvider] Auth initialization failed but ready, isAuthLoading:', false, 'isAuthReady:', true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAuthLoading]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthLoading,
      isAuthReady: !isAuthLoading && !!user, // 🔥 FIX: Only ready when loading is false AND user exists
      isAuthed: !!user?.token,
      // 🔥 CLEAN SEPARATION: Type-based logic - PRIMARY routing key
      isDoctor: user?.type === "doctor",
      isPatient: user?.type === "patient",
      isAdmin: user?.type === "admin",
      isOtpVerified, // 🔥 CRITICAL: OTP verification flag
      signIn,
      signOut,
      refreshAuth,
      setOtpVerified: setIsOtpVerified, // 🔥 CRITICAL: Set OTP verification flag
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, isAuthLoading, isOtpVerified]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export { AuthProvider, useAuth };
