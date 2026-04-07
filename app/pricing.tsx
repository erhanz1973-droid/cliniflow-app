import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  SafeAreaView,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";

interface PlanData {
  plan: "free" | "pro";
  referral_count: number;
  referral_limit: number | null;
}

const FREE_FEATURES = [
  { label: "1 referral per month", included: true },
  { label: "Basic patient management", included: true },
  { label: "Clinic profile", included: true },
  { label: "Unlimited referrals", included: false },
  { label: "Referral rewards system", included: false },
  { label: "Patient growth analytics", included: false },
];

const PRO_FEATURES = [
  { label: "Unlimited referrals", included: true },
  { label: "Referral rewards system", included: true },
  { label: "Patient growth analytics", included: true },
  { label: "Full workflow access", included: true },
  { label: "Priority support", included: true },
  { label: "Advanced reporting", included: true },
];

export default function PricingScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [planData, setPlanData] = useState<PlanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);

  useEffect(() => {
    if (!user?.token) { setLoading(false); return; }
    fetch(`${API_BASE}/api/admin/plan`, {
      headers: { Authorization: `Bearer ${user.token}` },
    })
      .then((r) => r.json())
      .then((json) => { if (json.ok) setPlanData(json); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user?.token]);

  const handleUpgrade = async () => {
    if (!user?.token) return;
    setUpgrading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/plan/upgrade`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
      });
      const json = await res.json();
      if (json.ok) {
        setPlanData((prev) => (prev ? { ...prev, plan: "pro", referral_limit: null } : prev));
        Alert.alert(
          "🎉 Welcome to Pro!",
          "You now have unlimited referrals and full access to all features.",
          [{ text: "Let's go!", onPress: () => router.back() }]
        );
      } else {
        Alert.alert("Error", json.message || "Upgrade failed. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setUpgrading(false);
    }
  };

  const currentPlan = planData?.plan || "free";
  const isAlreadyPro = currentPlan === "pro";

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Choose Your Plan</Text>
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
          {/* Current plan badge */}
          {planData && (
            <View style={styles.currentBadgeRow}>
              <View style={[styles.currentBadge, isAlreadyPro ? styles.proBadgeStyle : styles.freeBadgeStyle]}>
                <Text style={[styles.currentBadgeText, isAlreadyPro ? styles.proBadgeText : styles.freeBadgeText]}>
                  {isAlreadyPro ? "✦ Pro Plan Active" : "Free Plan Active"}
                </Text>
              </View>
            </View>
          )}

          {/* FREE PLAN CARD */}
          <View style={[styles.planCard, !isAlreadyPro && styles.planCardActive]}>
            <View style={styles.planCardHeader}>
              <View>
                <Text style={styles.planName}>Free</Text>
                <Text style={styles.planPrice}>$0 / month</Text>
              </View>
              {!isAlreadyPro && (
                <View style={styles.activeChip}>
                  <Text style={styles.activeChipText}>Current</Text>
                </View>
              )}
            </View>

            {planData && !isAlreadyPro && (
              <View style={styles.usageRow}>
                <Text style={styles.usageLabel}>Referrals this month</Text>
                <Text style={styles.usageValue}>
                  {planData.referral_count} / {planData.referral_limit ?? 1}
                </Text>
              </View>
            )}

            {FREE_FEATURES.map((f) => (
              <FeatureRow key={f.label} label={f.label} included={f.included} />
            ))}

            <TouchableOpacity
              style={[styles.planBtn, styles.planBtnGhost]}
              disabled
            >
              <Text style={styles.planBtnGhostText}>Start Free</Text>
            </TouchableOpacity>
          </View>

          {/* PRO PLAN CARD */}
          <View style={[styles.planCard, styles.proPlanCard, isAlreadyPro && styles.planCardActive]}>
            <View style={styles.popularBadge}>
              <Text style={styles.popularText}>⭐ MOST POPULAR</Text>
            </View>

            <View style={styles.planCardHeader}>
              <View>
                <Text style={[styles.planName, styles.proText]}>Pro</Text>
                <Text style={[styles.planPrice, styles.proText]}>Contact us</Text>
              </View>
              {isAlreadyPro && (
                <View style={[styles.activeChip, styles.activeChipPro]}>
                  <Text style={[styles.activeChipText, { color: "#fff" }]}>Active</Text>
                </View>
              )}
            </View>

            {PRO_FEATURES.map((f) => (
              <FeatureRow key={f.label} label={f.label} included pro />
            ))}

            {isAlreadyPro ? (
              <View style={styles.alreadyProBox}>
                <Text style={styles.alreadyProText}>✓ You're on Pro — all features unlocked</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.planBtn, upgrading && styles.planBtnLoading]}
                onPress={handleUpgrade}
                disabled={upgrading}
                activeOpacity={0.85}
              >
                {upgrading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.planBtnText}>Upgrade to Pro →</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Footer note */}
          <Text style={styles.footer}>
            Need help? Contact{" "}
            <Text style={styles.footerLink}>support@clinifly.net</Text>
          </Text>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function FeatureRow({ label, included, pro }: { label: string; included: boolean; pro?: boolean }) {
  return (
    <View style={featureStyles.row}>
      <Text style={[featureStyles.icon, included ? (pro ? featureStyles.proCheck : featureStyles.check) : featureStyles.cross]}>
        {included ? "✓" : "✗"}
      </Text>
      <Text style={[featureStyles.label, !included && featureStyles.labelMuted]}>{label}</Text>
    </View>
  );
}

const featureStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 },
  icon: { width: 20, fontWeight: "800", fontSize: 14 },
  check: { color: "#16A34A" },
  proCheck: { color: "#2563EB" },
  cross: { color: "#D1D5DB" },
  label: { flex: 1, fontSize: 14, color: "#374151" },
  labelMuted: { color: "#9CA3AF" },
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
  scrollContent: { padding: 20, gap: 16 },

  currentBadgeRow: { alignItems: "center", marginBottom: 4 },
  currentBadge: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20 },
  freeBadgeStyle: { backgroundColor: "#F3F4F6", borderWidth: 1, borderColor: "#D1D5DB" },
  proBadgeStyle: { backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#93C5FD" },
  currentBadgeText: { fontWeight: "700", fontSize: 13 },
  freeBadgeText: { color: "#6B7280" },
  proBadgeText: { color: "#2563EB" },

  planCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: "#E5E7EB",
    gap: 4,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  planCardActive: { borderColor: "#2563EB" },
  proPlanCard: { borderColor: "#2563EB", position: "relative", paddingTop: 36 },

  popularBadge: {
    position: "absolute",
    top: -1,
    left: 20,
    right: 20,
    backgroundColor: "#2563EB",
    borderRadius: 0,
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
  planPrice: { fontSize: 15, color: "#6B7280", marginTop: 2 },
  proText: { color: "#2563EB" },

  activeChip: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  activeChipPro: { backgroundColor: "#2563EB" },
  activeChipText: { fontSize: 12, fontWeight: "700", color: "#6B7280" },

  usageRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#FEF3C7",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  usageLabel: { fontSize: 13, color: "#92400E" },
  usageValue: { fontSize: 13, fontWeight: "700", color: "#92400E" },

  planBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 12,
  },
  planBtnLoading: { opacity: 0.7 },
  planBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  planBtnGhost: { backgroundColor: "transparent", borderWidth: 1.5, borderColor: "#D1D5DB" },
  planBtnGhostText: { color: "#9CA3AF", fontWeight: "700", fontSize: 15 },

  alreadyProBox: {
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  alreadyProText: { color: "#2563EB", fontWeight: "700", fontSize: 14 },

  footer: { textAlign: "center", fontSize: 13, color: "#9CA3AF", marginTop: 8 },
  footerLink: { color: "#2563EB" },
});
