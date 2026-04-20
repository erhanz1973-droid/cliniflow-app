import React from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type PrimaryCardProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  onPress: () => void;
  accentColor?: string;
  disabled?: boolean;
  loading?: boolean;
};

export function PrimaryCard({
  title,
  subtitle,
  icon = "camera",
  onPress,
  accentColor = "#2563EB",
  disabled = false,
  loading = false,
}: PrimaryCardProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.wrap,
        { borderColor: accentColor, backgroundColor: "#FFFFFF" },
        inactive && styles.inactive,
        !inactive && pressed && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
    >
      <View style={[styles.iconCircle, { backgroundColor: `${accentColor}18` }]}>
        {loading ? (
          <ActivityIndicator color={accentColor} size="small" />
        ) : (
          <Ionicons name={icon} size={28} color={accentColor} />
        )}
      </View>
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: "#111827" }]}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={22} color={inactive ? "#D1D5DB" : "#9CA3AF"} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 2,
    paddingVertical: 18,
    paddingHorizontal: 16,
    gap: 14,
    width: "100%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  pressed: { opacity: 0.92 },
  inactive: { opacity: 0.65 },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: "800" },
  subtitle: { marginTop: 4, fontSize: 14, color: "#6B7280", lineHeight: 20 },
});
