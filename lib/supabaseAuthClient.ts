/**
 * Minimal Supabase client for Auth (Google / Apple OAuth only).
 * Uses EXPO_PUBLIC_SUPABASE_* — never service_role.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let singleton: SupabaseClient | null = null;

export function isSupabaseAuthConfigured(): boolean {
  const u = (typeof process !== "undefined" && process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()) || "";
  const k = (typeof process !== "undefined" && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim()) || "";
  return !!(u && k);
}

/** Returns null when URL/anon key missing (buttons should hide or show configure message). */
export function getSupabaseAuthClient(): SupabaseClient | null {
  if (!isSupabaseAuthConfigured()) return null;
  if (!singleton) {
    const url = process.env.EXPO_PUBLIC_SUPABASE_URL!.trim();
    const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!.trim();
    singleton = createClient(url, anon, {
      auth: {
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return singleton;
}
