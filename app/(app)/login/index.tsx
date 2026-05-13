import { useEffect, useRef } from "react";
import { useRouter } from "expo-router";

// Fallback: root index.tsx handles role-based routing via AsyncStorage.
// This catches any direct /login navigation without a sub-path.
export default function LoginIndex() {
  const router = useRouter();
  const didRedirectRef = useRef(false);

  useEffect(() => {
    if (didRedirectRef.current) return;
    didRedirectRef.current = true;
    router.replace("/");
  }, [router]);

  return null;
}
