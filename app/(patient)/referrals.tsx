import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Share,
  ActivityIndicator,
  RefreshControl,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { useAuth } from "../../lib/auth";
import { useLanguage } from "../../lib/language-context";
import { useDateLocale } from "../../lib/date-locale";
import { API_BASE } from "../../lib/api";

type ReferralItem = {
  id: string | number;
  name: string;
  status: string;
  createdAt: number | null;
};

type ReferralData = {
  referralCode: string;
  discountPercent: number | null;
  referrals: ReferralItem[];
};

const STATUS_COLORS: Record<string, string> = {
  invited:    "#6366f1",
  registered: "#2563eb",
  treated:    "#16a34a",
  rewarded:   "#f59e0b",
};

export default function ReferralsScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const locale = useDateLocale();

  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const toastOpacity = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    if (!user?.token) return;
    const patientId = String((user as any)?.patientId || (user as any)?.id || "").trim();
    if (!patientId) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/patient/${encodeURIComponent(patientId)}/referrals`,
        { headers: { Authorization: `Bearer ${user.token}` } },
      );
      if (!res.ok) { console.error("[Referrals] HTTP", res.status); return; }
      const json = await res.json();
      if (json.ok) {
        // Backend returns { ok, items: [...] } — map to the shape the UI expects
        const items = json.items || json.referrals || [];
        setData({
          referralCode:    json.referralCode   || "",
          discountPercent: json.discountPercent ?? null,
          referrals: items.map((item: any) => ({
            id:        item.id,
            // Show the friend's name: if I'm the inviter → show invited name, else inviter name
            name:      item.invitedPatientName || item.inviterPatientName || "—",
            status:    item.status || "pending",
            createdAt: item.createdAt ?? null,
          })),
        });
      }
    } catch (e) {
      console.error("[Referrals] fetch error", e);
    }
  }, [user?.token, (user as any)?.patientId, (user as any)?.id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const showToast = () => {
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start();
  };

  // Referral code = patient's own patient_id (e.g. "p_abc123")
  const myCode = String(
    data?.referralCode ||
    (user as any)?.patientId ||
    (user as any)?.id ||
    ""
  ).trim();

  const handleCopyCode = async () => {
    if (!myCode) return;
    await Clipboard.setStringAsync(myCode);
    showToast();
  };

  const handleShare = async () => {
    const message = t("referrals.shareMessage").replace("{{patientId}}", myCode);
    try {
      await Share.share({ message, title: t("referrals.shareLink") });
    } catch (_) {}
  };

  const statusLabel = (s: string) => {
    const key = `referrals.status.${String(s || "").toLowerCase()}`;
    const label = t(key);
    return label === key ? String(s || "—") : label;
  };

  const statusColor = (s: string) =>
    STATUS_COLORS[String(s || "").toLowerCase()] || "#6b7280";

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const discountPercent = data?.discountPercent ?? null;
  const referrals       = data?.referrals || [];

  const howItWorksTitle = t("referrals.howItWorks");
  const howItWorksStep1 = t("referrals.howItWorksStep1");
  const howItWorksStep2 = t("referrals.howItWorksStep2");
  const howItWorksStep3 = t("referrals.howItWorksStep3");

  return (
    <SafeAreaView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <Text style={styles.pageTitle}>{t("referrals.title")}</Text>

        {/* Referral Code Card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{t("referrals.inviteCode")}</Text>

          <TouchableOpacity onPress={handleCopyCode} activeOpacity={0.7}>
            <Text style={styles.codeText}>{myCode || "—"}</Text>
          </TouchableOpacity>
          <Text style={styles.tapHint}>{t("referrals.tapToCopy")}</Text>

          <View style={styles.btnRow}>
            <TouchableOpacity style={styles.btnPrimary} onPress={handleShare}>
              <Text style={styles.btnPrimaryText}>{t("referrals.shareLink")}</Text>
            </TouchableOpacity>
          </View>

        </View>

        {/* How it works */}
        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>ℹ️ {howItWorksTitle}</Text>

          <View style={styles.stepRow}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
            <Text style={styles.stepText}>{howItWorksStep1}</Text>
          </View>
          <View style={styles.stepRow}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
            <Text style={styles.stepText}>{howItWorksStep2}</Text>
          </View>
          <View style={styles.stepRow}>
            <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
            <Text style={styles.stepText}>{howItWorksStep3}</Text>
          </View>

          {/* Discount highlight */}
          {discountPercent !== null && (
            <View style={styles.discountBadge}>
              <Text style={styles.discountReceiveText}>{t("referrals.bothReceive")}</Text>
              <Text style={styles.discountPct}>{discountPercent}%</Text>
              <Text style={styles.discountLabel}>{t("referrals.discountBadge")}</Text>
            </View>
          )}
        </View>

        {/* Friends list */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{t("referrals.friendsList")}</Text>

          {referrals.length === 0 ? (
            <Text style={styles.emptyText}>{t("referrals.noReferrals")}</Text>
          ) : (
            referrals.map((ref) => (
              <View key={ref.id} style={styles.friendRow}>
                <View style={styles.friendAvatar}>
                  <Text style={styles.friendAvatarText}>
                    {String(ref.name || "?")[0].toUpperCase()}
                  </Text>
                </View>
                <View style={styles.friendInfo}>
                  <Text style={styles.friendName}>{ref.name}</Text>
                  {ref.createdAt ? (
                    <Text style={styles.friendDate}>
                      {new Date(ref.createdAt).toLocaleDateString(locale)}
                    </Text>
                  ) : null}
                </View>
                <View style={[styles.statusBadge, { borderColor: statusColor(ref.status) }]}>
                  <Text style={[styles.statusText, { color: statusColor(ref.status) }]}>
                    {statusLabel(ref.status)}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Copy toast */}
      <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="none">
        <Text style={styles.toastText}>{t("referrals.copySuccess")}</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:      { flex: 1, backgroundColor: "#f3f4f6" },
  scroll:    { padding: 16, paddingBottom: 40 },
  centered:  { flex: 1, justifyContent: "center", alignItems: "center" },
  pageTitle: { fontSize: 22, fontWeight: "800", color: "#111827", marginBottom: 16 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 18,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardLabel: { fontSize: 13, fontWeight: "600", color: "#6b7280", marginBottom: 8 },
  codeText: {
    fontSize: 30,
    fontWeight: "900",
    color: "#2563eb",
    letterSpacing: 3,
    marginBottom: 4,
  },
  tapHint: { fontSize: 12, color: "#9ca3af", marginBottom: 16 },

  btnRow:        { flexDirection: "row", marginBottom: 12 },
  btnPrimary: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  linkPreview: { fontSize: 12, color: "#9ca3af", marginTop: 4 },

  infoCard: {
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  infoTitle: { fontSize: 14, fontWeight: "700", color: "#1d4ed8", marginBottom: 12 },

  stepRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#2563eb",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
    marginTop: 1,
    flexShrink: 0,
  },
  stepNumText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  stepText: { flex: 1, fontSize: 13, color: "#1e40af", lineHeight: 20 },

  discountBadge: {
    marginTop: 14,
    alignItems: "center",
    backgroundColor: "#1d4ed8",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  discountReceiveText: { fontSize: 13, color: "#bfdbfe", fontWeight: "600", marginBottom: 4 },
  discountPct: { fontSize: 52, fontWeight: "900", color: "#fff", lineHeight: 58 },
  discountLabel: { fontSize: 16, fontWeight: "800", color: "#93c5fd", letterSpacing: 2, marginTop: 2 },

  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 14 },
  emptyText:    { color: "#9ca3af", fontSize: 14, textAlign: "center", paddingVertical: 20 },

  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  friendAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#dbeafe",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  friendAvatarText: { fontSize: 16, fontWeight: "700", color: "#2563eb" },
  friendInfo:       { flex: 1 },
  friendName:       { fontSize: 15, fontWeight: "600", color: "#111827" },
  friendDate:       { fontSize: 12, color: "#9ca3af", marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  statusText: { fontSize: 12, fontWeight: "700" },

  toast: {
    position: "absolute",
    bottom: 32,
    alignSelf: "center",
    backgroundColor: "#1f2937",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
  },
  toastText: { color: "#fff", fontSize: 14, fontWeight: "600" },
});
