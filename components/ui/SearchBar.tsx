// Reusable SearchBar — visible label above the field (no placeholder).

import React from "react";
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from "react-native";

export type SearchBarProps = {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  onClear?: () => void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
};

export const SearchBar: React.FC<SearchBarProps> = ({
  label,
  value,
  onChangeText,
  onClear,
  autoCapitalize = "none",
  autoCorrect = false,
}) => {
  const hasValue = value.trim().length > 0;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.container}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          clearButtonMode={onClear ? "never" : "while-editing"}
        />
        {hasValue && onClear && (
          <TouchableOpacity style={styles.clearButton} onPress={onClear}>
            <Text style={styles.clearText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  field: {
    gap: 6,
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    color: "#94a3b8",
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
    paddingVertical: 0,
  },
  clearButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#e5e7eb",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  clearText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    lineHeight: 16,
  },
});
