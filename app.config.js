/**
 * `extra.API_URL` for native/build when JS env is empty.
 * Does not rewrite bad URLs — Metro-like values get a console warning only (see api.ts strict check in __DEV__).
 */
const DEFAULT_PUBLIC_API_URL =
  "https://cliniflow-backend-clean-production.up.railway.app";

function warnIfLikelyMetroDevUrl(urlStr, context) {
  const s = String(urlStr || "");
  if (!/^https?:\/\//i.test(s)) return;
  const suspicious =
    s.includes("172.") ||
    s.includes("localhost") ||
    s.includes(":8081") ||
    s.includes(":19000");
  if (suspicious) {
    console.warn(
      `[app.config] ${context}: API URL looks Metro/dev (${s}). Fix EXPO_PUBLIC_API_URL / EXPO_PUBLIC_API_BASE — not auto-correcting.`,
    );
  }
}

export default ({ config }) => {
  const envUrl =
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    process.env.EXPO_PUBLIC_API_BASE?.trim() ||
    "";

  let apiUrl = DEFAULT_PUBLIC_API_URL;
  if (/^https?:\/\//i.test(envUrl)) {
    apiUrl = envUrl.replace(/\/+$/, "");
    warnIfLikelyMetroDevUrl(apiUrl, "EXPO_PUBLIC_*");
  } else if (envUrl) {
    console.warn(
      "[app.config] EXPO_PUBLIC_API_URL / EXPO_PUBLIC_API_BASE is set but not a valid http(s) URL; using default extra.API_URL.",
    );
  }

  return {
    ...config,
    extra: {
      ...config.extra,
      API_URL: apiUrl,
    },
  };
};
