/**
 * Guards for layout-level redirects so we don't stack router.replace("/")
 * across nested navigators during logout (maximum update depth storms).
 */
export function isAtPublicEntryPath(pathname: string | null | undefined): boolean {
  const p = pathname ?? "";
  if (p === "" || p === "/" || p === "/index") return true;
  if (p.startsWith("/login")) return true;
  if (p.startsWith("/role-select")) return true;
  if (p.startsWith("/otp")) return true;
  if (p.startsWith("/access")) return true;
  if (p.startsWith("/splash")) return true;
  return false;
}
