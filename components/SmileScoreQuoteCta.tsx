import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useLanguage } from "../lib/language-context";
import type { SmileScoreData } from "../lib/smileScore";
import { startSmileQuoteRequest } from "../lib/smileQuoteRequest";

type Props = {
  data: SmileScoreData;
  /** Remote https smile photo URL. */
  photoUrl?: string | null;
  /** Remote https teeth photo URL. */
  teethPhotoUrl?: string | null;
};

export function SmileScoreQuoteCta({ data, photoUrl, teethPhotoUrl }: Props) {
  const { t } = useLanguage();
  const router = useRouter();

  const onGetQuotes = () => {
    const smileUrl = String(photoUrl || "").trim();
    const teethUrl = String(teethPhotoUrl || "").trim();
    if (!/^https?:\/\//i.test(smileUrl)) {
      Alert.alert(t("common.error"), t("smileQuote.photoRequired"));
      return;
    }
    void startSmileQuoteRequest(router, {
      imageUrl: smileUrl,
      teethImageUrl: teethUrl,
      smileData: data,
    });
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.prompt}>{t("smileQuote.conversionPrompt")}</Text>
      <TouchableOpacity style={styles.btn} onPress={onGetQuotes} activeOpacity={0.88}>
        <Text style={styles.btnText}>💰 {t("smileQuote.getQuotes")}</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>{t("smileQuote.conversionHintDual")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fffbeb",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fde68a",
    gap: 10,
    marginTop: 4,
  },
  prompt: {
    fontSize: 15,
    fontWeight: "700",
    color: "#92400e",
    lineHeight: 22,
  },
  btn: {
    backgroundColor: "#d97706",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  hint: {
    fontSize: 11,
    color: "#b45309",
    lineHeight: 16,
    textAlign: "center",
  },
});
