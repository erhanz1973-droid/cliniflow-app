import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type SecondaryCardProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  onPress?: () => void;
  /** No press feedback / interaction */
  disabled?: boolean;
  accentColor?: string;
};

export function SecondaryCard({
  title,
  subtitle,
  icon = "search",
  onPress,
  disabled = false,
  accentColor = "#2563EB",
}: SecondaryCardProps) {
  const dimmed = disabled || !onPress;
  return (
    <Pressable
      onPress={dimmed ? undefined : onPress}
      disabled={dimmed}
      style={({ pressed }) => [
        styles.wrap,
        { borderColor: dimmed ? "#E5E7EB" : "#E5E7EB" },
        !dimmed && pressed && styles.pressed,
        dimmed && styles.disabledWrap,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: dimmed }}
    >
      <View style={[styles.iconCircle, { backgroundColor: `${accentColor}14` }]}>
        <Ionicons name={icon} size={22} color={dimmed ? "#9CA3AF" : accentColor} />
      </View>
      <Text style={[styles.title, dimmed && styles.titleDimmed]} numberOfLines={2}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.subtitle, dimmed && styles.subtitleDimmed]} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  disabledWrap: {
    backgroundColor: "#F9FAFB",
  },
  pressed: { opacity: 0.92 },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    lineHeight: 18,
  },
  titleDimmed: {
    color: "#6B7280",
  },
  subtitle: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 15,
  },
  subtitleDimmed: {
    color: "#9CA3AF",
  },
});
