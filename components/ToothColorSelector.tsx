import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from "react-native";

export const PRESETS = ["natural", "bright", "hollywood", "soft"] as const;

export type ToothColorPreset = (typeof PRESETS)[number];

const LABELS: Record<ToothColorPreset, string> = {
  natural: "Natural",
  bright: "Bright",
  hollywood: "Hollywood",
  soft: "Soft",
};

type Props = {
  selected: ToothColorPreset;
  onChange: (preset: ToothColorPreset) => void;
  containerStyle?: StyleProp<ViewStyle>;
  /** Disables chips (e.g. while initial sim runs). */
  disabled?: boolean;
  /** Shows a small spinner beside the title (preset re-simulation in progress). */
  isLoading?: boolean;
};

/**
 * Gülüş simülasyonu before/after görselinin altına yerleştirin.
 */
export default function ToothColorSelector({
  selected,
  onChange,
  containerStyle,
  disabled = false,
  isLoading = false,
}: Props) {
  const busy = disabled || isLoading;
  return (
    <View style={[styles.section, containerStyle]}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>🎨 Gülüş Tonunu Seç</Text>
        {isLoading ? (
          <ActivityIndicator size="small" color="#4CAF50" style={styles.titleSpinner} />
        ) : null}
      </View>
      <View style={styles.row}>
        {PRESETS.map((preset) => {
          const isSelected = selected === preset;
          return (
            <Pressable
              key={preset}
              disabled={busy}
              onPress={() => onChange(preset)}
              style={({ pressed }) => [
                styles.chip,
                isSelected ? styles.chipSelected : styles.chipUnselected,
                busy && styles.chipDisabled,
                pressed && !busy && styles.chipPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected, disabled: busy }}
              accessibilityLabel={LABELS[preset]}
            >
              <Text
                style={isSelected ? styles.chipTextSelected : styles.chipTextUnselected}
                numberOfLines={1}
              >
                {LABELS[preset]}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: "100%",
    marginTop: 16,
    paddingHorizontal: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1a1a1a",
    ...Platform.select({
      android: { fontFamily: "sans-serif-medium" },
    }),
  },
  titleSpinner: {
    marginLeft: 4,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginHorizontal: -4,
  },
  chip: {
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    minWidth: 72,
    alignItems: "center",
    justifyContent: "center",
    margin: 4,
  },
  chipUnselected: {
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  chipSelected: {
    borderColor: "#4CAF50",
    backgroundColor: "#E8F5E9",
  },
  chipPressed: {
    opacity: 0.85,
  },
  chipDisabled: {
    opacity: 0.55,
  },
  chipTextUnselected: {
    fontSize: 13,
    fontWeight: "500",
    color: "#333",
  },
  chipTextSelected: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2E7D32",
  },
});
