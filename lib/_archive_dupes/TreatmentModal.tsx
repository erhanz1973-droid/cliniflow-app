// components/TreatmentModal.tsx
import React, { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Jaw, TreatmentPlan, getTooth, Procedure } from "./treatments.types";

type Props = {
  visible: boolean;
  jaw: Jaw;
  toothId: string | null;
  plan: TreatmentPlan;
  onClose: () => void;
};

function labelProcedureType(t: string) {
  return t.replaceAll("_", " ");
}

function statusChipStyle(status: string) {
  switch (status) {
    case "DONE":
      return { bg: "#dcfce7", fg: "#166534", bd: "#bbf7d0" };
    case "FOLLOW_UP":
      return { bg: "#fffbeb", fg: "#92400e", bd: "#fde68a" };
    case "PLANNED":
      return { bg: "#eff6ff", fg: "#1d4ed8", bd: "#bfdbfe" };
    case "CANCELLED":
      return { bg: "#f3f4f6", fg: "#374151", bd: "#e5e7eb" };
    default:
      return { bg: "#f3f4f6", fg: "#111827", bd: "#e5e7eb" };
  }
}

function ProcedureCard({ p }: { p: Procedure }) {
  const chip = statusChipStyle(p.status);

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle}>{labelProcedureType(p.type)}</Text>
        <View style={[styles.chip, { backgroundColor: chip.bg, borderColor: chip.bd }]}>
          <Text style={[styles.chipText, { color: chip.fg }]}>{p.status}</Text>
        </View>
      </View>

      {/* date varsa göster */}
      {p.date ? (
        <Text style={styles.meta}>
          Date: <Text style={styles.metaStrong}>{p.date}</Text>
        </Text>
      ) : null}

      {/* note varsa göster */}
      {p.note ? <Text style={styles.note}>{p.note}</Text> : null}

      {/* fiyat: sadece showPriceToPatient true ise göster */}
      {p.showPriceToPatient && typeof p.price === "number" ? (
        <Text style={styles.price}>Price: {p.price}</Text>
      ) : null}
    </View>
  );
}

export function TreatmentModal({ visible, jaw, toothId, plan, onClose }: Props) {
  const tooth = useMemo(() => {
    if (!toothId) return undefined;
    return getTooth(plan, jaw, toothId);
  }, [plan, jaw, toothId]);

  const procedures = tooth?.procedures ?? [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropPress} onPress={onClose} />

        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>Tooth {toothId ?? "-"}</Text>
              <Text style={styles.sheetSub}>{jaw.toUpperCase()}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            {procedures.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyTitle}>No procedures</Text>
                <Text style={styles.emptySub}>This tooth has no planned/done procedures yet.</Text>
              </View>
            ) : (
              procedures.map((p, idx) => <ProcedureCard key={`${p.type}-${idx}`} p={p} />)
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end" },
  backdropPress: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },

  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
    maxHeight: "78%",
  },
  sheetHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: "#111827" },
  sheetSub: { marginTop: 2, fontSize: 12, color: "#6b7280", fontWeight: "600" },

  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "#111827",
  },
  closeText: { color: "#fff", fontWeight: "700", fontSize: 12 },

  content: { padding: 16, gap: 12 },

  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { fontSize: 14, fontWeight: "800", color: "#111827", flexShrink: 1 },

  chip: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  chipText: { fontSize: 11, fontWeight: "800" },

  meta: { fontSize: 12, color: "#6b7280" },
  metaStrong: { color: "#111827", fontWeight: "700" },

  note: { fontSize: 13, color: "#111827" },

  price: { marginTop: 2, fontSize: 13, fontWeight: "800", color: "#111827" },

  emptyBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    padding: 16,
    backgroundColor: "#f9fafb",
  },
  emptyTitle: { fontSize: 14, fontWeight: "800", color: "#111827" },
  emptySub: { marginTop: 4, fontSize: 12, color: "#6b7280" },
});
