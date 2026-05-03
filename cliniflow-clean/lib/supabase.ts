// Supabase client for Realtime only (auth is still Cliniflow API JWT via fetch).
//
// 1) Add to cliniflow-app/.env (copy from .env.example):
//    EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
//    EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
// 2) Restart Metro: npx expo start -c
//
// Values also flow from app.config.js → expo.extra (fallback if Metro inlines miss).

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

function supabaseEnv(): { url: string; anon: string } {
  const extra = Constants.expoConfig?.extra as
    | { supabaseUrl?: string; supabaseAnonKey?: string }
    | undefined;
  const url =
    (typeof process !== "undefined" && process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()) ||
    String(extra?.supabaseUrl || "").trim();
  const anon =
    (typeof process !== "undefined" && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()) ||
    String(extra?.supabaseAnonKey || "").trim();
  return { url, anon };
}

/** Lazy client — avoids crashing when env is missing during dev. */
let _client: SupabaseClient | null | undefined;

let _loggedEnv: boolean | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (_client !== undefined) return _client;
  const { url, anon } = supabaseEnv();
  if (!url || !anon) {
    _client = null;
    return null;
  }
  if (typeof __DEV__ !== "undefined" && __DEV__ && _loggedEnv !== true) {
    _loggedEnv = true;
    console.log("SUPABASE URL", url.slice(0, 48) + (url.length > 48 ? "…" : ""));
    console.log("SUPABASE anon key set:", Boolean(anon));
  }
  _client = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return _client;
}

export function isSupabaseRealtimeConfigured(): boolean {
  const { url, anon } = supabaseEnv();
  return Boolean(url && anon);
}
