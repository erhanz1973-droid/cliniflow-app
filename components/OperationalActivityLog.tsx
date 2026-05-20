import { StyleSheet, Text, View } from "react-native";

import type { OperationalEvent } from "@/lib/coordinationWorkspaceTypes";

type Props = {
  events: OperationalEvent[];
};

export function OperationalActivityLog({ events }: Props) {
  if (!events.length) return null;

  const recent = [...events].reverse().slice(0, 12);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Operasyonel olaylar</Text>
      {recent.map((ev) => (
        <View key={ev.id} style={styles.row}>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.label}>{ev.label || ev.eventType}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fafafa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    marginBottom: 16,
  },
  title: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    color: "#9ca3af",
    marginBottom: 8,
  },
  row: { flexDirection: "row", gap: 6, marginBottom: 4 },
  dot: { color: "#9ca3af", fontSize: 12 },
  label: { flex: 1, fontSize: 12, color: "#4b5563", lineHeight: 17 },
});
