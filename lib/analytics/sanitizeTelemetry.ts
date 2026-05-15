/**
 * Strip high-risk keys and oversized strings before analytics / ops telemetry.
 * Never send message bodies, attachment payloads, tokens, or URLs.
 */
const EXACT_DENY = new Set([
  "token",
  "password",
  "authorization",
  "cookie",
  "text",
  "body",
  "content",
  "attachment",
  "attachments",
  "url",
  "uri",
  "email",
  "phone",
]);

const SUBSTRING_DENY = ["diagnos", "prescription", "medicalrecord", "healthdata"];

const MAX_STRING_LEN = 200;

export function sanitizeTelemetryPayload(input: Record<string, unknown> | undefined | null): Record<string, unknown> {
  if (!input || typeof input !== "object") return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    const kl = k.toLowerCase();
    if (EXACT_DENY.has(kl)) continue;
    if (SUBSTRING_DENY.some((s) => kl.includes(s))) continue;
    if (v === null || typeof v === "boolean") {
      out[k] = v;
      continue;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      out[k] = v;
      continue;
    }
    if (typeof v === "string") {
      out[k] = v.length > MAX_STRING_LEN ? `${v.slice(0, MAX_STRING_LEN)}…` : v;
      continue;
    }
    /* Omit nested objects / arrays */
  }
  return out;
}
