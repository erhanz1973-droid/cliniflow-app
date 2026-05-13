import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Image,
  Linking,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const DEFAULT_LOGO =
  "https://ui-avatars.com/api/?name=+&background=e5e7eb&color=374151&size=128&rounded=true";

export type ClinicHubCardProps = {
  clinicName: string;
  logoUri?: string | null;
  /** City / country (or address snippet · country) */
  subtitle?: string | null;
  primaryColor: string;
  phone?: string | null;
  /** Clinic Settings maps URL (or runtime address-search fallback) */
  mapsUrl?: string | null;
  leavingClinic: boolean;
  onLeaveClinic: () => void;
  onOpenMessages: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
};

export function ClinicHubCard({
  clinicName,
  logoUri,
  subtitle,
  primaryColor,
  phone,
  mapsUrl,
  leavingClinic,
  onLeaveClinic,
  onOpenMessages,
  t,
}: ClinicHubCardProps) {
  const [logoBroken, setLogoBroken] = useState(false);

  useEffect(() => {
    setLogoBroken(false);
  }, [logoUri]);

  const openMaps = useCallback(() => {
    const u = String(mapsUrl || "").trim();
    if (!u) return;
    Linking.openURL(u).catch(() => {});
  }, [mapsUrl]);

  const dialPhone = useCallback(() => {
    if (!phone) return;
    const raw = String(phone).replace(/\s+/g, "");
    Linking.openURL(`tel:${raw}`).catch(() => {});
  }, [phone]);

  const openWhatsApp = useCallback(() => {
    if (!phone) return;
    const digits = String(phone).replace(/[^\d+]/g, "");
    const wa = digits.startsWith("+") ? digits.slice(1) : digits;
    if (!wa) return;
    Linking.openURL(`https://wa.me/${wa}`).catch(() => {});
  }, [phone]);

  const openOptionsMenu = useCallback(() => {
    Alert.alert(t("home.clinicHubOptionsTitle"), undefined, [
      {
        text: t("profile.leaveClinic.title"),
        style: "destructive",
        onPress: onLeaveClinic,
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [t, onLeaveClinic]);

  const showDirections = Boolean(String(mapsUrl || "").trim());
  const showCall = Boolean(String(phone || "").trim());
  const showWhatsApp = showCall;
  const tint = primaryColor || "#2563eb";
  const logoSrc = logoBroken || !String(logoUri || "").trim() ? DEFAULT_LOGO : String(logoUri).trim();

  return (
    <View
      style={[styles.wrap, { borderColor: `${tint}22` }]}
      testID="patient-clinic-hub-card"
      accessibilityLabel={clinicName}
    >
      <View style={[styles.accentBar, { backgroundColor: tint }]} />

      <View style={styles.headerRow}>
        <View style={[styles.logoRing, { borderColor: `${tint}35` }]}>
          <Image
            source={{ uri: logoSrc }}
            style={styles.logo}
            resizeMode="cover"
            onError={() => setLogoBroken(true)}
          />
        </View>
        <View style={styles.headerCenter}>
          <Text style={styles.clinicName} numberOfLines={2}>
            {clinicName}
          </Text>
          <View style={styles.metaRow}>
            <Ionicons name="location-outline" size={14} color="#64748b" />
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle || "—"}
            </Text>
          </View>
          <View style={styles.metaRow}>
            <Ionicons name="call-outline" size={14} color="#64748b" />
            <Text style={styles.phoneText} numberOfLines={1}>
              {showCall ? String(phone) : "—"}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={openOptionsMenu}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("home.clinicHubMore")}
          style={({ pressed }) => [styles.dotBtn, pressed && styles.dotBtnPressed]}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color="#475569" />
        </Pressable>
      </View>

      <View style={styles.quickRow}>
        <Pressable
          onPress={showDirections ? openMaps : undefined}
          disabled={!showDirections}
          style={({ pressed }) => [
            styles.quickChip,
            !showDirections && styles.chipDisabled,
            pressed && showDirections && styles.chipPressed,
          ]}
        >
          <Ionicons name="navigate-outline" size={14} color={showDirections ? tint : "#94a3b8"} />
          <Text style={[styles.quickChipText, { color: showDirections ? tint : "#94a3b8" }]}>
            {t("home.clinicHubDirections")}
          </Text>
        </Pressable>
        <Pressable
          onPress={showCall ? dialPhone : undefined}
          disabled={!showCall}
          style={({ pressed }) => [
            styles.quickChip,
            !showCall && styles.chipDisabled,
            pressed && showCall && styles.chipPressed,
          ]}
        >
          <Ionicons name="call-outline" size={14} color={showCall ? tint : "#94a3b8"} />
          <Text style={[styles.quickChipText, { color: showCall ? tint : "#94a3b8" }]}>
            {t("home.clinicHubCall")}
          </Text>
        </Pressable>
        <Pressable
          onPress={showWhatsApp ? openWhatsApp : undefined}
          disabled={!showWhatsApp}
          style={({ pressed }) => [
            styles.quickChip,
            !showWhatsApp && styles.chipDisabled,
            pressed && showWhatsApp && styles.chipPressed,
          ]}
        >
          <Ionicons name="logo-whatsapp" size={14} color={showWhatsApp ? tint : "#94a3b8"} />
          <Text style={[styles.quickChipText, { color: showWhatsApp ? tint : "#94a3b8" }]}>
            WhatsApp
          </Text>
        </Pressable>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={onOpenMessages}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.actionBtnPrimary,
            { borderColor: tint, backgroundColor: `${tint}12` },
            pressed && styles.actionBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t("home.clinicHubMessage")}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={16} color={tint} />
          <Text style={[styles.actionLabel, { color: tint }]} numberOfLines={1}>
            {t("home.clinicHubMessage")}
          </Text>
        </Pressable>
        <Pressable
          onPress={openOptionsMenu}
          style={({ pressed }) => [
            styles.actionBtn,
            styles.actionBtnSecondary,
            { borderColor: "#cbd5e1", backgroundColor: "#fff" },
            pressed && styles.actionBtnPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t("home.clinicHubMore")}
        >
          <Ionicons name="ellipsis-horizontal" size={16} color="#64748b" />
          <Text style={[styles.actionLabel, { color: "#64748b" }]} numberOfLines={1}>
            {t("home.clinicHubMore")}
          </Text>
        </Pressable>
      </View>

      {leavingClinic ? (
        <View style={styles.leaving}>
          <ActivityIndicator size="small" color="#dc2626" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    backgroundColor: "#ffffff",
    paddingTop: 0,
    paddingBottom: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.07,
    shadowRadius: 18,
    elevation: 4,
    overflow: "hidden",
  },
  accentBar: {
    height: 3,
    width: "100%",
    opacity: 0.9,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginTop: 12,
  },
  logoRing: {
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 2,
    backgroundColor: "#f8fafc",
  },
  logo: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
  },
  clinicName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    letterSpacing: -0.35,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 3,
  },
  subtitle: {
    fontSize: 12,
    color: "#475569",
    fontWeight: "600",
    lineHeight: 16,
    flex: 1,
  },
  phoneText: {
    fontSize: 12,
    color: "#334155",
    fontWeight: "700",
    flex: 1,
  },
  dotBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f1f5f9",
  },
  dotBtnPressed: {
    opacity: 0.88,
  },
  quickRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    gap: 8,
    marginTop: 10,
  },
  quickChip: {
    flex: 1,
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#f8fafc",
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  chipDisabled: {
    opacity: 0.55,
  },
  chipPressed: {
    opacity: 0.9,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexDirection: "row",
    backgroundColor: "#fff",
  },
  actionBtnPrimary: {
    flex: 1.2,
  },
  actionBtnSecondary: {
    flex: 0.8,
  },
  actionBtnPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  leaving: {
    alignItems: "center",
    paddingTop: 10,
  },
});
