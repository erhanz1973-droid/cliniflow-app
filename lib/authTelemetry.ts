/**
 * Client auth/OAuth telemetry — same logical events as backend AUTH_TELEMETRY_V1 for log correlation.
 * Single JSON line per event (Metro / device logs). Optional ingest via EXPO_PUBLIC_TELEMETRY_URL later.
 */

export type AuthTelemetryEvent =
  | "oauth_login_success"
  | "oauth_login_cancel"
  | "oauth_login_fail"
  | "oauth_bridge_refresh_retry"
  | "oauth_supabase_refresh_fail"
  | "oauth_bridge_fail"
  | "oauth_merge_conflict"
  | "oauth_patient_profile_missing"
  | "oauth_provider_mismatch"
  | "session_restore_ok"
  | "session_restore_fail"
  | "session_restore_cleared_expired"
  | "session_restore_cleared_invalid"
  | "session_restore_offline_skip"
  | "supabase_session_error";

export function emitAuthTelemetryV1(
  event: AuthTelemetryEvent,
  fields: Record<string, string | number | boolean | null | undefined> = {},
): void {
  const payload = {
    tag: "AUTH_TELEMETRY_V1",
    ts: new Date().toISOString(),
    event,
    ...fields,
  };
  const line = JSON.stringify(payload);
  console.log(line);
}
