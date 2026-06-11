import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/language-context";
import type { SmileScoreData } from "../../lib/smileScore";
import { SmileShareCardPreview } from "./SmileShareCardPreview";
import { shareSmileScoreOnFacebook } from "../../lib/shareSmileScoreFacebook";
import { captureSmileShareCardImage } from "../../lib/captureSmileShareCard";
import { trackMetaSmileScoreShare } from "../../lib/metaAppEvents";
import { isExpoGoRuntime } from "../../lib/isExpoGo";
import {
  claimSmileFacebookShareReward,
  fetchSmileShareRewardStatus,
  type SmileShareRewardStatus,
} from "../../lib/smileShareRewardApi";

type Props = {
  visible: boolean;
  data: SmileScoreData;
  onClose: () => void;
};

export function SmileShareSheet({ visible, data, onClose }: Props) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [sharing, setSharing] = useState(false);
  const [reward, setReward] = useState<SmileShareRewardStatus | null>(null);
  const [loadingReward, setLoadingReward] = useState(false);
  const cardRef = useRef<View>(null);

  const refreshReward = useCallback(async () => {
    setLoadingReward(true);
    try {
      setReward(await fetchSmileShareRewardStatus());
    } finally {
      setLoadingReward(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void refreshReward();
  }, [visible, refreshReward]);

  const inExpoGo = isExpoGoRuntime();

  const onShareFacebook = async () => {
    setSharing(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 80));
      const imageUri = await captureSmileShareCardImage(cardRef);
      const result = await shareSmileScoreOnFacebook(data, { imageUri });
      if (!result.ok) {
        if (result.error === "facebook_not_available") {
          Alert.alert(t("common.error"), t("smileShare.facebookUnavailable"));
        } else if (!result.cancelled) {
          Alert.alert(t("common.error"), result.error || t("common.sharingFailed"));
        }
        return;
      }

      trackMetaSmileScoreShare(result.channel === "facebook" ? "facebook" : "system");

      if (result.channel === "facebook" && reward?.canClaimReward) {
        const claim = await claimSmileFacebookShareReward();
        if (claim.ok && !claim.alreadyClaimed) {
          Alert.alert(t("smileShare.rewardTitle"), t("smileShare.rewardBody"));
          await refreshReward();
        } else if (!claim.ok && claim.error !== "already_claimed") {
          Alert.alert(t("common.info"), claim.message || t("common.pleaseRetry"));
        }
      }
      onClose();
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("smileShare.previewTitle")}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color="#64748b" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View ref={cardRef} collapsable={false}>
              <SmileShareCardPreview data={data} />
            </View>
            <Text style={styles.positiveNote}>{t("smileShare.positiveNote")}</Text>

            {inExpoGo ? (
              <Text style={styles.expoGoNote}>{t("smileShare.expoGoNote")}</Text>
            ) : null}

            {loadingReward ? (
              <ActivityIndicator color="#059669" style={{ marginTop: 8 }} />
            ) : !inExpoGo && reward?.canClaimReward ? (
              <View style={styles.rewardBanner}>
                <Text style={styles.rewardBannerText}>{t("smileShare.rewardTeaser")}</Text>
              </View>
            ) : !inExpoGo && reward?.rewardClaimed ? (
              <Text style={styles.rewardClaimed}>{t("smileShare.rewardAlreadyClaimed")}</Text>
            ) : null}

            <TouchableOpacity
              style={[styles.fbBtn, sharing && styles.btnDisabled]}
              onPress={() => void onShareFacebook()}
              disabled={sharing}
              activeOpacity={0.88}
            >
              {sharing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={inExpoGo ? "share-outline" : "logo-facebook"}
                    size={22}
                    color="#fff"
                  />
                  <Text style={styles.fbBtnText}>
                    {inExpoGo ? t("smileShare.shareSystem") : t("smileShare.shareFacebook")}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.cancelText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#0f172a" },
  content: { paddingHorizontal: 20, paddingBottom: 12, gap: 14 },
  positiveNote: {
    fontSize: 13,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 19,
  },
  expoGoNote: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 17,
    fontStyle: "italic",
  },
  rewardBanner: {
    backgroundColor: "#fef3c7",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  rewardBannerText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400e",
    textAlign: "center",
    lineHeight: 20,
  },
  rewardClaimed: {
    fontSize: 12,
    color: "#94a3b8",
    textAlign: "center",
  },
  fbBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#1877F2",
    borderRadius: 12,
    paddingVertical: 14,
  },
  fbBtnText: { color: "#fff", fontSize: 16, fontWeight: "800" },
  btnDisabled: { opacity: 0.7 },
  cancelBtn: { alignItems: "center", paddingVertical: 10 },
  cancelText: { fontSize: 14, fontWeight: "600", color: "#64748b" },
});
