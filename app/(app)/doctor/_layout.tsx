// app/doctor/_layout.tsx — Stack layout for all doctor screens
import { Stack, usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../../../lib/auth';
import { isAtPublicEntryPath } from '../../../lib/route-guards';
import { DoctorForegroundMessageWatcher } from '../../../components/DoctorForegroundMessageWatcher';
import { DoctorForegroundChatBanner } from '../../../components/DoctorForegroundChatBanner';

export default function DoctorLayout() {
  const pathname = usePathname();
  const { user, isAuthReady, isDoctor } = useAuth();
  const router = useRouter();
  const didRedirectRef = useRef(false);
  const prevIsValidRef = useRef(false);
  const isValid = !!user?.token && isDoctor;

  useEffect(() => {
    if (!isAuthReady) return;

    if (!isValid && !didRedirectRef.current && !isAtPublicEntryPath(pathname)) {
      didRedirectRef.current = true;
      router.replace('/');
    }

    if (isValid && !prevIsValidRef.current) {
      didRedirectRef.current = false;
    }

    prevIsValidRef.current = isValid;
  }, [user, isDoctor, isAuthReady, pathname]);

  if (!isAuthReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8faff' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!user?.token || !isDoctor) {
    return null;
  }

  return (
    <>
      <DoctorForegroundMessageWatcher />
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
      <Stack.Screen name="inbox" />
    </Stack>
      <DoctorForegroundChatBanner />
    </>
  );
}
