import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export type SecondaryCardProps = {
  title: string;
  icon?: IconName;
  onPress: () => void;
  accentColor?: string;
};

export function SecondaryCard({
  title,
  icon = "search",
  onPress,
  accentColor = "#2563EB",
}: SecondaryCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        { borderColor: "#E5E7EB" },
        pressed && styles.pressed,
      ]}
      accessibilityRole="button"
    >
      <View style={[styles.iconCircle, { backgroundColor: `${accentColor}14` }]}>
        <Ionicons name={icon} size={22} color={accentColor} />
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
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
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
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
});
