/**
 * Patient OAuth: Supabase Auth (Google / Apple) → Clinifly JWT via POST /api/patient/auth/oauth.
 */
import { type Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Platform } from "react-native";
import { API_BASE } from "./api";
import { emitAuthTelemetryV1 } from "./authTelemetry";
import { getSupabaseAuthClient, isSupabaseAuthConfigured } from "./supabaseAuthClient";

WebBrowser.maybeCompleteAuthSession();

export type OAuthProvider = "google" | "apple";

function resolveExpoAuthScheme(): string {
  const s = Constants.expoConfig?.scheme;
  if (typeof s === "string" && s.trim()) return s.trim();
  if (Array.isArray(s) && typeof s[0] === "string" && s[0].trim()) return s[0].trim();
  return "clinifly";
}

/**
 * Redirect URI sent to Supabase `signInWithOAuth` — must match Auth → URL Configuration allow list.
 * Avoid `Linking.createURL` on dev builds: it can inject Metro `localhost` / LAN host into `redirect_uri`.
 * Expo Go: keep `createURL` so `exp://…` (or dev host) can be allow-listed for testing.
 */
export function createOAuthRedirectTo(): string {
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    return Linking.createURL("auth-callback");
  }
  if (Platform.OS === "web") {
    return Linking.createURL("auth-callback");
  }
  const scheme = resolveExpoAuthScheme();
  return `${scheme}://auth-callback`;
}

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

/** Supabase may return `?code=` (code exchange) or `#access_token=` (implicit). */
function getAuthCodeFromCallbackUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const q = u.searchParams.get("code");
    if (q) return q;
    const h = (u.hash || "").replace(/^#/, "");
    if (h) {
      const hp = new URLSearchParams(h);
      return hp.get("code");
    }
  } catch {
    /* ignore */
  }
  return null;
}

function getOAuthProviderErrorFromUrl(url: string): { error: string; description: string } | null {
  try {
    const u = new URL(url);
    const from = (sp: URLSearchParams) => {
      const err = sp.get("error");
      if (!err) return null;
      return { error: err, description: String(sp.get("error_description") || "").slice(0, 400) };
    };
    const q = from(u.searchParams);
    if (q) return q;
    const h = (u.hash || "").replace(/^#/, "");
    if (h) return from(new URLSearchParams(h));
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Supabase-hosted Google OAuth (in-app browser).
 * Dashboard: Authentication → Providers → Google (Web client ID + secret).
 * Google Cloud: Authorized redirect URIs must include `https://<project>.supabase.co/auth/v1/callback`.
 * Supabase: Authentication → URL Configuration → add this app’s redirect, e.g. `clinifly://auth-callback`
 * (from `createOAuthRedirectTo()` — not raw `Linking.createURL`, which can embed Metro localhost).
 */
export async function signInWithGoogle(): Promise<{ session: Session | null; error: Error | null }> {
  const supabase = getSupabaseAuthClient();
  if (!supabase) return { session: null, error: new Error("oauth_not_configured") };

  const redirectTo = createOAuthRedirectTo();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      scopes: "email profile openid",
    },
  });
  if (error || !data?.url) return { session: null, error: error || new Error("oauth_no_url") };

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    preferEphemeralSession: true,
  });

  if (result.type !== "success" || !("url" in result) || !result.url) {
    const code = result.type === "cancel" ? "oauth_cancelled" : "oauth_failed";
    return { session: null, error: new Error(code) };
  }

  const callbackUrl = result.url;

  const provErr = getOAuthProviderErrorFromUrl(callbackUrl);
  if (provErr) {
    const msg = provErr.description || provErr.error || "oauth_provider_error";
    return { session: null, error: new Error(msg) };
  }

  WebBrowser.maybeCompleteAuthSession();

  const implicit = parseImplicitTokensFromUrl(callbackUrl);
  if (implicit.access_token) {
    const { data: setData, error: setErr } = await supabase.auth.setSession({
      access_token: implicit.access_token,
      refresh_token: implicit.refresh_token || "",
    });
    if (!setErr && setData?.session) {
      return { session: setData.session, error: null };
    }
    return { session: null, error: setErr || new Error("oauth_implicit_set_session_failed") };
  }

  const authCode = getAuthCodeFromCallbackUrl(callbackUrl);
  if (authCode) {
    const { data: exchanged, error: exErr } = await supabase.auth.exchangeCodeForSession(callbackUrl);
    if (!exErr && exchanged?.session) {
      return { session: exchanged.session, error: null };
    }
    return { session: null, error: exErr || new Error("oauth_exchange_failed") };
  }

  return { session: null, error: new Error("oauth_callback_unrecognized") };
}

export async function signInWithApple(): Promise<{ session: Session | null; error: Error | null }> {
  if (Platform.OS !== "ios") return { session: null, error: new Error("apple_ios_only") };

  const supabase = getSupabaseAuthClient();
  if (!supabase) return { session: null, error: new Error("oauth_not_configured") };

  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) return { session: null, error: new Error("apple_unavailable") };

  /**
   * Apple: send SHA256(raw) as a string (default digest = lowercase hex, matches Supabase Flutter example).
   * Supabase: send the same `rawNonce` so GoTrue can verify the ID token `nonce` claim.
   * If you still see "Nonces mismatch" with this flow, hosted/self-hosted GoTrue may be comparing
   * hex(SHA256(nonce)) to Apple’s base64url claim — see https://github.com/supabase/auth/issues/2378
   * Self-hosted workaround: GOTRUE_APPLE_SKIP_NONCE_CHECK=true (weakens replay checks; prefer Auth upgrade).
   */
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
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
      } else {
        emitAuthTelemetryV1("oauth_supabase_refresh_fail", {
          provider: opts.provider,
          message: String(error?.message || "no_session_after_refresh").slice(0, 160),
        });
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

/** Supabase OAuth (Google/Apple) + Clinifly JWT bridge — shared by login and register screens. */
export type PatientOAuthBridgeOutcome =
  | { ok: true; payload: CliniflyOAuthPayload }
  | { ok: false; step: "not_configured" }
  | { ok: false; step: "native"; message: string }
  | { ok: false; step: "bridge"; status: number; code: string; message: string };

export async function runPatientOAuthWithBridge(opts: {
  provider: OAuthProvider;
  clinicCode?: string;
}): Promise<PatientOAuthBridgeOutcome> {
  if (!isSupabaseAuthConfigured()) return { ok: false, step: "not_configured" };
  const pair =
    opts.provider === "google" ? await signInWithGoogle() : await signInWithApple();
  const { session, error } = pair;
  if (error) return { ok: false, step: "native", message: error.message };
  const at = session?.access_token?.trim();
  if (!at) return { ok: false, step: "native", message: "no_access_token" };
  const bridge = await exchangeCliniflyJwtFromOAuthSession({
    accessToken: at,
    provider: opts.provider,
    clinicCode: opts.clinicCode?.trim() || undefined,
  });
  if (bridge.ok === false) {
    return {
      ok: false,
      step: "bridge",
      status: bridge.status,
      code: bridge.code,
      message: bridge.message,
    };
  }
  return { ok: true, payload: bridge.payload };
}
