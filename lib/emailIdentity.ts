/** Apple Sign in with "Hide My Email" — not suitable as patient contact / OTP email. */
export function isApplePrivateRelayEmail(email: string | null | undefined): boolean {
  return /@privaterelay\.appleid\.com$/i.test(String(email ?? "").trim());
}
