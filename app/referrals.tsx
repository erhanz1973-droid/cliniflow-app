// app/referrals.tsx
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
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";
import { t, getLanguage } from "../lib/i18n";

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

type ClinicDiscountRates = {
  defaultInviterDiscountPercent?: number | null;
  defaultInvitedDiscountPercent?: number | null;
};

export default function ReferralsScreen() {
  const router = useRouter();
  const { user, isAuthReady } = useAuth();
  const userPatientId = user?.patientId || "";
  
  const [patientId, setPatientId] = useState<string>(userPatientId);
  const [referrals, setReferrals] = useState<ReferralItem[]>([]);
  const [clinicDiscountRates, setClinicDiscountRates] = useState<ClinicDiscountRates | null>(null);
  const [loading, setLoading] = useState(true);
  const isRedirectingRef = useRef(false);

  const loadReferrals = useCallback(async (silent = false) => {
    if (!user?.token) {
      if (!silent) setLoading(false);
      return;
    }
    try {
      if (!silent) setLoading(true);

      // Get patientId from API if not available
      let currentPatientId = userPatientId;
      console.log("[REFERRALS] Initial patientId:", currentPatientId);
      
      if (!currentPatientId) {
        console.log("[REFERRALS] PatientId not found, fetching from /api/patient/me");
        const meRes = await fetch(`${API_BASE}/api/patient/me`, {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          currentPatientId = meData?.patientId || "";
          console.log("[REFERRALS] Got patientId from /api/patient/me:", currentPatientId);
          if (currentPatientId) {
            setPatientId(currentPatientId);
          }
        }
      } else {
        console.log("[REFERRALS] Using existing patientId:", currentPatientId);
        setPatientId(currentPatientId);
      }

      if (!currentPatientId) {
        console.warn("[REFERRALS] No patientId available, aborting");
        if (!silent) setLoading(false);
        return;
      }

      // Get clinicCode from /api/patient/me first
      let clinicCode = "";
      try {
        const meRes = await fetch(`${API_BASE}/api/patient/me`, {
          headers: { Authorization: `Bearer ${user.token}` },
        });
        if (meRes.ok) {
          const meData = await meRes.json();
          clinicCode = meData?.clinicCode || "";
          console.log("[REFERRALS] Got clinicCode from /api/patient/me:", clinicCode);
        }
      } catch (e) {
        console.warn("[REFERRALS] Could not get clinicCode from /api/patient/me:", e);
      }

      // Load referrals and clinic discount rates in parallel
      const clinicUrl = clinicCode 
        ? `${API_BASE}/api/clinic?code=${encodeURIComponent(clinicCode)}`
        : `${API_BASE}/api/clinic`;
      console.log("[REFERRALS] Fetching clinic data from:", clinicUrl);
      
      const referralsUrl = `${API_BASE}/api/patient/${encodeURIComponent(currentPatientId)}/referrals`;
      console.log("[REFERRALS] Fetching referrals from:", referralsUrl);
      console.log("[REFERRALS] Using patientId:", currentPatientId);
      
      const [referralsRes, clinicRes] = await Promise.all([
        fetch(referralsUrl, {
          headers: { Authorization: `Bearer ${user.token}` },
        }),
        fetch(clinicUrl),
      ]);
      
      console.log("[REFERRALS] Referrals response status:", referralsRes.status, referralsRes.statusText);

      // Handle referrals response
      if (referralsRes.status === 403 || referralsRes.status === 401) {
        console.log("[REFERRALS] Unauthorized - setting empty referrals");
        setReferrals([]);
      } else if (referralsRes.ok) {
        const referralsJson = await referralsRes.json();
        console.log("[REFERRALS] API response:", {
          ok: referralsJson.ok,
          itemsCount: referralsJson.items?.length || 0,
          items: referralsJson.items?.map((r: any) => ({
            id: r.id,
            status: r.status,
            inviterPatientId: r.inviterPatientId,
            invitedPatientId: r.invitedPatientId,
          }))
        });
        if (referralsJson.ok && Array.isArray(referralsJson.items)) {
          console.log("[REFERRALS] Setting referrals:", referralsJson.items.length);
          console.log("[REFERRALS] Full referrals data:", JSON.stringify(referralsJson.items, null, 2));
          setReferrals(referralsJson.items);
        } else {
          console.warn("[REFERRALS] Invalid response format - ok:", referralsJson.ok, "items is array:", Array.isArray(referralsJson.items));
          console.warn("[REFERRALS] Full response:", JSON.stringify(referralsJson, null, 2));
          setReferrals([]);
        }
      } else {
        const errorText = await referralsRes.text().catch(() => "Could not read error response");
        console.error("[REFERRALS] API error:", referralsRes.status, referralsRes.statusText);
        console.error("[REFERRALS] Error response body:", errorText);
        setReferrals([]);
      }

      // Handle clinic discount rates response
      if (clinicRes.ok) {
        const clinicData = await clinicRes.json();
        console.log("[REFERRALS] Clinic data received:", {
          clinicCode: clinicData.clinicCode || clinicData.code,
          defaultInviterDiscountPercent: clinicData.defaultInviterDiscountPercent,
          defaultInvitedDiscountPercent: clinicData.defaultInvitedDiscountPercent,
        });
        setClinicDiscountRates({
          defaultInviterDiscountPercent: clinicData.defaultInviterDiscountPercent ?? null,
          defaultInvitedDiscountPercent: clinicData.defaultInvitedDiscountPercent ?? null,
        });
      } else {
        console.warn("[REFERRALS] Clinic API response not OK:", clinicRes.status, clinicRes.statusText);
      }
    } catch (error: any) {
      console.error("[REFERRALS] Error loading data:", error);
      if (!silent) Alert.alert(t("common.error"), t("referrals.loadError"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [user?.token, userPatientId]);

  useEffect(() => {
    if (!isAuthReady) return;
    if (!user?.token) {
      setLoading(false);
      return;
    }
    isRedirectingRef.current = false;
    loadReferrals();
  }, [isAuthReady, user?.token, loadReferrals]);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthReady || !user?.token) return;
      loadReferrals(true);
    }, [isAuthReady, user?.token, loadReferrals])
  );

  const onCopy = async () => {
    if (!patientId) return;
    
    try {
      await Clipboard.setStringAsync(patientId);
      Alert.alert(t("common.success"), t("referrals.copySuccess"));
    } catch (error) {
      console.error("Copy error:", error);
      Alert.alert(t("common.error"), t("referrals.copyError"));
    }
  };

  const onShare = async () => {
    if (!patientId) return;

    const inviteMessage = t("referrals.shareMessage", { patientId });

    try {
      await Share.share({ message: inviteMessage });
    } catch (e) {
      console.error("Share failed:", e);
      Alert.alert(t("common.error"), t("referrals.shareFailed"));
    }
  };

  const onHowItWorks = () => {
    Alert.alert(
      t("referrals.howItWorks"),
      t("referrals.howItWorksContent")
    );
  };

  const pendingCount = referrals.filter((r) => (r.status || "").toUpperCase() === "PENDING").length;
  const approvedCount = referrals.filter((r) => (r.status || "").toUpperCase() === "APPROVED").length;
  
  console.log("[REFERRALS] Render stats:", {
    totalReferrals: referrals.length,
    pendingCount,
    approvedCount,
    referrals: referrals.map((r) => ({
      id: r.id,
      status: r.status,
      inviterPatientId: r.inviterPatientId,
      invitedPatientId: r.invitedPatientId,
    }))
  });

  // Bu hastanın rolünü belirle (inviter mi invited mi)
  const getReferralRole = (ref: ReferralItem): "inviter" | "invited" => {
    if (ref.inviterPatientId === patientId) return "inviter";
    if (ref.invitedPatientId === patientId) return "invited";
    return "inviter"; // Default
  };

  const getReferralDisplayName = (ref: ReferralItem): string => {
    const role = getReferralRole(ref);
    if (role === "inviter") {
      return ref.invitedPatientName || ref.invitedPatientId || t("referrals.invitedPerson");
    } else {
      return ref.inviterPatientName || ref.inviterPatientId || t("referrals.inviterPerson");
    }
  };

  const getDiscountPercent = (ref: ReferralItem): number | null => {
    const role = getReferralRole(ref);
    if (role === "inviter") {
      return ref.inviterDiscountPercent ?? ref.discountPercent ?? null;
    } else {
      return ref.invitedDiscountPercent ?? ref.discountPercent ?? null;
    }
  };

  if (loading) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>{t("referrals.title")}</Text>
        <Text style={styles.subtitle}>{t("referrals.subtitle")}</Text>
        <ActivityIndicator style={{ marginTop: 40 }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t("referrals.title")}</Text>
      <Text style={styles.subtitle}>{t("referrals.subtitle")}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("referrals.inviteCode")}</Text>

        <View style={styles.codeBox}>
          <Text style={styles.codeText}>{patientId}</Text>
        </View>

        <View style={styles.row}>
          <Pressable onPress={onCopy} style={styles.btnSecondary}>
            <Text style={styles.btnSecondaryText}>📋 {t("common.copy")}</Text>
          </Pressable>

          <Pressable onPress={onShare} style={styles.btnPrimary}>
            <Text style={styles.btnPrimaryText}>📤 {t("common.share")}</Text>
          </Pressable>
        </View>

        <Pressable onPress={onHowItWorks} style={styles.linkBtn}>
          <Text style={styles.linkText}>{t("referrals.howItWorks")}</Text>
        </Pressable>

        <Text style={styles.helper}>
          {t("referrals.clinicRatesInfo")}
        </Text>

        {/* Clinic Discount Rates */}
        {(clinicDiscountRates?.defaultInviterDiscountPercent != null || 
          clinicDiscountRates?.defaultInvitedDiscountPercent != null) && (
          <View style={styles.discountRatesBox}>
            <Text style={styles.discountRatesTitle}>{t("referrals.clinicRates")}</Text>
            {clinicDiscountRates.defaultInviterDiscountPercent != null && (
              <Text style={styles.discountRatesText}>
                {t("referrals.inviterDiscount")}: %{clinicDiscountRates.defaultInviterDiscountPercent}
              </Text>
            )}
            {clinicDiscountRates.defaultInvitedDiscountPercent != null && (
              <Text style={styles.discountRatesText}>
                {t("referrals.invitedDiscount")}: %{clinicDiscountRates.defaultInvitedDiscountPercent}
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t("referrals.referralStatus")}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{pendingCount}</Text>
            <Text style={styles.statLabel}>{t("referrals.pending")}</Text>
          </View>

          <View style={styles.statBox}>
            <Text style={styles.statValue}>{approvedCount}</Text>
            <Text style={styles.statLabel}>{t("referrals.approved")}</Text>
          </View>
        </View>

        <View style={{ height: 8 }} />

        {referrals.length === 0 ? (
          <Text style={styles.emptyText}>
            {t("referrals.noReferrals")}
          </Text>
        ) : (
          <View style={{ gap: 10 }}>
            {referrals.map((r, index) => {
              const role = getReferralRole(r);
              const displayName = getReferralDisplayName(r);
              const discountPercent = getDiscountPercent(r);
              const isInviter = role === "inviter";
              
              console.log(`[REFERRALS] Rendering referral ${index + 1}/${referrals.length}:`, {
                id: r.id,
                status: r.status,
                role,
                displayName,
                discountPercent,
                inviterPatientId: r.inviterPatientId,
                invitedPatientId: r.invitedPatientId,
                createdAt: r.createdAt,
              });
              
              return (
                <View key={r.id} style={styles.refItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.refName}>{displayName}</Text>
                    <Text style={styles.refMeta}>
                      {isInviter ? t("referrals.youInvited") : t("referrals.invitedYou")} • {new Date(r.createdAt).toLocaleString(getLanguage() === "tr" ? "tr-TR" : "en-US")}
                    </Text>
                    {discountPercent !== null && discountPercent !== undefined && (
                      <Text style={styles.discountText}>
                        🎉 {t("referrals.discount")}: %{discountPercent}
                      </Text>
                    )}
                  </View>

                  <StatusPill status={r.status} />
                </View>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function StatusPill({ status }: { status: ReferralStatus }) {
  // Normalize status to uppercase for comparison
  const normalizedStatus = (status || "").toUpperCase();
  
  const label =
    normalizedStatus === "PENDING"
      ? t("referrals.pending")
      : normalizedStatus === "APPROVED"
      ? t("referrals.approved")
      : t("referrals.rejected");

  return (
    <View
      style={[
        styles.pill,
        normalizedStatus === "PENDING" && styles.pillPending,
        normalizedStatus === "APPROVED" && styles.pillApproved,
        normalizedStatus === "REJECTED" && styles.pillRejected,
      ]}
    >
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 24, gap: 12 },
  title: { fontSize: 22, fontWeight: "900", color: "#111827" },
  subtitle: { fontSize: 14, color: "#6b7280", marginTop: 4, marginBottom: 8 },

  card: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    padding: 16,
    backgroundColor: "#fff",
    gap: 12,
  },

  cardTitle: { fontSize: 16, fontWeight: "900", color: "#111827" },

  codeBox: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },

  codeText: { fontSize: 24, fontWeight: "900", letterSpacing: 2, color: "#111827" },

  row: { flexDirection: "row", gap: 10 },

  btnPrimary: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "900", fontSize: 15 },

  btnSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  btnSecondaryText: { color: "#111827", fontWeight: "900", fontSize: 15 },

  linkBtn: { alignSelf: "flex-start", paddingVertical: 4 },
  linkText: { fontWeight: "900", color: "#2563eb", fontSize: 14 },

  helper: { fontSize: 12, color: "#6b7280", fontWeight: "700" },

  discountRatesBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#22c55e",
    borderRadius: 10,
    gap: 6,
  },
  discountRatesTitle: {
    fontSize: 13,
    fontWeight: "900",
    color: "#059669",
    marginBottom: 4,
  },
  discountRatesText: {
    fontSize: 12,
    color: "#047857",
    fontWeight: "700",
  },

  statsRow: { flexDirection: "row", gap: 10 },
  statBox: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  statValue: { fontSize: 24, fontWeight: "900", color: "#111827" },
  statLabel: { fontSize: 12, fontWeight: "800", color: "#6b7280", marginTop: 4 },

  emptyText: { color: "#6b7280", fontWeight: "700", textAlign: "center", padding: 20 },

  refItem: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 14,
    gap: 12,
    backgroundColor: "#f9fafb",
  },
  refName: { fontWeight: "900", fontSize: 15, color: "#111827" },
  refMeta: { fontSize: 12, color: "#6b7280", fontWeight: "700", marginTop: 4 },
  discountText: {
    fontSize: 13,
    color: "#059669",
    fontWeight: "800",
    marginTop: 4,
  },

  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillPending: { backgroundColor: "#fff7ed", borderColor: "#f59e0b" },
  pillApproved: { backgroundColor: "#f0fdf4", borderColor: "#22c55e" },
  pillRejected: { backgroundColor: "#fef2f2", borderColor: "#ef4444" },
  pillText: { fontWeight: "900", color: "#111827", fontSize: 12 },
});
