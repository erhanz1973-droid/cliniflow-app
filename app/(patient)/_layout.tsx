import { Stack } from "expo-router";

export default function PatientGroupLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="encounter/[encounterId]" options={{ headerShown: false }} />
      <Stack.Screen name="medical-form" options={{ headerShown: false }} />
    </Stack>
  );
}
