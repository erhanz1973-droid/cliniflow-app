import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
  Linking,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../../../lib/auth";
import { API_BASE } from "../../../lib/api";
import { useLanguage } from "../../../lib/language-context";
import { useDateLocale } from "../../../lib/date-locale";
import {
  buildMilestones,
  personalDiscountPercent,
  nextUnlockHint,
  progressRatio,
  type ReferralLevels,
  type Milestone,
} from "../../../lib/referralRewards";
import {
  fetchClinicReferralSettings,
  formatReferralDiscountText,
} from "../../../lib/clinicReferralSettings";

type ReferralStatus = "PENDING" | "APPROVED" | "REJECTED";

type ReferralItem = {
  id: string;
  inviterPatientName?: string;
  invitedPatientName?: string;
  inviterPatientId?: string;
  invitedPatientId?: string;
  status: ReferralStatus;
  discountPercent?: number;
  inviterDiscountPercent?: number;
  invitedDiscountPercent?: number;
  createdAt: number;
  approvedAt?: number;
};

const ACCENT = "#3b82f6";
const SUCCESS = "#22c55e";
const BG = "#0f172a";
const CARD = "#1e293b";
const MUTED = "#94a3b8";

export default function ReferralsScreen() {
  const { user, isAuthReady } = useAuth();
  const { t } = useLanguage();
  const locale = useDateLocale();
  const userPatientId = (user as any)?.patientId || "";

  const [patientId, setPatientId] = useState<string>(userPatientId);
  const [referrals, setReferrals] = useState<ReferralItem[]>([]);
  const [referralLevels, setReferralLevels] = useState<ReferralLevels>({});
  const [loading, setLoading] = useState(true);
  const [displayPct, setDisplayPct] = useState(0);
  const [clinicDiscountPercent, setClinicDiscountPercent] = useState(0);

  const milestones = buildMilestones(referralLevels);

  const approvedAsInviter = referrals.filter(
    (r) =>
      String(r.inviterPatientId) === String(patientId) &&
      String(r.status || "").toUpperCase() === "APPROVED"
  ).length;

  const currentDiscount = personalDiscountPercent(approvedAsInviter, referralLevels);
  const nextHint = nextUnlockHint(approvedAsInviter, milestones);
  const barRatio = progressRatio(approvedAsInviter, milestones);

  useEffect(() => {
    if (loading) return;
    const target = currentDiscount;
    const duration = 900;
    const t0 = Date.now();
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / duration);
      setDisplayPct(Math.round(target * p));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [currentDiscount, loading]);

  const loadReferrals = useCallback(
    async (silent = false) => {
      if (!user?.token) {
        if (!silent) setLoading(false);
        return;
      }
      try {
        if (!silent) setLoading(true);

        let currentPatientId = userPatientId;
        if (!currentPatientId) {
          const meRes = await fetch(`${API_BASE}/api/patient/me`, {
            headers: { Authorization: `Bearer ${user.token}` },
          });
          if (meRes.ok) {
            const meData = await meRes.json();
            currentPatientId = meData?.patientId || "";
            if (currentPatientId) setPatientId(currentPatientId);
          }
        } else {
          setPatientId(currentPatientId);
        }

        if (!currentPatientId) {
          if (!silent) setLoading(false);
          return;
        }

        let clinicCode = "";
        try {
          const meRes = await fetch(`${API_BASE}/api/patient/me`, {
            headers: { Authorization: `Bearer ${user.token}` },
          });
          if (meRes.ok) {
            const meData = await meRes.json();
            clinicCode = meData?.clinicCode || "";
          }
        } catch {
          /* ignore */
        }

        const clinicUrl = clinicCode
          ? `${API_BASE}/api/clinic?code=${encodeURIComponent(clinicCode)}`
          : `${API_BASE}/api/clinic`;
        const referralsUrl = `${API_BASE}/api/patient/${encodeURIComponent(currentPatientId)}/referrals`;

        const [referralsRes, clinicRes, clinicSettings] = await Promise.all([
          fetch(referralsUrl, {
            headers: { Authorization: `Bearer ${user.token}` },
          }),
          fetch(clinicUrl),
          fetchClinicReferralSettings(user.token),
        ]);
        setClinicDiscountPercent(clinicSettings.percent);

        if (referralsRes.status === 403 || referralsRes.status === 401) {
          setReferrals([]);
        } else if (referralsRes.ok) {
          const referralsJson = await referralsRes.json();
          if (referralsJson.ok && Array.isArray(referralsJson.items)) {
            setReferrals(referralsJson.items);
          } else {
            setReferrals([]);
          }
        } else {
          setReferrals([]);
        }

        if (clinicRes.ok) {
          const clinicData = await clinicRes.json();
          const rl = clinicData.referralLevels || clinicData.settings?.referralLevels || {};
          setReferralLevels({
            level1: rl.level1 ?? null,
            level2: rl.level2 ?? null,
            level3: rl.level3 ?? null,
          });
        }
      } catch (error: any) {
        console.error("[REFERRALS]", error);
        if (!silent) Alert.alert(t("common.error"), t("referrals.loadError"));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [user?.token, userPatientId, t]
  );

  useEffect(() => {
    if (!isAuthReady) return;
    if (!user?.token) {
      setLoading(false);
      return;
    }
    loadReferrals();
  }, [isAuthReady, user?.token, loadReferrals]);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthReady || !user?.token) return;
      loadReferrals(true);
    }, [isAuthReady, user?.token, loadReferrals])
  );

  const shareMessage = useCallback(() => {
    if (!patientId) return "";
    return t("referrals.shareMessage", { patientId });
  }, [patientId, t]);

  const onCopy = async () => {
    if (!patientId) return;
    try {
      await Clipboard.setStringAsync(patientId);
      Alert.alert(t("common.success"), t("referrals.copySuccess"));
    } catch {
      Alert.alert(t("common.error"), t("referrals.copyError"));
    }
  };

  const onShare = async () => {
    if (!patientId) return;
    const message = shareMessage();
    try {
      await Share.share({ message });
    } catch {
      Alert.alert(t("common.error"), t("referrals.shareFailed"));
    }
  };

  const onWhatsApp = async () => {
    const message = shareMessage();
    const url = `whatsapp://send?text=${encodeURIComponent(message)}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (can) await Linking.openURL(url);
      else await Share.share({ message });
    } catch {
      await Share.share({ message });
    }
  };

  const onTelegram = async () => {
    const message = shareMessage();
    const url = `https://t.me/share/url?text=${encodeURIComponent(message)}`;
    try {
      await Linking.openURL(url);
    } catch {
      await Share.share({ message });
    }
  };

  const getReferralRole = (ref: ReferralItem): "inviter" | "invited" => {
    if (ref.inviterPatientId === patientId) return "inviter";
    if (ref.invitedPatientId === patientId) return "invited";
    return "inviter";
  };

  const getReferralDisplayName = (ref: ReferralItem): string => {
    const role = getReferralRole(ref);
    if (role === "inviter") {
      return ref.invitedPatientName || ref.invitedPatientId || t("referrals.invitedPerson") || "—";
    }
    return ref.inviterPatientName || ref.inviterPatientId || t("referrals.inviterPerson") || "—";
  };

  const getDiscountPercent = (ref: ReferralItem): number | null => {
    const role = getReferralRole(ref);
    const fromRef =
      role === "inviter"
        ? ref.inviterDiscountPercent ?? ref.discountPercent ?? null
        : ref.invitedDiscountPercent ?? ref.discountPercent ?? null;
    return fromRef ?? referralLevels.level1 ?? null;
  };

  const statusLabel = (status: ReferralStatus) => {
    const u = String(status || "").toUpperCase();
    if (u === "PENDING") return t("referrals.pending");
    if (u === "APPROVED") return t("referrals.statusJoined");
    return t("referrals.rejected");
  };

  const screenW = Dimensions.get("window").width;
  const milestoneGap = Math.min(16, screenW * 0.02);
  const clinicDiscountText = formatReferralDiscountText(clinicDiscountPercent);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={styles.loadingText}>{t("referrals.loading")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.heroEyebrow}>{t("referrals.heroProgramLabel")}</Text>
          <Text style={styles.heroTag}>{t("referrals.taglineBetterTogether")}</Text>
          <Text style={styles.heroTitle}>{t("referrals.heroTitle")}</Text>
          <Text style={styles.heroSub}>{t("referrals.heroSubtitle")}</Text>
        </View>

        <View style={styles.discountCard}>
          <Text style={styles.discountHuge}>{displayPct}%</Text>
          <Text style={styles.discountCaption}>{t("referrals.currentDiscountLabel")}</Text>
        </View>

        <View style={styles.promoBanner}>
          <Text style={styles.promoBannerText}>
            {t("referrals.promoBanner", { percent: String(clinicDiscountPercent) })}
          </Text>
        </View>

        <View style={styles.discountSplitRow}>
          <View style={styles.discountSplitBox}>
            <Text style={styles.discountSplitLabel}>{t("referrals.yourDiscount")}</Text>
            <Text style={styles.discountSplitValue}>{clinicDiscountText}</Text>
          </View>
          <View style={styles.discountSplitBox}>
            <Text style={styles.discountSplitLabel}>{t("referrals.friendDiscount")}</Text>
            <Text style={styles.discountSplitValue}>{clinicDiscountText}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>{t("referrals.milestoneProgress")}</Text>
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(barRatio * 100)}%` }]} />
          </View>
          <View style={[styles.milestoneRow, { gap: milestoneGap }]}>
            {milestones.map((m: Milestone, idx: number) => {
              const done = approvedAsInviter >= m.friends;
              return (
                <View key={`${m.friends}-${m.percent}`} style={styles.milestoneCol}>
                  <View
                    style={[
                      styles.milestoneDot,
                      done && { backgroundColor: SUCCESS, borderColor: SUCCESS },
                    ]}
                  >
                    <Text style={styles.milestoneDotTxt}>
                      {done ? "✓" : String(idx + 1)}
                    </Text>
                  </View>
                  <Text style={styles.milestonePct}>{m.percent}%</Text>
                  <Text style={styles.milestoneFriends}>
                    {t("referrals.friendMilestone", { n: m.friends })}
                  </Text>
                </View>
              );
            })}
          </View>
          <Text style={styles.nextHint}>
            {nextHint
              ? t("referrals.nextUnlock", {
                  count: nextHint.need,
                  percent: nextHint.percent,
                })
              : t("referrals.maxTier")}
          </Text>
        </View>

        <Pressable
          onPress={onShare}
          style={({ pressed }) => [styles.ctaPrimary, pressed && styles.pressed]}
        >
          <Text style={styles.ctaPrimaryText}>{t("referrals.inviteFriendsCta")}</Text>
        </Pressable>

        <View style={styles.secondaryRow}>
          <Pressable
            onPress={onCopy}
            style={({ pressed }) => [styles.ctaGhost, pressed && styles.pressed]}
          >
            <Text style={styles.ctaGhostText}>{t("referrals.copyCodeCta")}</Text>
          </Pressable>
        </View>

        <View style={styles.socialRow}>
          <Pressable
            onPress={onWhatsApp}
            style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
          >
            <Text style={styles.socialBtnText}>{t("referrals.shareWhatsApp")}</Text>
          </Pressable>
          <Pressable
            onPress={onTelegram}
            style={({ pressed }) => [styles.socialBtn, pressed && styles.pressed]}
          >
            <Text style={styles.socialBtnText}>{t("referrals.shareTelegram")}</Text>
          </Pressable>
        </View>

        <View style={styles.codeRow}>
          <Text style={styles.codeLabel}>{t("referrals.codeRowLabel")}</Text>
          <Text style={styles.codeValue} numberOfLines={1} selectable>
            {patientId || "—"}
          </Text>
          <Pressable onPress={onCopy} hitSlop={8}>
            <Text style={styles.codeCopy}>{t("common.copy")}</Text>
          </Pressable>
        </View>

        <View style={styles.benefits}>
          <BenefitCard
            emoji="👥"
            title={t("referrals.benefit1Title")}
            body={t("referrals.benefit1Body")}
          />
          <BenefitCard
            emoji="🎁"
            title={t("referrals.benefit2Title")}
            body={t("referrals.benefit2Body")}
          />
          <BenefitCard
            emoji="💸"
            title={t("referrals.benefit3Title")}
            body={t("referrals.benefit3Body")}
          />
        </View>

        <Text style={styles.sectionTitle}>{t("referrals.historyTitle")}</Text>
        {referrals.length === 0 ? (
          <Text style={styles.empty}>{t("referrals.noReferrals")}</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {referrals.map((r) => {
              const name = getReferralDisplayName(r);
              const initial = (name || "?").trim().charAt(0).toUpperCase();
              const d = getDiscountPercent(r);
              const st = String(r.status || "").toUpperCase() as ReferralStatus;
              return (
                <View key={r.id} style={styles.historyRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarTxt}>{initial}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.historyName} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.historyMeta}>
                      {new Date(r.createdAt).toLocaleDateString(locale)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    <View
                      style={[
                        styles.statusMini,
                        st === "APPROVED" && { backgroundColor: `${SUCCESS}22` },
                        st === "PENDING" && { backgroundColor: "#f59e0b22" },
                        st === "REJECTED" && { backgroundColor: "#ef444422" },
                      ]}
                    >
                      <Text style={styles.statusMiniTxt}>{statusLabel(st)}</Text>
                    </View>
                    {st === "APPROVED" && d != null ? (
                      <Text style={styles.rewardTxt}>
                        +{d}% {t("referrals.rewardLabel")}
                      </Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.footnote}>
          {t("referrals.clinicDiscountRate", { percent: String(clinicDiscountPercent) })}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function BenefitCard({
  emoji,
  title,
  body,
}: {
  emoji: string;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.benefitCard}>
      <Text style={styles.benefitEmoji}>{emoji}</Text>
      <Text style={styles.benefitTitle}>{title}</Text>
      <Text style={styles.benefitBody}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 14 },
  loadingBox: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { color: MUTED, fontWeight: "600" },

  hero: {
    borderRadius: 22,
    padding: 20,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.35)",
    overflow: "hidden",
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: ACCENT,
    textTransform: "uppercase",
  },
  heroTag: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: "#e2e8f0",
  },
  heroTitle: {
    marginTop: 10,
    fontSize: 22,
    fontWeight: "900",
    color: "#f8fafc",
    letterSpacing: -0.5,
  },
  heroSub: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: MUTED,
    fontWeight: "600",
  },

  discountCard: {
    alignItems: "center",
    paddingVertical: 20,
    borderRadius: 20,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
  },
  discountHuge: {
    fontSize: 64,
    fontWeight: "900",
    color: "#f8fafc",
    textShadowColor: ACCENT,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  discountCaption: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  promoBanner: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: "rgba(37,99,235,0.25)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.45)",
  },
  promoBannerText: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 21,
    textAlign: "center",
  },
  discountSplitRow: {
    flexDirection: "row",
    gap: 10,
  },
  discountSplitBox: {
    flex: 1,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
  },
  discountSplitLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: MUTED,
    textAlign: "center",
    marginBottom: 6,
  },
  discountSplitValue: {
    fontSize: 24,
    fontWeight: "900",
    color: "#f8fafc",
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: MUTED,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 4,
  },
  progressWrap: {
    padding: 16,
    borderRadius: 18,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.15)",
    gap: 14,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#334155",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  milestoneRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  milestoneCol: { alignItems: "center", flex: 1 },
  milestoneDot: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "#475569",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0f172a",
  },
  milestoneDotTxt: { fontSize: 14, fontWeight: "900", color: "#e2e8f0" },
  milestonePct: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "900",
    color: "#f1f5f9",
  },
  milestoneFriends: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "600",
    color: MUTED,
    textAlign: "center",
  },
  nextHint: {
    fontSize: 13,
    fontWeight: "700",
    color: "#cbd5e1",
    textAlign: "center",
  },

  ctaPrimary: {
    backgroundColor: ACCENT,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  ctaPrimaryText: { color: "#fff", fontSize: 17, fontWeight: "900" },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },

  secondaryRow: { flexDirection: "row", gap: 10 },
  ctaGhost: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.4)",
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "rgba(30,41,59,0.6)",
  },
  ctaGhostText: { color: "#e2e8f0", fontWeight: "800", fontSize: 15 },

  socialRow: { flexDirection: "row", gap: 10 },
  socialBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#172554",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.4)",
  },
  socialBtnText: { color: "#93c5fd", fontWeight: "800", fontSize: 14 },

  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.2)",
  },
  codeLabel: {
    fontSize: 11,
    fontWeight: "900",
    color: MUTED,
    letterSpacing: 0.8,
  },
  codeValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
    color: "#f8fafc",
    letterSpacing: 1,
  },
  codeCopy: { fontSize: 14, fontWeight: "900", color: ACCENT },

  benefits: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  benefitCard: {
    width: "31%",
    minWidth: 100,
    flexGrow: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.15)",
    gap: 4,
  },
  benefitEmoji: { fontSize: 22 },
  benefitTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#f1f5f9",
  },
  benefitBody: {
    fontSize: 11,
    color: MUTED,
    fontWeight: "600",
    lineHeight: 15,
  },

  sectionTitle: {
    fontSize: 17,
    fontWeight: "900",
    color: "#f8fafc",
    marginTop: 8,
  },
  empty: {
    color: MUTED,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 16,
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.12)",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#334155",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { fontSize: 18, fontWeight: "900", color: "#f8fafc" },
  historyName: { fontSize: 15, fontWeight: "800", color: "#f1f5f9" },
  historyMeta: { fontSize: 12, color: MUTED, marginTop: 2, fontWeight: "600" },
  statusMini: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusMiniTxt: { fontSize: 11, fontWeight: "900", color: "#e2e8f0" },
  rewardTxt: { fontSize: 11, fontWeight: "800", color: SUCCESS },

  footnote: {
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
    lineHeight: 16,
  },
});
