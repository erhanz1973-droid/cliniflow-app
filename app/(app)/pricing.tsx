import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";

// ─── Types (plan summary from backend only — billing occurs on clinic web app) ───
interface PlanInfo {
  plan: "free" | "pro";
  referral_count?: number;
  referral_limit?: number | null;
}

// ─── Feature lists ────────────────────────────────────────────
const FREE_FEATURES = [
  { label: "1 referral per month", included: true },
  { label: "Basic patient management", included: true },
  { label: "Clinic profile", included: true },
  { label: "Unlimited referrals", included: false },
  { label: "Referral rewards system", included: false },
  { label: "Patient growth analytics", included: false },
  { label: "Priority support", included: false },
];

const PRO_FEATURES = [
  { label: "Unlimited referrals", included: true },
  { label: "Referral rewards system", included: true },
  { label: "Patient growth analytics", included: true },
  { label: "Full workflow access", included: true },
  { label: "Priority support", included: true },
  { label: "Advanced reporting", included: true },
  { label: "Early access to new features", included: true },
];

export default function PricingScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [info, setInfo] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchPlan = useCallback(async () => {
    if (!user?.token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/admin/plan`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const j = await res.json();
      if (j.ok) {
        setInfo({
          plan: j.plan === "pro" ? "pro" : "free",
          referral_count: j.referral_count,
          referral_limit: j.referral_limit,
        });
      }
    } catch (err) {
      console.error("[Pricing] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => {
    fetchPlan();
  }, [fetchPlan]);

  const isPro = info?.plan === "pro";

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Pricing</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color="#2563EB" />
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.webBanner}>
            <Text style={styles.webBannerTitle}>Billing</Text>
            <Text style={styles.webBannerText}>
              Subscriptions and checkout are handled in the clinic web dashboard, not in this app.
              Use your browser on a computer or tablet to change plans or payment methods.
            </Text>
          </View>

          {/* FREE PLAN */}
          <View style={[styles.planCard, !isPro && styles.planCardActive]}>
            <View style={styles.planCardHeader}>
              <View>
                <Text style={styles.planName}>Free</Text>
                <Text style={styles.planPrice}>$0 / month</Text>
              </View>
              {!isPro && (
                <View style={styles.currentChip}>
                  <Text style={styles.currentChipText}>Current plan</Text>
                </View>
              )}
            </View>

            {!isPro && info && (
              <View style={styles.usageBox}>
                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Referrals used this month</Text>
                  <Text style={styles.usageCount}>
                    {info.referral_count} / {info.referral_limit ?? 1}
                  </Text>
                </View>
                <View style={styles.usageTrack}>
                  <View
                    style={[
                      styles.usageBar,
                      {
                        width: `${Math.min(100, ((info.referral_count ?? 0) / (info.referral_limit ?? 1)) * 100)}%`,
                        backgroundColor:
                          (info.referral_count ?? 0) >= (info.referral_limit ?? 1)
                            ? "#EF4444"
                            : "#F59E0B",
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            {FREE_FEATURES.map((f) => (
              <FeatureRow key={f.label} label={f.label} included={f.included} />
            ))}

            <View style={[styles.planBtn, styles.planBtnGhost]}>
              <Text style={styles.planBtnGhostText}>Your current plan</Text>
            </View>
          </View>

          {/* PRO PLAN */}
          <View style={[styles.planCard, styles.proPlanCard, isPro && styles.planCardActive]}>
            <View style={styles.popularBadge}>
              <Text style={styles.popularText}>⭐ RECOMMENDED</Text>
            </View>

            <View style={styles.planCardHeader}>
              <View>
                <Text style={[styles.planName, styles.proName]}>Pro</Text>
                <View style={styles.priceRow}>
                  <Text style={[styles.planPrice, styles.proPrice]}>$29</Text>
                  <Text style={styles.pricePer}> / month</Text>
                </View>
              </View>
              {isPro && (
                <View style={[styles.currentChip, styles.currentChipPro]}>
                  <Text style={[styles.currentChipText, { color: "#fff" }]}>Active</Text>
                </View>
              )}
            </View>

            {PRO_FEATURES.map((f) => (
              <FeatureRow key={f.label} label={f.label} included pro />
            ))}

            <View style={[styles.planBtn, styles.planBtnMuted]}>
              <Text style={styles.planBtnMutedText}>
                {isPro ? "Manage your plan on the web dashboard." : "Upgrade on the clinic web dashboard."}
              </Text>
            </View>
          </View>

          <TouchableOpacity onPress={() => Linking.openURL("mailto:support@clinifly.net")}>
            <Text style={styles.contactText}>Questions? support@clinifly.net</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function FeatureRow({ label, included, pro }: { label: string; included: boolean; pro?: boolean }) {
  return (
    <View style={fr.row}>
      <Text style={[fr.icon, included ? (pro ? fr.proCheck : fr.check) : fr.cross]}>{included ? "✓" : "✗"}</Text>
      <Text style={[fr.label, !included && fr.labelMuted]}>{label}</Text>
    </View>
  );
}

const fr = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 },
  icon: { width: 20, fontWeight: "800", fontSize: 14 },
  check: { color: "#16A34A" },
  proCheck: { color: "#2563EB" },
  cross: { color: "#D1D5DB" },
  label: { flex: 1, fontSize: 14, color: "#374151" },
  labelMuted: { color: "#C4C9D4" },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F3F4F6" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backBtn: { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  backText: { fontSize: 22, color: "#111827" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },

  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 14 },

  webBanner: {
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    marginBottom: 4,
    gap: 6,
  },
  webBannerTitle: { fontSize: 14, fontWeight: "800", color: "#1D4ED8" },
  webBannerText: { fontSize: 13, color: "#1E3A8A", lineHeight: 18 },

  planCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    gap: 4,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  planCardActive: { borderColor: "#2563EB" },
  proPlanCard: { borderColor: "#2563EB", paddingTop: 36 },

  popularBadge: {
    position: "absolute",
    top: -1,
    left: 20,
    right: 20,
    backgroundColor: "#2563EB",
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    paddingVertical: 4,
    alignItems: "center",
  },
  popularText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1 },

  planCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  planName: { fontSize: 22, fontWeight: "800", color: "#111827" },
  proName: { color: "#2563EB" },
  priceRow: { flexDirection: "row", alignItems: "baseline", marginTop: 2 },
  planPrice: { fontSize: 28, fontWeight: "800", color: "#6B7280" },
  proPrice: { color: "#2563EB" },
  pricePer: { fontSize: 14, color: "#9CA3AF" },

  currentChip: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  currentChipPro: { backgroundColor: "#2563EB" },
  currentChipText: { fontSize: 12, fontWeight: "700", color: "#6B7280" },

  usageBox: {
    backgroundColor: "#FFFBEB",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    gap: 8,
  },
  usageRow: { flexDirection: "row", justifyContent: "space-between" },
  usageLabel: { fontSize: 12, color: "#92400E" },
  usageCount: { fontSize: 12, fontWeight: "700", color: "#92400E" },
  usageTrack: { height: 6, backgroundColor: "#FDE68A", borderRadius: 3, overflow: "hidden" },
  usageBar: { height: "100%", borderRadius: 3 },

  planBtn: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 10,
    backgroundColor: "#2563EB",
  },
  planBtnGhost: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
  },
  planBtnGhostText: { color: "#9CA3AF", fontWeight: "700", fontSize: 14 },
  planBtnMuted: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  planBtnMutedText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4B5563",
    textAlign: "center",
    paddingHorizontal: 8,
  },

  contactText: { textAlign: "center", fontSize: 13, color: "#2563EB", marginTop: 4 },
});
