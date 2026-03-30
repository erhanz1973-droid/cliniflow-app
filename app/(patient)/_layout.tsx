import { Tabs } from "expo-router";
import { Text } from "react-native";
import { useLanguage } from "../../lib/language-context";

export default function PatientTabsLayout() {
  const { t } = useLanguage();

  return (
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
        name="messages"
        options={{
          title: t("nav.messages"),
          tabBarIcon: ({ color, size }) => (
            <Text style={{ color, fontSize: size - 2 }}>💬</Text>
          ),
        }}
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
  );
}
