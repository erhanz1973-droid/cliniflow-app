/**
 * E.164 phone validation — aligned with backend lib/phoneIdentity.cjs.
 * Doctor registration requires an explicit country code (+XX or 00XX).
 */

export function tryParseE164Phone(phoneInput: string): string | null {
  if (phoneInput == null) return null;
  let s = String(phoneInput).trim();
  if (!s) return null;
  s = s.replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  if (!s.startsWith("+")) return null;
  const digits = s.slice(1).replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

export function isValidInternationalPhone(phone: string): boolean {
  return tryParseE164Phone(phone) != null;
}
