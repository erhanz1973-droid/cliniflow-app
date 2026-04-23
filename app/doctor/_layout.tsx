// app/doctor/_layout.tsx — Stack layout for all doctor screens
import { Stack } from 'expo-router';

export default function DoctorLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="patients" />
      <Stack.Screen name="profile" />
      <Stack.Screen name="diagnosis" />
      <Stack.Screen name="pending" />
      <Stack.Screen name="requests" />
      <Stack.Screen name="tasks" />
      <Stack.Screen name="patient-files" />
      <Stack.Screen name="patient-chat" />
    </Stack>
  );
}
