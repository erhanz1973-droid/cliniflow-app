import { StyleSheet, Text, View } from "react-native";

import {
  coordinationResponderChipLabel,
  coordinationResponderChipTone,
  type CoordinationResponder,
} from "@/lib/coordinationResponderLabel";

type Props = {
  responder?: CoordinationResponder | null;
  t: (key: string) => string;
  compact?: boolean;
};

export function CoordinationResponderChip({ responder, t, compact }: Props) {
  const tone = coordinationResponderChipTone(responder);
  const label = coordinationResponderChipLabel(responder, t);
  if (!tone || !label) return null;

  return (
    <View
      style={[
        styles.chip,
        compact && styles.chipCompact,
        tone === "ai" && styles.chipAi,
        tone === "doctor" && styles.chipDoctor,
        tone === "escalated" && styles.chipEscalated,
      ]}
      accessibilityRole="text"
    >
      <Text
        style={[
          styles.chipTxt,
          compact && styles.chipTxtCompact,
          tone === "ai" && styles.chipTxtAi,
          tone === "doctor" && styles.chipTxtDoctor,
          tone === "escalated" && styles.chipTxtEscalated,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    marginTop: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipCompact: {
    marginTop: 0,
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipAi: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
  },
  chipDoctor: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
  },
  chipEscalated: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  chipTxt: {
    fontSize: 11,
    fontWeight: "700",
  },
  chipTxtCompact: {
    fontSize: 10,
  },
  chipTxtAi: {
    color: "#1d4ed8",
  },
  chipTxtDoctor: {
    color: "#c2410c",
  },
  chipTxtEscalated: {
    color: "#b91c1c",
  },
});
