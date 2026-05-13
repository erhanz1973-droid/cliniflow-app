import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  registerDoctorForegroundBannerHost,
  type DoctorForegroundBannerPayload,
} from "../lib/doctorForegroundBannerController";

/**
 * Bottom snack-style banner for doctor foreground message alerts (not tied to chat screen mount).
 */
export function DoctorForegroundChatBanner() {
  const insets = useSafeAreaInsets();
  const [payload, setPayload] = useState<DoctorForegroundBannerPayload | null>(null);

  useEffect(() => {
    return registerDoctorForegroundBannerHost(setPayload);
  }, []);

  if (!payload) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, 10) + 56 }]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.card}>
        <Text style={styles.title} numberOfLines={1}>
          {payload.title}
        </Text>
        <Text style={styles.body} numberOfLines={3}>
          {payload.body}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    zIndex: 9999,
    elevation: 20,
  },
  card: {
    maxWidth: 420,
    width: "92%",
    backgroundColor: "#1E3A8A",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 6 },
    }),
  },
  title: { color: "#E0E7FF", fontSize: 13, fontWeight: "700", marginBottom: 4 },
  body: { color: "#FFFFFF", fontSize: 13, lineHeight: 18 },
});
