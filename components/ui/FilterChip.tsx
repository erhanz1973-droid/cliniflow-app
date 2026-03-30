// Reusable FilterChip Component - Production Ready UI
// Clean, minimal design with active states and count badges

import React from "react";
import { TouchableOpacity, Text, StyleSheet } from "react-native";
import { FilterChipProps } from "../../types/doctor";

export const FilterChip: React.FC<FilterChipProps> = ({ 
  label, 
  isActive, 
  count, 
  onPress 
}) => {
  return (
    <TouchableOpacity
      style={[styles.container, isActive && styles.activeContainer]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.label, isActive && styles.activeLabel]}>
        {label}
      </Text>
      {count !== undefined && (
        <Text style={[styles.count, isActive && styles.activeCount]}>
          {count}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
    minHeight: 36,
  },
  activeContainer: {
    backgroundColor: "#2563eb",
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
  },
  activeLabel: {
    color: "#ffffff",
  },
  count: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    backgroundColor: "#e5e7eb",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    textAlign: "center",
    lineHeight: 16,
  },
  activeCount: {
    backgroundColor: "#ffffff",
    color: "#2563eb",
  },
});
