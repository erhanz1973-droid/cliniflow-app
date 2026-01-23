import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 
"react-native";
import type { Procedure } from "../lib/treatments.types";

type Props = {
  visible: boolean;
  onClose: () => void;
  toothId: string | null;
  jaw: "upper" | "lower";
  procedures: Procedure[];
};

function statusLabel(status: Procedure["status"]) {
  switch (status) {
    case "PLANNED":
      return "Planned";
    case "DONE":
      return "Done";
    case "FOLLOW_UP":
      return "Follow-up";
    case "CANCELLED":
      return "Cancelled";
    default:
      return status;
  }
}

export default function TreatmentModal({
  visible,
  onClose,
  toothId,
  jaw,
  procedures,
}: Props) {
  return (
    <Modal visible={visible} animationType="slide" transparent 
onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Tooth {toothId ?? ""}</Text>
            <Text style={styles.subtitle}>{jaw === "upper" ? "Upper" : 
"Lower"}</Text>
          </View>

          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>Close</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {procedures.length === 0 ? (
            <Text style={styles.empty}>No procedures to show.</Text>
          ) : (
            procedures.map((p, idx) => {
              return (
                <View key={`${p.type}-${idx}`} style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.procType}>{p.type}</Text>
                    <Text 
style={styles.status}>{statusLabel(p.status)}</Text>
                  </View>

                  {/* ✅ KURAL: date varsa göster, yoksa hiç görünmesin 
*/}
                  {p.date ? <Text style={styles.meta}>Date: 
{p.date}</Text> : null}

                  {/* ✅ KURAL: note varsa göster */}
                  {p.note ? <Text style={styles.meta}>Note: 
{p.note}</Text> : null}

                  {/* ✅ KURAL: fiyat sadece showPriceToPatient true ise 
göster */}
                  {p.showPriceToPatient && typeof p.price === "number" ? (
                    <Text style={styles.meta}>Price: {p.price}</Text>
                  ) : null}
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "75%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  subtitle: { marginTop: 2, fontSize: 13, fontWeight: "600", color: 
"#6B7280" },
  closeBtn: { paddingVertical: 8, paddingHorizontal: 10 },
  closeTxt: { fontSize: 14, fontWeight: "700", color: "#111827" },
  content: { padding: 14, gap: 12 },
  empty: { color: "#6B7280", fontWeight: "600" },
  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 10 },
  procType: { fontSize: 15, fontWeight: "800", color: "#111827" },
  status: { fontSize: 13, fontWeight: "700", color: "#111827" },
  meta: { fontSize: 13, fontWeight: "600", color: "#374151" },
});
ls -la components
ls -la lib
ls -la app


