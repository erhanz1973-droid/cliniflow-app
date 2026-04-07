import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────
interface SubscriptionStatus {
  plan: "free" | "pro";
  stripe_status: "none" | "active" | "trialing" | "past_due" | "canceled" | "incomplete";
  subscription_id: string | null;
  current_period_end: string | null;
  has_stripe_customer: boolean;
  referral_count?: number;
  referral_limit?: number | null;
}

// ─── Feature lists ────────────────────────────────────────────
const FREE_FEATURES = [
  { label: "1 referral per month",        included: true },
  { label: "Basic patient management",    included: true },
  { label: "Clinic profile",              included: true },
  { label: "Unlimited referrals",         included: false },
  { label: "Referral rewards system",     included: false },
  { label: "Patient growth analytics",    included: false },
  { label: "Priority support",            included: false },
];

const PRO_FEATURES = [
  { label: "Unlimited referrals",         included: true },
  { label: "Referral rewards system",     included: true },
  { label: "Patient growth analytics",    included: true },
  { label: "Full workflow access",        included: true },
  { label: "Priority support",            included: true },
  { label: "Advanced reporting",          included: true },
  { label: "Early access to new features",included: true },
];

// ─── Status badge helper ──────────────────────────────────────
function statusLabel(status: string): { text: string; color: string; bg: string } {
  switch (status) {
    case "active":     return { text: "Active",    color: "#065F46", bg: "#D1FAE5" };
    case "trialing":   return { text: "Trial",     color: "#1D4ED8", bg: "#DBEAFE" };
    case "past_due":   return { text: "Past Due",  color: "#92400E", bg: "#FEF3C7" };
    case "canceled":   return { text: "Canceled",  color: "#991B1B", bg: "#FEE2E2" };
    case "incomplete": return { text: "Incomplete",color: "#6B7280", bg: "#F3F4F6" };
    default:           return { text: "Free",      color: "#374151", bg: "#F3F4F6" };
  }
}

export default function PricingScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    if (!user?.token) { setLoading(false); return; }
    try {
      const [stripeRes, planRes] = await Promise.allSettled([
        fetch(`${API_BASE}/api/admin/stripe/subscription-status`, {
          headers: { Authorization: `Bearer ${user.token}` },
        }),
        fetch(`${API_BASE}/api/admin/plan`, {
          headers: { Authorization: `Bearer ${user.token}` },
        }),
      ]);

      let merged: Partial<SubscriptionStatus> = {};

      if (stripeRes.status === "fulfilled" && stripeRes.value.ok) {
        const j = await stripeRes.value.json();
        if (j.ok) merged = { ...merged, ...j };
      }
      if (planRes.status === "fulfilled" && planRes.value.ok) {
        const j = await planRes.value.json();
        if (j.ok) {
          merged.plan = merged.plan || j.plan;
          merged.referral_count = j.referral_count;
          merged.referral_limit = j.referral_limit;
        }
      }

      setStatus({
        plan: merged.plan || "free",
        stripe_status: merged.stripe_status || "none",
        subscription_id: merged.subscription_id || null,
        current_period_end: merged.current_period_end || null,
        has_stripe_customer: !!merged.has_stripe_customer,
        referral_count: merged.referral_count ?? 0,
        referral_limit: merged.referral_limit ?? 1,
      });
    } catch (err) {
      console.error("[Pricing] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Re-fetch when user returns from Stripe checkout
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      if (url?.includes("payment-success") || url?.includes("pricing")) {
        setLoading(true);
        fetchStatus();
      }
    });
    return () => sub.remove();
  }, [fetchStatus]);

  const handleUpgrade = async () => {
    if (!user?.token) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/stripe/create-checkout-session`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
      });
      const json = await res.json();
      if (json.ok && json.url) {
        await Linking.openURL(json.url);
      } else {
        Alert.alert("Error", json.error || "Could not start checkout. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (!user?.token) return;
    setActionLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/stripe/create-portal-session`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${user.token}`,
          "Content-Type": "application/json",
        },
      });
      const json = await res.json();
      if (json.ok && json.url) {
        await Linking.openURL(json.url);
      } else {
        Alert.alert("Error", json.error || "Could not open billing portal.");
      }
    } catch {
      Alert.alert("Error", "Network error. Please try again.");
    } finally {
      setActionLoading(false);
    }
  };

  const isPro = status?.plan === "pro";
  const stripeActive = status?.stripe_status === "active" || status?.stripe_status === "trialing";
  const badge = statusLabel(status?.stripe_status || "none");

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
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
          {/* Active subscription info banner */}
          {isPro && status?.subscription_id && (
            <View style={styles.activeBanner}>
              <View style={styles.activeBannerLeft}>
                <Text style={styles.activeBannerTitle}>✦ Clinifly Pro</Text>
                {status.current_period_end && (
                  <Text style={styles.activeBannerSub}>
                    Renews{" "}
                    {new Date(status.current_period_end).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    })}
                  </Text>
                )}
              </View>
              <View style={[styles.statusChip, { backgroundColor: badge.bg }]}>
                <Text style={[styles.statusChipText, { color: badge.color }]}>{badge.text}</Text>
              </View>
            </View>
          )}

          {/* Past due warning */}
          {status?.stripe_status === "past_due" && (
            <TouchableOpacity style={styles.warningBanner} onPress={handleManageSubscription}>
              <Text style={styles.warningText}>
                ⚠️ Payment failed — update your payment method to keep Pro access →
              </Text>
            </TouchableOpacity>
          )}

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

            {/* Usage meter for free plan */}
            {!isPro && status && (
              <View style={styles.usageBox}>
                <View style={styles.usageRow}>
                  <Text style={styles.usageLabel}>Referrals used this month</Text>
                  <Text style={styles.usageCount}>
                    {status.referral_count} / {status.referral_limit ?? 1}
                  </Text>
                </View>
                <View style={styles.usageTrack}>
                  <View
                    style={[
                      styles.usageBar,
                      {
                        width: `${Math.min(100, ((status.referral_count ?? 0) / (status.referral_limit ?? 1)) * 100)}%`,
                        backgroundColor:
                          (status.referral_count ?? 0) >= (status.referral_limit ?? 1)
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

            {isPro ? (
              <TouchableOpacity
                style={[styles.planBtn, styles.manageBtn, actionLoading && styles.btnLoading]}
                onPress={handleManageSubscription}
                disabled={actionLoading}
                activeOpacity={0.85}
              >
                {actionLoading
                  ? <ActivityIndicator color="#2563EB" />
                  : <Text style={styles.manageBtnText}>Manage Subscription →</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.planBtn, actionLoading && styles.btnLoading]}
                onPress={handleUpgrade}
                disabled={actionLoading}
                activeOpacity={0.85}
              >
                {actionLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.planBtnText}>Upgrade to Pro — $29/mo →</Text>}
              </TouchableOpacity>
            )}
          </View>

          {/* Secure payment note */}
          <View style={styles.secureRow}>
            <Text style={styles.secureText}>🔒 Secure payment via Stripe · Cancel anytime</Text>
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

// ─── Feature row ──────────────────────────────────────────────
function FeatureRow({ label, included, pro }: { label: string; included: boolean; pro?: boolean }) {
  return (
    <View style={fr.row}>
      <Text style={[fr.icon, included ? (pro ? fr.proCheck : fr.check) : fr.cross]}>
        {included ? "✓" : "✗"}
      </Text>
      <Text style={[fr.label, !included && fr.labelMuted]}>{label}</Text>
    </View>
  );
}

const fr = StyleSheet.create({
  row:       { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 5 },
  icon:      { width: 20, fontWeight: "800", fontSize: 14 },
  check:     { color: "#16A34A" },
  proCheck:  { color: "#2563EB" },
  cross:     { color: "#D1D5DB" },
  label:     { flex: 1, fontSize: 14, color: "#374151" },
  labelMuted:{ color: "#C4C9D4" },
});

// ─── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F3F4F6" },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#fff", paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "#E5E7EB",
  },
  backBtn:     { width: 40, height: 40, justifyContent: "center", alignItems: "center" },
  backText:    { fontSize: 22, color: "#111827" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },

  scroll:        { flex: 1 },
  scrollContent: { padding: 20, gap: 14 },

  // Active banner
  activeBanner: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#EFF6FF", borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderWidth: 1, borderColor: "#93C5FD",
  },
  activeBannerLeft:  { gap: 2 },
  activeBannerTitle: { fontSize: 15, fontWeight: "800", color: "#1D4ED8" },
  activeBannerSub:   { fontSize: 12, color: "#3B82F6" },
  statusChip:        { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusChipText:    { fontSize: 12, fontWeight: "700" },

  warningBanner: {
    backgroundColor: "#FEF3C7", borderRadius: 10,
    padding: 14, borderWidth: 1, borderColor: "#FCD34D",
  },
  warningText: { fontSize: 13, color: "#92400E", lineHeight: 18 },

  // Plan cards
  planCard: {
    backgroundColor: "#fff", borderRadius: 16, padding: 20,
    borderWidth: 2, borderColor: "#E5E7EB", gap: 4,
    ...Platform.select({
      ios:     { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  planCardActive: { borderColor: "#2563EB" },
  proPlanCard:    { borderColor: "#2563EB", paddingTop: 36 },

  popularBadge: {
    position: "absolute", top: -1, left: 20, right: 20,
    backgroundColor: "#2563EB", borderBottomLeftRadius: 8, borderBottomRightRadius: 8,
    paddingVertical: 4, alignItems: "center",
  },
  popularText: { color: "#fff", fontSize: 11, fontWeight: "800", letterSpacing: 1 },

  planCardHeader: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "flex-start", marginBottom: 12,
  },
  planName:  { fontSize: 22, fontWeight: "800", color: "#111827" },
  proName:   { color: "#2563EB" },
  priceRow:  { flexDirection: "row", alignItems: "baseline", marginTop: 2 },
  planPrice: { fontSize: 28, fontWeight: "800", color: "#6B7280" },
  proPrice:  { color: "#2563EB" },
  pricePer:  { fontSize: 14, color: "#9CA3AF" },

  currentChip:     { backgroundColor: "#F3F4F6", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  currentChipPro:  { backgroundColor: "#2563EB" },
  currentChipText: { fontSize: 12, fontWeight: "700", color: "#6B7280" },

  // Usage meter
  usageBox:  { backgroundColor: "#FFFBEB", borderRadius: 10, padding: 12, marginBottom: 8, gap: 8 },
  usageRow:  { flexDirection: "row", justifyContent: "space-between" },
  usageLabel:{ fontSize: 12, color: "#92400E" },
  usageCount:{ fontSize: 12, fontWeight: "700", color: "#92400E" },
  usageTrack:{ height: 6, backgroundColor: "#FDE68A", borderRadius: 3, overflow: "hidden" },
  usageBar:  { height: "100%", borderRadius: 3 },

  // Buttons
  planBtn:          { borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 10, backgroundColor: "#2563EB" },
  btnLoading:       { opacity: 0.65 },
  planBtnText:      { color: "#fff", fontWeight: "800", fontSize: 15 },
  planBtnGhost:     { backgroundColor: "transparent", borderWidth: 1.5, borderColor: "#E5E7EB" },
  planBtnGhostText: { color: "#9CA3AF", fontWeight: "700", fontSize: 14 },
  manageBtn:        { backgroundColor: "#EFF6FF", borderWidth: 1.5, borderColor: "#93C5FD" },
  manageBtnText:    { color: "#2563EB", fontWeight: "700", fontSize: 15 },

  // Footer
  secureRow:    { alignItems: "center", marginTop: 4 },
  secureText:   { fontSize: 12, color: "#9CA3AF", textAlign: "center" },
  contactText:  { textAlign: "center", fontSize: 13, color: "#2563EB", marginTop: 4 },
});
