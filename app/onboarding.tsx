/**
 * Legacy shim — redirects to the canonical role-select screen.
 * Kept so any stored "/onboarding" links still work.
 */
import { Redirect } from "expo-router";

// Re-export for any old imports that used ROLE_STORAGE_KEY
export { ROLE_KEY as ROLE_STORAGE_KEY } from "./(auth)/role-select";

export default function OnboardingRedirect() {
  return <Redirect href="/role-select" />;
}
