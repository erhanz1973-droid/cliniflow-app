import React, { useEffect, useRef } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Tabs, usePathname, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useLanguage } from "../../../lib/language-context";
import { useAuth } from "../../../lib/auth";
import { isAtPublicEntryPath } from "../../../lib/route-guards";

function TabLayout() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const { user, isAuthReady, isAuthLoading } = useAuth();
  const router = useRouter();
  const didRedirectRef = useRef(false);
  const prevIsValidRef = useRef(false);
  const isValid = !!user?.token;

  useEffect(() => {
    const handleUrl = (url?: string | null) => {
      if (!url) return;

      try {
        // Örnek URL'ler:
        // cliniflow://travel?patientId=p2
        // http://localhost:8081/travel?patientId=p2
        const u = new URL(url);

        const patientId =
          u.searchParams.get("patientId") || u.searchParams.get("pid");

        if (!patientId) return;

        // Hangi sayfaya yönlendirileceğini belirle
        const pathname = u.pathname.replace("/", "") || "travel";

        console.log("[DEEP LINK] Navigating to:", pathname, "with patientId:", patientId);

        // URL'deki pathname'e göre ilgili sayfaya yönlendir
        router.replace(`/${pathname}?patientId=${patientId}`);
      } catch (error) {
        console.error("[DEEP LINK] URL parse error:", error);
      }
    };

    // App açılınca gelen URL'yi kontrol et
    Linking.getInitialURL()
      .then((url) => handleUrl(url))
      .catch(() => {});

    // App açıkken link geldiyse
    const sub = Linking.addEventListener("url", (event) => {
      handleUrl(event?.url);
    });

    return () => {
      // RN / Expo sürümlerine uyumlu cleanup
      if ((sub as any)?.remove) (sub as any).remove();
    };
  }, [router]);

  useEffect(() => {
    if (isAuthLoading || !isAuthReady) return;

    if (!isValid && !didRedirectRef.current && !isAtPublicEntryPath(pathname)) {
      didRedirectRef.current = true;
      router.replace("/");
    }

    if (isValid && !prevIsValidRef.current) {
      didRedirectRef.current = false;
    }

    prevIsValidRef.current = isValid;
  }, [user, isAuthReady, isAuthLoading, pathname]);

  // Auth only — language hydrates in parallel so we never gate navigation on language (avoids post–sign-out router storms).
  if (isAuthLoading || !isAuthReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text>Loading...</Text>
      </View>
    );
  }

  if (!user?.token) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#6B7280",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: "#E5E7EB",
          height: 72,
          paddingBottom: 12,
          paddingTop: 12,
          marginBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 13,
          fontWeight: "600",
        },
        tabBarIconStyle: {
          marginTop: 4,
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t("nav.home"), headerTitle: t("nav.home"), tabBarIcon: ({ color, size, focused }) => (<Text style={{ color, fontSize: size }}>🏠</Text>) }} />
      <Tabs.Screen name="treatments" options={{ title: t("nav.treatments"), headerTitle: t("nav.treatments"), tabBarIcon: ({ color, size, focused }) => (<Text style={{ color, fontSize: size }}>🩺</Text>) }} />
      <Tabs.Screen name="health" options={{ title: t("nav.health"), headerTitle: t("nav.health"), tabBarIcon: ({ color, size, focused }) => (<Text style={{ color, fontSize: size }}>❤️</Text>) }} />
      <Tabs.Screen name="travel" options={{ title: t("nav.travel"), headerTitle: t("nav.travel"), tabBarIcon: ({ color, size, focused }) => (<Text style={{ color, fontSize: size }}>✈️</Text>) }} />
      <Tabs.Screen name="send-photo" options={{ title: t("nav.send-photo"), headerTitle: t("nav.send-photo"), tabBarIcon: ({ color, size, focused }) => (<Text style={{ color, fontSize: size }}>📷</Text>) }} />
      <Tabs.Screen name="referrals" options={{ title: t("nav.referrals"), headerTitle: t("nav.referrals"), tabBarIcon: ({ color, size, focused }) => (<Text style={{ color, fontSize: size }}>👥</Text>) }} />
      <Tabs.Screen name="calendar" options={{ title: t("nav.calendar"), headerTitle: t("nav.calendar"), tabBarIcon: ({ color, size, focused }) => (<Text style={{ color, fontSize: size }}>📅</Text>) }} />
      <Tabs.Screen name="treatment-plans" options={{ title: t("nav.treatment-plans"), headerTitle: t("nav.treatment-plans"), tabBarIcon: ({ color, size, focused }) => (<Text style={{ color, fontSize: size }}>🩺</Text>) }} />
    </Tabs>
  );
};

export default TabLayout;
