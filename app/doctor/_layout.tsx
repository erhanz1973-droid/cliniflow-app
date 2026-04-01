// app/doctor/_layout.tsx — Stack layout (no nested tabs)
import { Stack } from 'expo-router';

export default function DoctorLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="patients" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="profile-info" />
      <Stack.Screen name="diagnosis" />
      <Stack.Screen name="pending" />
      <Stack.Screen name="dashboard" />
    </Stack>
  );
}
