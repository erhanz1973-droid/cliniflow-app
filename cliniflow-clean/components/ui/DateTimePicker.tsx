import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { Picker } from "@react-native-picker/picker";

const TR_MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function range(from: number, to: number): number[] {
  const arr: number[] = [];
  for (let i = from; i <= to; i++) arr.push(i);
  return arr;
}

/* ─── props ─── */
type Mode = "date" | "time" | "datetime";

type Props = {
  value: Date | null;
  onChange: (date: Date) => void;
  onClear?: () => void;
  mode?: Mode;
  /** Label for the outer field (recommended). */
  label?: string;
  /** Shown in the trigger when `value` is null (non-input hint; avoids placeholder prop). */
  emptyPrompt?: string;
  locale?: string;
};

export default function DateTimePicker({
  value,
  onChange,
  onClear,
  mode = "datetime",
  emptyPrompt,
  label,
  locale = "tr-TR",
}: Props) {
  const [open, setOpen] = useState(false);

  const now = new Date();
  const base = value ?? now;

  const [year, setYear]   = useState(base.getFullYear());
  const [month, setMonth] = useState(base.getMonth());
  const [day, setDay]     = useState(base.getDate());
  const [hour, setHour]   = useState(base.getHours());
  const [minute, setMinute] = useState(Math.round(base.getMinutes() / 5) * 5 % 60);

  // Sync internal state when external value changes
  useEffect(() => {
    const d = value ?? new Date();
    setYear(d.getFullYear());
    setMonth(d.getMonth());
    setDay(Math.min(d.getDate(), daysInMonth(d.getFullYear(), d.getMonth())));
    setHour(d.getHours());
    setMinute(Math.round(d.getMinutes() / 5) * 5 % 60);
  }, [value]);

  const maxDay = daysInMonth(year, month);
  const clampedDay = Math.min(day, maxDay);

  const yearRange = range(now.getFullYear() - 1, now.getFullYear() + 3);

  function handleConfirm() {
    const d = new Date(
      mode === "time" ? (value ?? now).getFullYear() : year,
      mode === "time" ? (value ?? now).getMonth()    : month,
      mode === "time" ? (value ?? now).getDate()     : clampedDay,
      mode === "date" ? 0    : hour,
      mode === "date" ? 0    : minute,
      0,
      0,
    );
    onChange(d);
    setOpen(false);
  }

  /* ─── display label ─── */
  function formatDisplay() {
    if (!value) return emptyPrompt ?? (mode === "time" ? "Select time" : "Select date");
    if (mode === "time") {
      return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
    }
    if (mode === "date") {
      return value.toLocaleDateString(locale);
    }
    // datetime
    const datePart = value.toLocaleDateString(locale);
    const h = String(value.getHours()).padStart(2, "0");
    const m = String(value.getMinutes()).padStart(2, "0");
    return `${datePart} ${h}:${m}`;
  }

  const hasValue = !!value;
  const icon = mode === "time" ? "🕐" : "📅";

  return (
    <>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={styles.row}>
        <Pressable style={[styles.trigger, hasValue && styles.triggerActive]} onPress={() => setOpen(true)}>
          <Text style={[styles.triggerText, !hasValue && styles.muted]}>
            {icon} {formatDisplay()}
          </Text>
        </Pressable>
        {hasValue && onClear ? (
          <Pressable style={styles.clearBtn} onPress={onClear}>
            <Text style={styles.clearBtnText}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.sheetHeader}>
            <Pressable onPress={() => setOpen(false)}>
              <Text style={styles.cancelText}>İptal</Text>
            </Pressable>
            <Text style={styles.sheetTitle}>
              {mode === "time" ? "Saat Seç" : mode === "date" ? "Tarih Seç" : "Tarih & Saat"}
            </Text>
            <Pressable onPress={handleConfirm}>
              <Text style={styles.doneText}>Tamam</Text>
            </Pressable>
          </View>

          <View style={styles.pickersRow}>
            {/* DATE PICKERS */}
            {mode !== "time" && (
              <>
                {/* Day */}
                <View style={styles.pickerWrap}>
                  <Text style={styles.pickerLabel}>Gün</Text>
                  <Picker
                    selectedValue={clampedDay}
                    onValueChange={(v) => setDay(Number(v))}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {range(1, maxDay).map((d) => (
                      <Picker.Item key={d} label={String(d)} value={d} />
                    ))}
                  </Picker>
                </View>

                {/* Month */}
                <View style={[styles.pickerWrap, styles.pickerWrapWide]}>
                  <Text style={styles.pickerLabel}>Ay</Text>
                  <Picker
                    selectedValue={month}
                    onValueChange={(v) => setMonth(Number(v))}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {TR_MONTHS.map((name, idx) => (
                      <Picker.Item key={idx} label={name} value={idx} />
                    ))}
                  </Picker>
                </View>

                {/* Year */}
                <View style={styles.pickerWrap}>
                  <Text style={styles.pickerLabel}>Yıl</Text>
                  <Picker
                    selectedValue={year}
                    onValueChange={(v) => setYear(Number(v))}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {yearRange.map((y) => (
                      <Picker.Item key={y} label={String(y)} value={y} />
                    ))}
                  </Picker>
                </View>
              </>
            )}

            {/* TIME PICKERS */}
            {mode !== "date" && (
              <>
                {mode !== "time" && <View style={styles.divider} />}

                {/* Hour */}
                <View style={styles.pickerWrap}>
                  <Text style={styles.pickerLabel}>Saat</Text>
                  <Picker
                    selectedValue={hour}
                    onValueChange={(v) => setHour(Number(v))}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {range(0, 23).map((h) => (
                      <Picker.Item key={h} label={String(h).padStart(2, "0")} value={h} />
                    ))}
                  </Picker>
                </View>

                {/* Minute */}
                <View style={styles.pickerWrap}>
                  <Text style={styles.pickerLabel}>Dakika</Text>
                  <Picker
                    selectedValue={minute}
                    onValueChange={(v) => setMinute(Number(v))}
                    style={styles.picker}
                    itemStyle={styles.pickerItem}
                  >
                    {range(0, 11).map((i) => {
                      const m = i * 5;
                      return <Picker.Item key={m} label={String(m).padStart(2, "0")} value={m} />;
                    })}
                  </Picker>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    marginTop: 8,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trigger: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#fafafa",
    justifyContent: "center",
  },
  triggerActive: {
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  triggerText: {
    fontSize: 14,
    color: "#111827",
  },
  muted: {
    color: "#9ca3af",
  },
  clearBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  clearBtnText: {
    fontSize: 14,
    color: "#6B7280",
    fontWeight: "700",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "ios" ? 32 : 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  cancelText: {
    fontSize: 15,
    color: "#6B7280",
  },
  doneText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#2563EB",
  },
  pickersRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  pickerWrap: {
    flex: 1,
    alignItems: "center",
  },
  pickerWrapWide: {
    flex: 1.5,
  },
  pickerLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 2,
  },
  picker: {
    width: "100%",
  },
  pickerItem: {
    fontSize: 16,
  },
  divider: {
    width: 1,
    backgroundColor: "#E5E7EB",
    alignSelf: "stretch",
    marginVertical: 8,
  },
});
