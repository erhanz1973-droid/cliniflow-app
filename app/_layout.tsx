import React, { useEffect, useState } from "react";
import { Tabs, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { AuthProvider } from "../lib/auth";
import { Ionicons } from "@expo/vector-icons";
import { t, getLanguage, type Language } from "../lib/i18n";

export default function RootLayout() {
  const router = useRouter();
  const [currentLang, setCurrentLang] = useState<Language>(getLanguage());

  // Update language when it changes
  useEffect(() => {
    const interval = setInterval(() => {
      const lang = getLanguage();
      if (lang !== currentLang) {
        setCurrentLang(lang);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [currentLang]);

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

        const path = (u.pathname || "").replace(/^\/+/, ""); // travel, treatments, chat

        if (path === "travel") {
          router.replace(`/travel?patientId=${encodeURIComponent(patientId)}`);
          return;
        }

        if (path === "chat") {
          router.replace(`/chat?patientId=${encodeURIComponent(patientId)}`);
          return;
        }

        if (path === "treatments") {
          router.replace(
            `/treatments?patientId=${encodeURIComponent(patientId)}`
          );
          return;
        }

        // default
        router.replace(
          `/treatments?patientId=${encodeURIComponent(patientId)}`
        );
      } catch {
        // URL parse edilemezse sessiz geç
      }
    };

    // App kapalıyken link ile açıldıysa
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

  return (
    <AuthProvider>
      <Tabs
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
                size={28}
                color={color}
              />
            ),
          }}
        />
        {/* 2. Health */}
        <Tabs.Screen
          name="health"
          options={{
            title: t("nav.health"),
            headerTitle: t("health.title"),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "heart" : "heart-outline"}
                size={28}
                color={color}
              />
            ),
          }}
        />
        {/* 3. Travel */}
        <Tabs.Screen
          name="travel"
          options={{
            title: t("nav.travel"),
            headerTitle: t("travel.title"),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "airplane" : "airplane-outline"}
                size={28}
                color={color}
              />
            ),
          }}
        />
        {/* 5. Chat */}
        <Tabs.Screen
          name="chat"
          options={{
            title: t("nav.chat"),
            headerTitle: t("chat.title"),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "chatbubbles" : "chatbubbles-outline"}
                size={28}
                color={color}
              />
            ),
          }}
        />
        {/* 6. Treatment */}
        <Tabs.Screen
          name="treatments"
          options={{
            title: t("nav.treatment"),
            headerTitle: t("treatment.title"),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "medical" : "medical-outline"}
                size={28}
                color={color}
              />
            ),
          }}
        />
        {/* 7. Referral */}
        <Tabs.Screen
          name="referrals"
          options={{
            title: t("nav.referrals"),
            headerTitle: t("referrals.title"),
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={focused ? "people" : "people-outline"}
                size={28}
                color={color}
              />
            ),
          }}
        />
        {/* Hidden screens */}
        <Tabs.Screen
          name="index"
          options={{
            href: null, // Hide from tab bar (registration/login screen)
          }}
        />
        <Tabs.Screen
          name="waiting-approval"
          options={{
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="access"
          options={{
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="login"
          options={{
            href: null, // Hide from tab bar but keep accessible
          }}
        />
        <Tabs.Screen
          name="onboarding"
          options={{
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="otp"
          options={{
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="patient-search"
          options={{
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="splash"
          options={{
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="timeline"
          options={{
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="xray-upload"
          options={{
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="invite"
          options={{
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="modal"
          options={{
            href: null, // Hide from tab bar
          }}
        />
        <Tabs.Screen
          name="debug-api"
          options={{
            href: null, // Hide from tab bar (debug screen)
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            href: null, // Hide from tab bar (language selection moved to home)
          }}
        />
        <Tabs.Screen
          name="intraoral-camera"
          options={{
            href: null, // Hide from tab bar
          }}
        />
    </Tabs>
    </AuthProvider>
  );
}
