import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Linking,
  Alert,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLanguage } from "../../../lib/language-context";
import { useAuth } from "../../../lib/auth";
import { fetchDiscoveryClinicProfile } from "../../../lib/clinicDiscoveryApi";
import type { DiscoveryClinicProfile } from "../../../lib/clinicDiscoveryTypes";
import { formatCountryDisplay } from "../../../lib/countryDisplay";
import { formatClinicCityLabel } from "../../../lib/clinicCityDisplay";
import { saveSelectedChatClinic } from "../../../lib/selectedChatClinic";
import { openClinicCoordinationChat } from "../../../lib/patientCoordinationChat";

export default function DiscoveryClinicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [clinic, setClinic] = useState<DiscoveryClinicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clinicId = String(id || "").trim();

  const load = useCallback(async () => {
    if (!clinicId) {
      setError(t("discovery.profileNotFound"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const profile = await fetchDiscoveryClinicProfile(clinicId);
      setClinic(profile);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("common.error"));
      setClinic(null);
    } finally {
      setLoading(false);
    }
  }, [clinicId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openUrl = (url: string | null | undefined) => {
    const u = String(url || "").trim();
    if (!u) return;
    void Linking.openURL(u).catch(() =>
      Alert.alert(t("common.error"), t("discovery.linkFailed")),
    );
  };

  const goChat = async () => {
    if (!clinic) return;
    if (user?.type !== "patient") {
      Alert.alert(t("common.info"), t("clinic_list.quote_need_patient"));
      return;
    }
    const token = String(user?.token || "").trim();
    if (!token) {
      Alert.alert(t("common.info"), t("clinic_list.quote_need_patient"));
      return;
    }
    try {
      await saveSelectedChatClinic({
        id: clinic.id,
        clinic_code: clinic.clinicCode || undefined,
        name: clinic.name,
      });
      await openClinicCoordinationChat(router, {
        token,
        clinicId: clinic.id,
        clinicName: clinic.name,
        clinicCode: clinic.clinicCode || undefined,
      });
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      if (__DEV__) console.warn("[discovery-chat] open failed", code, e);
      if (code === "clinic_doctor_not_assigned") {
        Alert.alert(t("common.info"), t("treatment.doctorNotAssigned"));
        return;
      }
      Alert.alert(t("common.error"), t("common.pleaseRetry"));
    }
  };

  const goPhotos = () => {
    void goChat();
  };

  const goTreatmentPlan = () => {
    if (!clinic) return;
    const payload = [
      {
        id: clinic.id,
        clinic_code: clinic.clinicCode || "",
        name: clinic.name,
        city: clinic.city ?? null,
        address: clinic.address ?? null,
      },
    ];
    router.push({
      pathname: "/quote-request",
      params: { clinics: encodeURIComponent(JSON.stringify(payload)) },
    } as never);
  };

  const goMap = () => {
    if (!clinic) return;
    if (clinic.googleMapsUrl) {
      openUrl(clinic.googleMapsUrl);
      return;
    }
    if (clinic.latitude != null && clinic.longitude != null) {
      openUrl(`https://www.google.com/maps/search/?api=1&query=${clinic.latitude},${clinic.longitude}`);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </SafeAreaView>
    );
  }

  if (error || !clinic) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.err}>{error || t("discovery.profileNotFound")}</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>{t("common.back")}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const location = [
    clinic.city ? formatClinicCityLabel(clinic.city, t) : null,
    clinic.country ? formatCountryDisplay(clinic.country) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const photos = clinic.mediaGallery?.photos || [];
  const beforeAfter = clinic.mediaGallery?.beforeAfter || [];
  const videos = clinic.mediaGallery?.videos || [];

  const linkRows: { label: string; url: string | null | undefined }[] = [
    { label: t("discovery.website"), url: clinic.websiteUrl },
    { label: "Facebook", url: clinic.facebookUrl },
    { label: "Instagram", url: clinic.instagramUrl },
    { label: "TikTok", url: clinic.tiktokUrl },
    { label: "LinkedIn", url: clinic.linkedinUrl },
    { label: "WhatsApp", url: clinic.whatsapp },
    { label: t("discovery.phone"), url: clinic.phone ? `tel:${clinic.phone}` : null },
    { label: t("discovery.email"), url: clinic.email ? `mailto:${clinic.email}` : null },
    { label: t("discovery.googleReviews"), url: clinic.googleReviewsUrl },
    { label: "Trustpilot", url: clinic.trustpilotUrl },
  ];

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={styles.backText}>← {t("common.back")}</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          {clinic.logoUrl ? (
            <Image source={{ uri: clinic.logoUrl }} style={styles.heroLogo} />
          ) : (
            <View style={styles.heroLogoPh}>
              <Text style={styles.heroLetter}>{clinic.name.charAt(0)}</Text>
            </View>
          )}
          <View style={styles.heroText}>
            <Text style={styles.heroName}>{clinic.name}</Text>
            {clinic.isVerified ? (
              <Text style={styles.verified}>{t("discovery.verified")}</Text>
            ) : null}
            {location ? <Text style={styles.heroMeta}>{location}</Text> : null}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("discovery.reputation")}</Text>
          {clinic.googleRating != null ? (
            <Text style={styles.ratingLine}>
              {t("discovery.googleRating", {
                rating: clinic.googleRating.toFixed(1),
                count: String(clinic.googleReviewCount ?? "—"),
              })}
            </Text>
          ) : null}
          {clinic.trustpilotRating != null ? (
            <Text style={styles.ratingLine}>
              {t("discovery.trustpilotRating", {
                rating: clinic.trustpilotRating.toFixed(1),
                count: String(clinic.trustpilotReviewCount ?? "—"),
              })}
            </Text>
          ) : null}
        </View>

        {(clinic.aboutText || clinic.shortDescription) ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("discovery.about")}</Text>
            <Text style={styles.body}>{clinic.aboutText || clinic.shortDescription}</Text>
          </View>
        ) : null}

        {(clinic.services?.length || 0) > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("discovery.services")}</Text>
            <Text style={styles.body}>{clinic.services!.join(" · ")}</Text>
          </View>
        ) : null}

        {(clinic.technologies?.length || 0) > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("discovery.technologies")}</Text>
            <Text style={styles.body}>{clinic.technologies!.join(" · ")}</Text>
          </View>
        ) : null}

        {(clinic.languages?.length || 0) > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("discovery.languages")}</Text>
            <Text style={styles.body}>{clinic.languages!.join(" · ")}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("discovery.contactLinks")}</Text>
          {linkRows.map((row) =>
            row.url ? (
              <TouchableOpacity key={row.label} onPress={() => openUrl(row.url)}>
                <Text style={styles.linkRow}>{row.label}</Text>
              </TouchableOpacity>
            ) : null,
          )}
          {(clinic.googleMapsUrl || (clinic.latitude != null && clinic.longitude != null)) ? (
            <TouchableOpacity onPress={goMap}>
              <Text style={styles.linkRow}>{t("discovery.viewMap")}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {(clinic.team?.length || 0) > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("discovery.team")}</Text>
            {clinic.team!.map((doc) => (
              <View key={doc.id} style={styles.doctorRow}>
                {doc.photoUrl ? (
                  <Image source={{ uri: doc.photoUrl }} style={styles.docPhoto} />
                ) : (
                  <View style={styles.docPhotoPh}>
                    <Text style={styles.docLetter}>{doc.name.charAt(0)}</Text>
                  </View>
                )}
                <View style={styles.docInfo}>
                  <Text style={styles.docName}>{doc.name}</Text>
                  {doc.title ? <Text style={styles.docMeta}>{doc.title}</Text> : null}
                  {(doc.specialties?.length || 0) > 0 ? (
                    <Text style={styles.docMeta}>{doc.specialties!.join(" · ")}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {photos.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("discovery.clinicPhotos")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {photos.map((p, i) => (
                <Image
                  key={`p-${i}`}
                  source={{ uri: String(p.url || "") }}
                  style={styles.galleryImg}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {beforeAfter.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("discovery.beforeAfter")}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {beforeAfter.map((p, i) => (
                <Image
                  key={`ba-${i}`}
                  source={{ uri: String(p.url || "") }}
                  style={styles.galleryImg}
                />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {videos.length > 0 ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("discovery.videos")}</Text>
            {videos.map((v, i) => (
              <TouchableOpacity key={`v-${i}`} onPress={() => openUrl(String(v.url || ""))}>
                <Text style={styles.linkRow}>{v.title || v.caption || `Video ${i + 1}`}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <View style={styles.ctaRow}>
          <TouchableOpacity style={styles.ctaPrimary} onPress={goTreatmentPlan}>
            <Text style={styles.ctaPrimaryText}>{t("discovery.requestPlan")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cta} onPress={goChat}>
            <Text style={styles.ctaText}>{t("discovery.chatClinic")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cta} onPress={goPhotos}>
            <Text style={styles.ctaText}>{t("discovery.sendPhotos")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F9FAFB" },
  scroll: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  back: { marginBottom: 12 },
  backText: { fontSize: 16, fontWeight: "700", color: "#2563EB" },
  hero: { flexDirection: "row", gap: 14, marginBottom: 16 },
  heroLogo: { width: 72, height: 72, borderRadius: 14 },
  heroLogoPh: {
    width: 72,
    height: 72,
    borderRadius: 14,
    backgroundColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  heroLetter: { fontSize: 28, fontWeight: "800", color: "#1D4ED8" },
  heroText: { flex: 1 },
  heroName: { fontSize: 22, fontWeight: "800", color: "#111827" },
  verified: { marginTop: 4, fontSize: 12, fontWeight: "700", color: "#047857" },
  heroMeta: { marginTop: 6, fontSize: 14, color: "#6B7280" },
  section: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#111827", marginBottom: 8 },
  body: { fontSize: 14, color: "#374151", lineHeight: 21 },
  ratingLine: { fontSize: 14, fontWeight: "600", color: "#B45309", marginBottom: 4 },
  linkRow: { fontSize: 14, fontWeight: "600", color: "#2563EB", marginBottom: 8 },
  link: { color: "#2563EB", fontWeight: "700", marginTop: 12 },
  err: { color: "#DC2626", textAlign: "center", marginBottom: 12 },
  doctorRow: { flexDirection: "row", gap: 10, marginBottom: 12 },
  docPhoto: { width: 48, height: 48, borderRadius: 24 },
  docPhotoPh: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  docLetter: { fontWeight: "700", color: "#374151" },
  docInfo: { flex: 1 },
  docName: { fontWeight: "700", fontSize: 15, color: "#111827" },
  docMeta: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  galleryImg: { width: 140, height: 100, borderRadius: 8, marginRight: 8 },
  ctaRow: { gap: 10, marginTop: 8 },
  ctaPrimary: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
  },
  ctaPrimaryText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  cta: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  ctaText: { color: "#374151", fontWeight: "700", fontSize: 14 },
});
