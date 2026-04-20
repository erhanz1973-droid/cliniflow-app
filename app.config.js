/**
 * Expo config — loads `.env` so EXPO_PUBLIC_* is available when this file runs,
 * and copies Supabase vars into `extra` (fallback for Metro + EAS Build).
 *
 * Copy `.env.example` → `.env` and set EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
 * from Supabase Dashboard → Project Settings → API.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("dotenv").config();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const appJson = require("./app.json");

const supabaseUrl = String(process.env.EXPO_PUBLIC_SUPABASE_URL || "").trim();
const supabaseAnonKey = String(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "").trim();

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra || {}),
      supabaseUrl,
      supabaseAnonKey,
    },
  },
};
