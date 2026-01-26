// lib/auth.tsx
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

/* ================= TYPES ================= */

type User = {
  id: string;
  email?: string;
  token: string;
};

type AuthContextValue = {
  user: User | null;
  isAuthLoading: boolean;
  isAuthReady: boolean;
  isAuthed: boolean;
  signIn: (input: any) => Promise<void>;
  signOut: () => Promise<void>;
  refreshAuth: () => Promise<void>;
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

function pickEmail(input: any): string | undefined {
  return input?.email ?? input?.user?.email ?? input?.data?.email;
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

    try {
      const raw = await storageGet(AUTH_KEY);
      const parsed = safeParseUser(raw);
      setUser(parsed);
      if (!parsed) {
        await storageSet(AUTH_KEY, null);
      }
    } catch (error) {
      console.error("[AUTH] Error loading auth:", error);
      // On error, clear any corrupted data
      await storageSet(AUTH_KEY, null);
      setUser(null);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const signIn = async (input: any) => {
    const token = pickToken(input);
    if (!token) throw new Error("signIn failed: token missing");

    const id = pickId(input);
    if (user?.id === id && user?.token === token) return;

    const next: User = { id, email: pickEmail(input), token };
    setUser(next);
    await storageSet(AUTH_KEY, JSON.stringify(next));
  };

  const signOut = async () => {
    setUser(null);
    await storageSet(AUTH_KEY, null);
  };

  useEffect(() => {
    refreshAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthLoading,
      isAuthReady: !isAuthLoading,
      isAuthed: !!user?.token,
      signIn,
      signOut,
      refreshAuth,
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
