import React, { useEffect } from "react";
import { View, Text, ActivityIndicator } from "react-native";
import { Tabs, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/language-context";

function TabLayout() {
  const { currentLanguage, t, isLoading } = useLanguage();
  const router = useRouter();

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

  // Don't render until language is loaded
  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <Tabs
      key={currentLanguage} // Force re-render when language changes
      screenOptions={{
        headerShown: true,
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
      {/* index.tsx is the root route and doesn't need explicit definition in Tabs */}
      {/* 1. Home */}
      <Tabs.Screen
        name="home"
        options={{
          title: t("nav.home"),
          headerTitle: t("nav.home"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "home" : "home-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      {/* 2. Chat */}
      <Tabs.Screen
        name="chat"
        options={{
          title: t("nav.chat"),
          headerTitle: t("nav.chat"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "chatbubble" : "chatbubble-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      {/* 3. Health */}
      <Tabs.Screen
        name="health"
        options={{
          title: t("nav.health"),
          headerTitle: t("nav.health"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "heart" : "heart-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      {/* 4. Travel */}
      <Tabs.Screen
        name="travel"
        options={{
          title: t("nav.travel"),
          headerTitle: t("nav.travel"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "airplane" : "airplane-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      {/* 5. Treatments */}
      <Tabs.Screen
        name="treatments"
        options={{
          title: t("nav.treatments"),
          headerTitle: t("nav.treatments"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "medical" : "medical-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
      {/* 6. Referrals */}
      <Tabs.Screen
        name="referrals"
        options={{
          title: t("nav.referrals"),
          headerTitle: t("nav.referrals"),
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? "people" : "people-outline"}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}

export default TabLayout;
