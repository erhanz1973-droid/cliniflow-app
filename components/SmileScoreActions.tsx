import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useLanguage } from "../lib/language-context";
import type { SmileScoreData } from "../lib/smileScore";
import { goToSmileAiChat, serializeSmileContextForRoute } from "../lib/smileScoreNavigation";
import { SmileShareSheet } from "./smile/SmileShareSheet";

type Props = {
  data: SmileScoreData;
  clinicId?: string;
};

export function SmileScoreActions({ data, clinicId }: Props) {
  const { t } = useLanguage();
  const router = useRouter();
  const [shareOpen, setShareOpen] = useState(false);

  const onAskAi = () => {
    goToSmileAiChat(router, {
      clinicId,
      smileContextJson: serializeSmileContextForRoute(data),
    });
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.primaryBtn} onPress={onAskAi} activeOpacity={0.88}>
        <Text style={styles.primaryText}>{t("smileScore.askAi")}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.secondaryBtn}
        onPress={() => setShareOpen(true)}
        activeOpacity={0.88}
      >
        <Text style={styles.secondaryText}>{t("smileScore.share")}</Text>
      </TouchableOpacity>

      <SmileShareSheet
        visible={shareOpen}
        data={data}
        onClose={() => setShareOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 12 },
  primaryBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  secondaryBtn: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  secondaryText: { color: "#047857", fontSize: 14, fontWeight: "700" },
});
