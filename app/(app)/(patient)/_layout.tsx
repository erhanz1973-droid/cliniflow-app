import { Tabs, usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useLanguage } from "../../../lib/language-context";
import { useAuth } from "../../../lib/auth";
import { isAtPublicEntryPath } from "../../../lib/route-guards";

export default function PatientTabsLayout() {
  const pathname = usePathname();
  const router = useRouter();
  const didRedirectRef = useRef(false);
  const prevIsValidRef = useRef(false);
  const { t } = useLanguage();
  const { user, isAuthReady, isAuthLoading, isPatient } = useAuth();
  const isValid = !!user?.token && isPatient;

  useEffect(() => {
    if (!isAuthReady) return;

    if (!isValid && !didRedirectRef.current && !isAtPublicEntryPath(pathname)) {
      didRedirectRef.current = true;
      router.replace("/");
    }

    if (isValid && !prevIsValidRef.current) {
      didRedirectRef.current = false;
    }

    prevIsValidRef.current = isValid;
  }, [user, isPatient, isAuthReady, pathname]);

  if (isAuthLoading || !isAuthReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f8faff" }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!user?.token || !isPatient) {
    return null;
  }

  return (
    <SafeAreaProvider>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: "#E5E7EB",
          paddingBottom: 4,
          height: 56,
          marginBottom: 10,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("nav.home"),
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size - 2 }}>🏠</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="treatment-plan"
        options={{
          title: t("nav.treatment"),
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size - 2 }}>🦷</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: t("nav.journey"),
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size - 2 }}>📅</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="appointments"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="travel"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="medical-form"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="encounter/[encounterId]"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="treatment-guide"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="dental-analysis"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="ai-coordinator"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="smile-ai-chat"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="dental-camera"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="clinic-select-for-offer"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="messages"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="files"
        options={{
          title: t("nav.files"),
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size - 2 }}>📁</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="referrals"
        options={{
          title: t("nav.referrals"),
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size - 2 }}>🎁</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t("nav.profile"),
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size - 2 }}>👤</Text>
          ),
        }}
      />
    </Tabs>
    </SafeAreaProvider>
  );
}
