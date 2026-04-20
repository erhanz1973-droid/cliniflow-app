import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type ActionCardProps = {
  title: string;
  onPress: () => void;
  leadingIcon?: React.ComponentProps<typeof Ionicons>["name"];
  badgeCount?: number;
};

export function ActionCard({ title, onPress, leadingIcon, badgeCount }: ActionCardProps) {
  const showBadge = typeof badgeCount === "number" && badgeCount > 0;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      {leadingIcon ? (
        <Ionicons name={leadingIcon} size={22} color="#2563EB" style={styles.leadIcon} />
      ) : null}
      <Text style={styles.title}>{title}</Text>
      <View style={styles.right}>
        {showBadge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeCount > 99 ? "99+" : String(badgeCount)}</Text>
          </View>
        ) : null}
        <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  pressed: { opacity: 0.92 },
  leadIcon: { marginRight: 10 },
  title: { flex: 1, fontSize: 15, fontWeight: "600", color: "#111827" },
  right: { flexDirection: "row", alignItems: "center", gap: 8 },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: "#EF4444",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
});
