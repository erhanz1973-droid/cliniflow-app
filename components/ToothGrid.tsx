import React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from 
"react-native";

type Props = {
  teeth: string[];
  selectedToothId?: string | null;
  onPressTooth: (toothId: string) => void;
  hasProcedures?: (toothId: string) => boolean;
};

export default function ToothGrid({
  teeth,
  selectedToothId,
  onPressTooth,
  hasProcedures,
}: Props) {
  return (
    <FlatList
      data={teeth}
      keyExtractor={(t) => t}
      numColumns={4}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => {
        const selected = item === selectedToothId;
        const flagged = hasProcedures ? hasProcedures(item) : false;

        return (
          <Pressable
            onPress={() => onPressTooth(item)}
            style={[styles.tooth, selected && styles.toothSelected]}
          >
            <Text style={[styles.toothText, selected && 
styles.toothTextSelected]}>
              {item}
            </Text>

            {flagged ? <View style={styles.dot} /> : null}
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 12, gap: 12 },
  tooth: {
    flex: 1,
    margin: 6,
    aspectRatio: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  toothSelected: { borderColor: "#111827" },
  toothText: { fontSize: 16, fontWeight: "600", color: "#111827" },
  toothTextSelected: { color: "#111827" },
  dot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: "#111827",
  },
});

