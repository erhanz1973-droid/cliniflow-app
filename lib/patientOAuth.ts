/**
 * Patient OAuth: Supabase Auth (Google / Apple) → Clinifly JWT via POST /api/patient/auth/oauth.
 */
import { type Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { API_BASE } from "./api";
import { emitAuthTelemetryV1 } from "./authTelemetry";
import { getSupabaseAuthClient } from "./supabaseAuthClient";

WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = "google" | "apple";

function parseImplicitTokensFromUrl(url: string): { access_token?: string; refresh_token?: string } {
  try {
    const u = new URL(url);
    const h = (u.hash || "").replace(/^#/, "");
    if (h) {
      const sp = new URLSearchParams(h);
      const access_token = sp.get("access_token") || undefined;
      const refresh_token = sp.get("refresh_token") || undefined;
      if (access_token) return { access_token, refresh_token };
    }
    const access = u.searchParams.get("access_token");
    if (access)
      return {
        access_token: access,
        refresh_token: u.searchParams.get("refresh_token") || undefined,
      };
  } catch {
    /* ignore */
  }
  return {};
}

function randomNonce32(): string {
  const c = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 32; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

export async function signInWithGoogle(): Promise<{ session: Session | null; error: Error | null }> {
  const supabase = getSupabaseAuthClient();
  if (!supabase) return { session: null, error: new Error("oauth_not_configured") };

  const redirectTo = Linking.createURL("auth-callback");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return { session: null, error: error || new Error("oauth_no_url") };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    preferEphemeralSession: true,
  });

  if (result.type !== "success" || !("url" in result) || !result.url) {
    const code = result.type === "cancel" ? "oauth_cancelled" : "oauth_failed";
    return { session: null, error: new Error(code) };
  }

  const { data: exchanged, error: exErr } = await supabase.auth.exchangeCodeForSession(result.url);
  if (!exErr && exchanged?.session) return { session: exchanged.session, error: null };

  const implicit = parseImplicitTokensFromUrl(result.url);
  if (implicit.access_token) {
    const { data: setData, error: setErr } = await supabase.auth.setSession({
      access_token: implicit.access_token,
      refresh_token: implicit.refresh_token || "",
    });
    if (!setErr && setData?.session) return { session: setData.session, error: null };
    return { session: null, error: setErr || exErr || new Error("oauth_exchange_failed") };
  }

  return { session: null, error: exErr || new Error("oauth_exchange_failed") };
}

export async function signInWithApple(): Promise<{ session: Session | null; error: Error | null }> {
  if (Platform.OS !== "ios") return { session: null, error: new Error("apple_ios_only") };

  const supabase = getSupabaseAuthClient();
  if (!supabase) return { session: null, error: new Error("oauth_not_configured") };

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) return { session: null, error: new Error("apple_unavailable") };

  const rawNonce = randomNonce32();
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: rawNonce,
    });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === "ERR_REQUEST_CANCELED" || err?.code === "ERR_CANCELED") {
      return { session: null, error: new Error("oauth_cancelled") };
    }
    if (String(err?.code || "").includes("NOT_HANDLED") || String(err?.message || "").includes("credential")) {
      return { session: null, error: new Error("apple_credential_invalid") };
    }
    return { session: null, error: e instanceof Error ? e : new Error(String(err?.message || "apple_sign_in_failed")) };
  }

  const idToken = credential.identityToken;
  if (!idToken) return { session: null, error: new Error("apple_no_token") };

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: idToken,
    nonce: rawNonce,
  });
  if (error || !data?.session) return { session: null, error: error || new Error("apple_supabase_failed") };
  return { session: data.session, error: null };
}

export type CliniflyOAuthPayload = Record<string, unknown>;

export async function exchangeCliniflyJwtFromOAuthSession(opts: {
  accessToken: string;
  provider: OAuthProvider;
  clinicCode?: string;
}): Promise<
  { ok: true; payload: CliniflyOAuthPayload } | { ok: false; status: number; code: string; message: string }
> {
  const doFetch = async (accessToken: string) => {
    const res = await fetch(`${API_BASE}/api/patient/auth/oauth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        provider: opts.provider,
        supabaseAccessToken: accessToken,
        clinicCode: opts.clinicCode?.trim() || undefined,
      }),
    });
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      json = {};
    }
    return { res, json };
  };

  let access = String(opts.accessToken || "").trim();
  let { res, json } = await doFetch(access);

  if ((!res.ok || json?.ok === false) && String(json?.error || "") === "invalid_oauth_token") {
    const supa = getSupabaseAuthClient();
    if (supa) {
      const { data, error } = await supa.auth.refreshSession();
      const next = data?.session?.access_token;
      if (!error && next) {
        emitAuthTelemetryV1("oauth_bridge_refresh_retry", { provider: opts.provider });
        access = String(next).trim();
        ({ res, json } = await doFetch(access));
      }
    }
  }

  if (!res.ok || json?.ok === false) {
    const code = String(json?.error || "unknown");
    const message = String(json?.message || json?.error || "Request failed");
    return { ok: false, status: res.status || 500, code, message };
  }
  if (!json?.token) return { ok: false, status: 500, code: "no_token", message: "Invalid server response" };
  return { ok: true, payload: json };
}
