import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Image, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { normalizeExternalUrl } from "../../lib/normalizeExternalUrl";

type Props = {
  logoUrl?: string | null;
  name?: string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

export function ClinicLogo({ logoUrl, name, size = 56, style }: Props) {
  const [failed, setFailed] = useState(false);
  const uri = useMemo(() => normalizeExternalUrl(logoUrl), [logoUrl]);
  const letter = (name || "C").charAt(0).toUpperCase();

  useEffect(() => {
    setFailed(false);
  }, [uri]);

  const boxStyle = useMemo(
    () => ({
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.21),
    }),
    [size],
  );

  if (!uri || failed) {
    return (
      <View style={[styles.placeholder, boxStyle, style]}>
        <Text style={[styles.letter, { fontSize: Math.round(size * 0.39) }]}>{letter}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.frame, boxStyle, style]}>
      <Image
        source={{ uri }}
        style={styles.image}
        resizeMode="contain"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  placeholder: {
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  letter: {
    fontWeight: "800",
    color: "#1D4ED8",
  },
});
