// Reusable SearchBar Component - Production Ready UI
// Clean, minimal design with clear functionality

import React from "react";
import { View, TextInput, TouchableOpacity, Text, StyleSheet } from "react-native";
import { SearchBarProps } from "../../types/doctor";

export const SearchBar: React.FC<SearchBarProps> = ({ 
  value, 
  onChangeText, 
  placeholder = "Search...", 
  onClear 
}) => {
  const hasValue = value.trim().length > 0;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholderTextColor="#9ca3af"
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode={onClear ? "never" : "while-editing"}
      />
      {hasValue && onClear && (
        <TouchableOpacity style={styles.clearButton} onPress={onClear}>
          <Text style={styles.clearText}>✕</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
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
