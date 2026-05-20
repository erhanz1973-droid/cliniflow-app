// app/doctor/_layout.tsx — Stack layout for all doctor screens
import { Stack, usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, InteractionManager } from "react-native";
import { useAuthSession } from "../../../lib/auth";
import { isAtPublicEntryPath } from "../../../lib/route-guards";
import { DoctorForegroundMessageWatcher } from "../../../components/DoctorForegroundMessageWatcher";
import { DoctorForegroundChatBanner } from "../../../components/DoctorForegroundChatBanner";
import { markStartupOnce } from "../../../lib/startupPerf";

/** Mount foreground poll after dashboard shell is interactive — avoids cold-start network pile-up. */
function DeferredDoctorForegroundWatcher() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let delayId: ReturnType<typeof setTimeout> | null = null;
    const task = InteractionManager.runAfterInteractions(() => {
      delayId = setTimeout(() => {
        if (!cancelled) setReady(true);
      }, 1_200);
    });
    return () => {
      cancelled = true;
      task.cancel?.();
      if (delayId) clearTimeout(delayId);
    };
  }, []);

  if (!ready) return null;
  return <DoctorForegroundMessageWatcher />;
}

export default function DoctorLayout() {
  const pathname = usePathname();
  const { session, token, isAuthReady, isDoctor } = useAuthSession();
  const router = useRouter();
  const didRedirectRef = useRef(false);
  const prevIsValidRef = useRef(false);
  const isValid = !!token && isDoctor;

  useEffect(() => {
    if (!isAuthReady) return;

    if (!isValid && !didRedirectRef.current && !isAtPublicEntryPath(pathname)) {
      didRedirectRef.current = true;
      router.replace("/");
    }

    if (isValid && !prevIsValidRef.current) {
      didRedirectRef.current = false;
      markStartupOnce("doctor_router_ready");
    }

    prevIsValidRef.current = isValid;
  }, [session, isDoctor, isAuthReady, pathname, isValid, router]);

  /** No session yet — brief gate only when we truly have no token hint. */
  if (!isAuthReady && !token) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8faff" }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (isAuthReady && (!token || !isDoctor)) {
    return null;
  }

  return (
    <>
      <DeferredDoctorForegroundWatcher />
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
        <Stack.Screen name="coordination" />
        <Stack.Screen name="inbox" />
      </Stack>
      <DoctorForegroundChatBanner />
    </>
  );
}
