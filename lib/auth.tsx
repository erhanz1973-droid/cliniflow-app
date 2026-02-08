// lib/auth.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "./api";

/* ================= TYPES ================= */

export type UserRole = "PATIENT" | "DOCTOR" | "ADMIN";

type User = {
  id: string;
  email?: string;
  token: string;
  role?: UserRole;
  name?: string;
  clinicId?: string;
  clinicCode?: string;
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
  signIn: (input: any) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
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

function pickRole(input: any): UserRole | undefined {
  const rawRole = input?.role ?? input?.user?.role ?? input?.data?.role;
  // 🔥 NORMALIZE ROLE TO UPPERCASE
  return rawRole ? (rawRole as string).toUpperCase() as UserRole : undefined;
}

function pickName(input: any): string | undefined {
  return input?.name ?? input?.user?.name ?? input?.data?.name;
}

function pickEmail(input: any): string | undefined {
  return input?.email ?? input?.user?.email ?? input?.data?.email;
}

function pickClinicId(input: any): string | undefined {
  return input?.clinicId ?? input?.user?.clinicId ?? input?.data?.clinicId;
}

function pickClinicCode(input: any): string | undefined {
  return input?.clinicCode ?? input?.user?.clinicCode ?? input?.data?.clinicCode;
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

  const refreshAuth = async () => {
    setIsAuthLoading(true);
    console.log('[AuthProvider] refreshAuth started, isAuthLoading:', true);

    try {
      const raw = await storageGet(AUTH_KEY);
      const parsed = safeParseUser(raw);
      setUser(parsed);
      if (!parsed) {
        await storageSet(AUTH_KEY, null);
      }
      console.log('[AuthProvider] Auth data loaded:', parsed ? 'User found' : 'No user');
    } catch (error) {
      console.error("[AUTH] Error loading auth:", error);
      // On error, clear any corrupted data
      await storageSet(AUTH_KEY, null);
      setUser(null);
    } finally {
      setIsAuthLoading(false);
      console.log('[AuthProvider] refreshAuth complete, isAuthLoading:', false, 'isAuthReady:', true);
    }
  };

  const signIn = async (input: any) => {
    const token = pickToken(input);
    if (!token) throw new Error("signIn failed: token missing");

    const id = pickId(input);
    if (user?.id === id && user?.token === token) return;

    // Local role normalization
    const normalizedRole = pickRole(input);

    const next: User = { 
      id, 
      email: pickEmail(input), 
      token,
      role: normalizedRole,
      name: pickName(input),
      clinicId: pickClinicId(input),
      clinicCode: pickClinicCode(input),
    };
    setUser(next);
    await storageSet(AUTH_KEY, JSON.stringify(next));
  };

  const signOut = async () => {
    setUser(null);
    await storageSet(AUTH_KEY, null);
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
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthLoading,
      isAuthReady: !isAuthLoading,
      isAuthed: !!user?.token,
      isDoctor: user?.role === "DOCTOR",
      isPatient: user?.role === "PATIENT", // Explicit check, no default
      isAdmin: user?.role === "ADMIN",
      signIn,
      signOut,
      refreshAuth,
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
          
          return data;
        } catch (error) {
          console.error("[AUTH] Update role error:", error);
          throw error;
        }
      },
    }),
    [user, isAuthLoading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ================= HOOK ================= */

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
