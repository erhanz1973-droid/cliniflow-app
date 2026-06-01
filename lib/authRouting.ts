/** Default home route after cold start when a stored session is still valid. */
export function getAuthenticatedHomeRoute(user: {
  type?: string;
  status?: string;
}): string {
  const type = String(user.type || "").toLowerCase();
  const status = String(user.status || "").toUpperCase();

  if (type === "doctor") {
    if (status === "PENDING") return "/doctor/pending";
    return "/doctor";
  }
  if (type === "patient") {
    if (status === "PENDING") return "/waiting-approval";
    return "/(patient)";
  }
  if (type === "admin") return "/(tabs)/home";
  return "/role-select";
}
