import React, { useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import type { DiscoveryClinicCard } from "../../lib/clinicDiscoveryTypes";
import { formatClinicCityLabel } from "../../lib/clinicCityDisplay";
import { formatCountryDisplay } from "../../lib/countryDisplay";
import { ClinicSocialLinks } from "./ClinicSocialLinks";
import { ClinicLogo } from "./ClinicLogo";
import { normalizeExternalUrl } from "../../lib/normalizeExternalUrl";

type Props = {
  clinic: DiscoveryClinicCard;
  t: (key: string, params?: Record<string, string | number>) => string;
  joining?: boolean;
  onViewProfile: () => void;
  onSendPhotos: () => void;
  onChat: () => void;
  onTreatmentPlan: () => void;
  onMap: () => void;
  onJoin?: () => void;
};

function formatRating(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return value.toFixed(1);
}

export function ClinicDiscoveryCard({
  clinic,
  t,
  joining,
  onViewProfile,
  onSendPhotos,
  onChat,
  onTreatmentPlan,
  onMap,
  onJoin,
}: Props) {
  const locationParts = [
    clinic.city ? formatClinicCityLabel(clinic.city, t) : null,
    clinic.country ? formatCountryDisplay(clinic.country) : null,
  ].filter((p): p is string => Boolean(p && p !== "—"));

  const googleRating = clinic.googleRating ?? clinic.rating ?? null;

  const openUrl = useCallback(
    (url: string) => {
      const normalized = normalizeExternalUrl(url);
      if (!normalized) return;
      void Linking.openURL(normalized).catch(() =>
        Alert.alert(t("common.error"), t("discovery.linkFailed")),
      );
    },
    [t],
  );

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <ClinicLogo logoUrl={clinic.logoUrl} name={clinic.name} size={56} />
        <View style={styles.headerText}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={2}>
              {clinic.name}
            </Text>
            {clinic.isVerified ? (
              <View style={styles.verifiedBadge}>
                <Text style={styles.verifiedText}>{t("discovery.verified")}</Text>
              </View>
            ) : null}
          </View>
          {locationParts.length > 0 ? (
            <Text style={styles.location}>{locationParts.join(" · ")}</Text>
          ) : null}
        </View>
      </View>

      <ClinicSocialLinks
        style={styles.socialRow}
        sectionTitle={t("discovery.contactLinks")}
        links={{
          websiteUrl: clinic.websiteUrl,
          facebookUrl: clinic.facebookUrl,
          instagramUrl: clinic.instagramUrl,
          tiktokUrl: clinic.tiktokUrl,
          linkedinUrl: clinic.linkedinUrl,
          youtubeUrl: clinic.youtubeUrl,
          googleReviewsUrl: clinic.googleReviewsUrl,
          googleMapsUrl: clinic.googleMapsUrl,
        }}
        onOpen={openUrl}
        labels={{
          website: t("discovery.website"),
          facebook: "Facebook",
          instagram: "Instagram",
          tiktok: "TikTok",
          linkedin: "LinkedIn",
          youtube: "YouTube",
          google: t("discovery.googleReviews"),
          map: t("discovery.viewMap"),
        }}
      />

      {googleRating != null || clinic.trustpilotRating != null ? (
        <View style={styles.ratingsRow}>
          {googleRating != null ? (
            <Text style={styles.ratingGoogle}>
              {t("discovery.googleRating", {
                rating: formatRating(googleRating),
                count:
                  clinic.googleReviewCount != null
                    ? String(clinic.googleReviewCount)
                    : "—",
              })}
            </Text>
          ) : null}
          {clinic.trustpilotRating != null ? (
            <Text style={styles.ratingTrust}>
              {t("discovery.trustpilotRating", {
                rating: formatRating(clinic.trustpilotRating),
                count:
                  clinic.trustpilotReviewCount != null
                    ? String(clinic.trustpilotReviewCount)
                    : "—",
              })}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actionsGrid}>
        <TouchableOpacity style={styles.actionBtn} onPress={onViewProfile}>
          <Text style={styles.actionBtnText}>{t("discovery.viewProfile")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onSendPhotos}>
          <Text style={styles.actionBtnText}>{t("discovery.sendPhotos")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onChat}>
          <Text style={styles.actionBtnText}>{t("discovery.chatClinic")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtnPrimary} onPress={onTreatmentPlan}>
          <Text style={styles.actionBtnPrimaryText}>{t("discovery.requestPlan")}</Text>
        </TouchableOpacity>
        {(clinic.googleMapsUrl || (clinic.latitude != null && clinic.longitude != null)) ? (
          <TouchableOpacity style={styles.actionBtn} onPress={onMap}>
            <Text style={styles.actionBtnText}>{t("discovery.viewMap")}</Text>
          </TouchableOpacity>
        ) : null}
        {onJoin ? (
          <TouchableOpacity
            style={styles.actionBtnOutline}
            onPress={onJoin}
            disabled={joining}
          >
            {joining ? (
              <ActivityIndicator size="small" color="#2563eb" />
            ) : (
              <Text style={styles.actionBtnOutlineText}>{t("sign_up")}</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  topRow: { flexDirection: "row", gap: 12 },
  headerText: { flex: 1 },
  nameRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  name: { fontSize: 17, fontWeight: "800", color: "#111827", flexShrink: 1 },
  verifiedBadge: {
    backgroundColor: "#ECFDF5",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#A7F3D0",
  },
  verifiedText: { fontSize: 11, fontWeight: "700", color: "#047857" },
  location: { marginTop: 4, fontSize: 13, color: "#6B7280" },
  ratingsRow: { marginTop: 10, gap: 4 },
  ratingGoogle: { fontSize: 13, fontWeight: "700", color: "#B45309" },
  ratingTrust: { fontSize: 12, fontWeight: "600", color: "#0F766E" },
  socialRow: { marginTop: 12, marginBottom: 4 },
  actionsGrid: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
  },
  actionBtnText: { fontSize: 12, fontWeight: "700", color: "#374151" },
  actionBtnPrimary: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#2563EB",
  },
  actionBtnPrimaryText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  actionBtnOutline: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2563EB",
    minWidth: 72,
    alignItems: "center",
  },
  actionBtnOutlineText: { fontSize: 12, fontWeight: "700", color: "#2563EB" },
});
