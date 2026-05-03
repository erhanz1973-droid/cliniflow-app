// components/ToothGrid.tsx
import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Jaw, TreatmentPlan, getTooth } from "./treatments.types";
import { getTeethForJaw, splitTwoRows } from "@/lib/teeth";

type Props = {
  jaw: Jaw;
  plan: TreatmentPlan;
  selectedToothId?: string | null;
  onSelectTooth: (toothId: string) => void;
};

function statusBadgeColor(statuses: string[]) {
  // Basit öncelik: IN_PROGRESS yok; statuses ProcedureStatus
  // DONE varsa yeşil, FOLLOW_UP turuncu, PLANNED mavi, CANCELLED gri
  if (statuses.includes("FOLLOW_UP")) return "#f59e0b";
  if (statuses.includes("PLANNED")) return "#2563eb";
  if (statuses.includes("DONE")) return "#16a34a";
  if (statuses.includes("CANCELLED")) return "#6b7280";
  return "#111827";
}

function ToothGridBase({ jaw, plan, selectedToothId, onSelectTooth }: Props) {
  const teeth = getTeethForJaw(jaw);
  const { row1, row2 } = splitTwoRows(teeth);

  const renderTooth = (toothId: string) => {
    const tooth = getTooth(plan, jaw, toothId);
    const hasProcedures = !!tooth && tooth.procedures.length > 0;
    const statuses = hasProcedures ? tooth!.procedures.map((p) => p.status) : [];
    const badge = hasProcedures ? statusBadgeColor(statuses) : "#d1d5db";
    const isSelected = selectedToothId === toothId;

    return (
      <Pressable
        key={toothId}
        onPress={() => onSelectTooth(toothId)}
        style={[
          styles.tooth,
          isSelected && styles.toothSelected,
          hasProcedures && styles.toothHasProc,
        ]}
      >
        <View style={[styles.dot, { backgroundColor: badge }]} />
        <Text style={styles.toothText}>{toothId}</Text>
        {hasProcedures ? (
          <Text style={styles.countText}>{tooth!.procedures.length}</Text>
        ) : (
          <Text style={styles.countTextMuted}>0</Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>{row1.map(renderTooth)}</View>
      <View style={styles.row}>{row2.map(renderTooth)}</View>
    </View>
  );
}

export const ToothGrid = memo(ToothGridBase);

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  row: { flexDirection: "row", gap: 10, justifyContent: "space-between" },
  tooth: {
    flex: 1,
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  toothSelected: {
    borderColor: "#111827",
    backgroundColor: "#f9fafb",
  },
  toothHasProc: {
    borderColor: "#cbd5e1",
  },
  dot: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  toothText: { fontSize: 14, fontWeight: "700", color: "#111827" },
  countText: { marginTop: 2, fontSize: 11, color: "#111827", fontWeight: "600" },
  countTextMuted: { marginTop: 2, fontSize: 11, color: "#9ca3af", fontWeight: "600" },
});
