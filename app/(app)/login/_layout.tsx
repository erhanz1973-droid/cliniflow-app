import { useMemo } from "react";
import { Stack } from "expo-router";

export default function LoginLayout() {
  const screenOptions = useMemo(() => ({ headerShown: false }), []);
  return <Stack screenOptions={screenOptions} />;
}
