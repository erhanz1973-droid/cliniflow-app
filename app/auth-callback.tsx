import { useEffect } from "react";
import { View } from "react-native";
import * as WebBrowser from "expo-web-browser";

/**
 * Return URL for `signInWithOAuth` (`createOAuthRedirectTo()`).
 * `openAuthSessionAsync` usually resolves before this screen mounts; completes pending auth session handoff.
 * `signInWithGoogle` also calls `maybeCompleteAuthSession` before `setSession` / `exchangeCodeForSession`.
 */
export default function AuthCallbackScreen() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);
  return <View style={{ flex: 1, backgroundColor: "#f8faff" }} />;
}
