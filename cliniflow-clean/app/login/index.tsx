import { Redirect } from "expo-router";

// Fallback: root index.tsx handles role-based routing via AsyncStorage.
// This catches any direct /login navigation without a sub-path.
export default function LoginIndex() {
  return <Redirect href="/" />;
}
