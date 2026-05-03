// Reusable StatCard Component - Production Ready UI
// Clean, minimal design with soft shadows and rounded corners

import React from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { StatCardProps } from "../../types/doctor";

export const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  subtitle, 
  loading = false, 
  error 
}) => {
  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="small" color="#2563eb" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, styles.errorContainer]}>
        <Text style={styles.errorText}>—</Text>
        <Text style={styles.title}>{title}</Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.title}>{title}</Text>
      {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
    minHeight: 80,
    justifyContent: "center",
  },
  loadingContainer: {
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    opacity: 0.6,
  },
  value: {
    fontSize: 28,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6b7280",
    marginBottom: 2,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: "400",
    color: "#9ca3af",
  },
  errorText: {
    fontSize: 28,
    fontWeight: "700",
    color: "#ef4444",
    marginBottom: 4,
  },
});
