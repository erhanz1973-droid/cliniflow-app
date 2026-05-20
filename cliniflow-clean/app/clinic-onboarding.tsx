/**
 * "Find a clinic" — lists active clinics from GET /api/patient/clinics.
 * Route: /clinic-onboarding
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { buildJoinClinicPatchBody } from "../../lib/patientJoinClinic";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";
import { saveSelectedChatClinic } from "../lib/selectedChatClinic";
import { useLanguage } from "../lib/language-context";
import { formatClinicCityLabel } from "../lib/clinicCityDisplay";
import { resolveCityCode } from "../lib/cityCodes";

/** Same key as patient messages (preferred country filter for “all” list). */
const PREFERRED_DESTINATION_KEY = "@clinifly:preferredDestination";

/** Set `true` when GET /api/clinics/nearby is verified in production. */
const isNearbyEnabled = false;

const NEARBY_COMING_SOON_LABEL = "Yakındaki klinikler (yakında aktif olacak)";

type ListMode = "nearby" | "all";

type ClinicRow = {
  id: string;
  name: string;
  city?: string | null;
  country?: string | null;
  clinicCode?: string | null;
  rating?: number | null;
  /** Present when loaded from GET /api/clinics/nearby */
  distance_km?: number | null;
  /** Sunucudan gelirse kullanılır; yoksa yerel etiketlerle aynı anlam */
  links?: { id: string; label: string; clinicId?: string; clinicCode?: string | null }[];
};

/** Real GPS only — no fake coords (nearby mode falls back to “all” list if null). */
async function getDeviceCoords(): Promise<{ lat: number; lng: number } | null> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return null;
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** ISO-2 country for API, or "" when "nearby" / unset. */
async function resolvePreferredCountry(): Promise<string> {
  try {
    const raw = (await AsyncStorage.getItem(PREFERRED_DESTINATION_KEY))?.trim() || "";
    if (!raw || raw === "nearby") return "";
    if (/^[A-Z]{2}$/i.test(raw)) return raw.toUpperCase();
  } catch {
    // ignore
  }
  return "";
}

export default function ClinicOnboardingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, currentLanguage } = useLanguage();
  const { user, signIn } = useAuth();
  const token = user?.token ?? "";
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [joiningCode, setJoiningCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [listMode, setListMode] = useState<ListMode>(isNearbyEnabled ? "nearby" : "all");

  /** Stable translated strings — avoid redundant `t` work on unrelated state churn. */
  const headerCopy = useMemo(
    () => ({
      find_clinic: t("find_clinic"),
      nearby: t("nearby"),
      all_clinics: t("all_clinics"),
      search_clinic: t("search_clinic"),
      get_offer: t("get_offer"),
      sign_up: t("sign_up"),
      back: t("requests.back"),
      no_match_search: t("clinic_list.no_match_search"),
      header_nearby_intro: t("clinic_list.header_nearby_intro"),
      header_all_intro: t("clinic_list.header_all_intro"),
    }),
    [t, currentLanguage],
  );

  const filteredClinics = useMemo(() => {
    const qRaw = searchQuery.trim();
    const q = qRaw.toLowerCase();
    const qCanon = resolveCityCode(qRaw);
    if (!q) return clinics;
    return clinics.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const city = (c.city || "").toLowerCase();
      const country = (c.country || "").toLowerCase();
      const code = (c.clinicCode || "").toLowerCase();
      const cityCanonMatch =
        Boolean(qCanon) && resolveCityCode(c.city) === qCanon;
      return (
        name.includes(q) ||
        city.includes(q) ||
        country.includes(q) ||
        code.includes(q) ||
        cityCanonMatch
      );
    });
  }, [clinics, searchQuery]);

  const joinClinic = useCallback(
    async (code: string) => {
      if (!user?.token || user.type !== "patient") return;
      setJoiningCode(code);
      try {
        const res = await fetch(`${API_BASE}/api/patient/clinic`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(buildJoinClinicPatchBody(code, undefined)),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          token?: string;
          clinic?: { id: string; name?: string; clinic_code?: string };
        };
        if (!data.ok) {
          if (data.error === "clinic_not_found") {
            throw new Error("Klinik bulunamadı.");
          }
          throw new Error(data.error || "Katılım başarısız.");
        }
        await signIn({
          ...user,
          token: data.token || user.token,
          clinicId: data.clinic?.id,
          clinicCode: data.clinic?.clinic_code || code,
          type: "patient",
        });
        if (data.clinic?.id) {
          await saveSelectedChatClinic({
            id: String(data.clinic.id),
            clinic_code: data.clinic?.clinic_code || code,
            name: data.clinic?.name,
          });
        }
        Alert.alert(
          "✅ " + (data.clinic?.name || "Klinik"),
          "Kliniğe başarıyla katıldınız.",
          [{ text: "Tamam", onPress: () => router.back() }]
        );
      } catch (e: unknown) {
        Alert.alert("Hata", e instanceof Error ? e.message : "İşlem başarısız.");
      } finally {
        setJoiningCode(null);
      }
    },
    [user, signIn, router]
  );

  const handleJoinClinicPress = useCallback(
    (item: ClinicRow) => {
      if (user?.type !== "patient") {
        Alert.alert("Bilgi", "Klinik seçimi yalnızca hasta hesapları için geçerlidir.");
        return;
      }
      if (!item.clinicCode) {
        Alert.alert(
          "Klinik kodu yok",
          "Bu kayıtta klinik kodu listelenmiyor. Profil > Klinik kodu ile katıl bölümünden kodu girebilirsiniz.",
          [
            { text: "Tamam", style: "cancel" },
            {
              text: "Profile git",
              onPress: () => router.push("/(patient)/profile" as any),
            },
          ]
        );
        return;
      }
      if (user.clinicId) {
        Alert.alert(
          "Zaten bir kliniğe bağlısınız",
          "Klinik değiştirmek için önce Profil üzerinden mevcut klinikten ayrılın.",
          [
            { text: "Tamam", style: "cancel" },
            {
              text: "Profil",
              onPress: () => router.push("/(patient)/profile" as any),
            },
          ]
        );
        return;
      }
      Alert.alert(
        "Kliniğe katıl",
        `${item.name}\nKod: ${item.clinicCode}\n\nBu kliniğe katılmak istiyor musunuz?`,
        [
          { text: "Vazgeç", style: "cancel" },
          {
            text: "Katıl",
            onPress: () => void joinClinic(item.clinicCode!),
          },
        ]
      );
    },
    [user, joinClinic, router]
  );

  const handleRequestQuotePress = useCallback(
    (item: ClinicRow) => {
      if (user?.type !== "patient") {
        Alert.alert(t("common.info"), t("clinic_list.quote_need_patient"));
        return;
      }
      const payload = [
        {
          id: item.id,
          clinic_code: item.clinicCode || "",
          name: item.name,
          city: item.city ?? null,
          address: null as string | null,
        },
      ];
      router.push({
        pathname: "/quote-request",
        params: {
          clinics: encodeURIComponent(JSON.stringify(payload)),
        },
      } as any);
    },
    [user, router, t]
  );

  const load = useCallback(async () => {
    if (!token) {
      setError("Oturum bulunamadı. Lütfen yeniden giriş yapın.");
      setLoading(false);
      return;
    }
    setError(null);
    setStatusMessage(null);
    setLoading(true);
    try {
      const country = await resolvePreferredCountry();
      const authHeaders = { Authorization: `Bearer ${token}` };
      let list: ClinicRow[] = [];
      let msg: string | null = null;

      const fetchAll = async (): Promise<ClinicRow[]> => {
        const qs = new URLSearchParams();
        if (country) qs.set("country", country);
        const suffix = qs.toString() ? `?${qs.toString()}` : "";
        const res = await fetch(`${API_BASE}/api/patient/clinics${suffix}`, {
          headers: authHeaders,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: string;
          clinics?: ClinicRow[];
        };
        if (!res.ok || !data.ok) {
          const errMsg =
            (typeof data.message === "string" && data.message) ||
            (data.error === "db_error"
              ? "Klinik listesi şu an yüklenemiyor. Lütfen biraz sonra tekrar deneyin."
              : "") ||
            data.error ||
            `HTTP ${res.status}`;
          throw new Error(errMsg);
        }
        return Array.isArray(data.clinics) ? data.clinics : [];
      };

      const effectiveListMode = isNearbyEnabled ? listMode : "all";

      if (effectiveListMode === "all") {
        list = await fetchAll();
      } else {
        const coords = await getDeviceCoords();
        if (!coords) {
          list = await fetchAll();
          msg = t("clinic_list.msg_location_fallback", {
            nearby: t("nearby"),
          });
        } else {
          const qs = new URLSearchParams({
            lat: String(coords.lat),
            lng: String(coords.lng),
            radius: "10",
          });
          const res = await fetch(`${API_BASE}/api/clinics/nearby?${qs.toString()}`, {
            headers: authHeaders,
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            error?: string;
            clinics?: ClinicRow[];
          };
          if (!res.ok || !data.ok) {
            throw new Error(data.error || `HTTP ${res.status}`);
          }
          list = Array.isArray(data.clinics) ? data.clinics : [];
          if (list.length === 0) {
            msg = t("clinic_list.msg_empty_nearby", {
              all_clinics: t("all_clinics"),
            });
          }
        }
      }

      setStatusMessage(msg);
      setClinics(list);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Liste yüklenemedi");
      setClinics([]);
      setStatusMessage(null);
    } finally {
      setLoading(false);
    }
  }, [token, listMode, t, isNearbyEnabled]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        <View
          style={[
            styles.header,
            { paddingTop: Math.max(insets.top, 8) + 4 },
          ]}
        >
          <View style={styles.headerNavRow}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.headerBack}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={headerCopy.back}
            >
              <Text style={styles.headerBackText}>← {headerCopy.back}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.headerTitle}>{headerCopy.find_clinic}</Text>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[
                styles.modeChip,
                isNearbyEnabled && listMode === "nearby" && styles.modeChipActive,
                !isNearbyEnabled && styles.modeChipDisabled,
              ]}
              onPress={() =>
                !isNearbyEnabled
                  ? Alert.alert("Bu özellik yakında aktif olacak")
                  : setListMode("nearby")
              }
              activeOpacity={isNearbyEnabled ? 0.8 : 1}
              accessibilityRole="button"
              accessibilityState={{ disabled: !isNearbyEnabled }}
              accessibilityHint={!isNearbyEnabled ? NEARBY_COMING_SOON_LABEL : undefined}
            >
              <Text
                numberOfLines={2}
                style={[
                  styles.modeChipText,
                  isNearbyEnabled && listMode === "nearby" && styles.modeChipTextActive,
                  !isNearbyEnabled && styles.modeChipTextDisabled,
                ]}
              >
                {!isNearbyEnabled ? NEARBY_COMING_SOON_LABEL : `${headerCopy.nearby} (10 km)`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeChip, listMode === "all" && styles.modeChipActive]}
              onPress={() => setListMode("all")}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeChipText, listMode === "all" && styles.modeChipTextActive]}>
                {headerCopy.all_clinics}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {loading && clinics.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.muted}>
              {statusMessage || "Klinikler yükleniyor…"}
            </Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.err}>{error}</Text>
            <TouchableOpacity style={styles.retry} onPress={() => void load()}>
              <Text style={styles.retryText}>Yeniden dene</Text>
            </TouchableOpacity>
          </View>
        ) : clinics.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>
              {statusMessage || "Henüz kayıtlı klinik yok"}
            </Text>
            <Text style={styles.muted}>
              {statusMessage
                ? "Aktif klinikler eklendikçe burada görünecek; klinik kodu ile de katılabilirsiniz."
                : "Aktif klinikler burada listelenir. Yakında daha fazla seçenek eklenecek veya klinik kodu ile katılabilirsiniz."}
            </Text>
          </View>
        ) : (
          <View style={styles.listSection}>
            <View style={styles.field}>
              <Text style={styles.label}>{headerCopy.search_clinic}</Text>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>
            <FlatList
              data={filteredClinics}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl refreshing={loading} onRefresh={() => void load()} />
              }
              contentContainerStyle={styles.listPad}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <View style={styles.cardRow}>
                    <View style={styles.cardText}>
                      <Text style={styles.name}>{item.name}</Text>
                      <Text style={styles.sub}>
                        {[
                          item.city ? formatClinicCityLabel(item.city, t) : null,
                          item.country || null,
                        ]
                          .filter((p): p is string => Boolean(p && String(p).trim() && p !== "—"))
                          .join(", ") || "—"}
                        {item.clinicCode ? ` · ${item.clinicCode}` : ""}
                        {item.distance_km != null ? ` · 📍 ${item.distance_km} km` : ""}
                      </Text>
                      {item.rating != null && (
                        <Text style={styles.rating}>★ {item.rating.toFixed(1)}</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.actionLink}
                      onPress={() => handleRequestQuotePress(item)}
                      accessibilityRole="button"
                      accessibilityLabel={
                        item.links?.find((l) => l.id === "request_quote")?.label || headerCopy.get_offer
                      }
                    >
                      <Text style={styles.actionLinkText}>
                        {item.links?.find((l) => l.id === "request_quote")?.label || headerCopy.get_offer}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.actionSep}>·</Text>
                    <TouchableOpacity
                      style={styles.actionLink}
                      onPress={() => handleJoinClinicPress(item)}
                      disabled={joiningCode === item.clinicCode}
                      accessibilityRole="button"
                      accessibilityLabel={
                        item.links?.find((l) => l.id === "join_clinic")?.label || headerCopy.sign_up
                      }
                    >
                      <Text style={styles.actionLinkText}>
                        {item.links?.find((l) => l.id === "join_clinic")?.label || headerCopy.sign_up}
                      </Text>
                    </TouchableOpacity>
                    {joiningCode === item.clinicCode ? (
                      <ActivityIndicator size="small" color="#2563eb" style={styles.cardSpinner} />
                    ) : null}
                  </View>
                </View>
              )}
              ListHeaderComponent={
                <Text style={styles.hint}>
                  {listMode === "nearby" && isNearbyEnabled
                    ? headerCopy.header_nearby_intro
                    : headerCopy.header_all_intro}
                  {filteredClinics.length === clinics.length
                    ? t("clinic_list.footer_hint", {
                        count: String(clinics.length),
                        get_offer: headerCopy.get_offer,
                        sign_up: headerCopy.sign_up,
                      })
                    : t("clinic_list.filter_result_hint", {
                        filtered: String(filteredClinics.length),
                        total: String(clinics.length),
                      })}
                </Text>
              }
              ListEmptyComponent={
                searchQuery.trim() ? (
                  <Text style={styles.emptyFilter}>{headerCopy.no_match_search}</Text>
                ) : null
              }
            />
          </View>
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  headerNavRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    minHeight: 36,
  },
  headerBack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingRight: 12,
  },
  headerBackText: { fontSize: 16, color: "#2563eb", fontWeight: "600" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#0f172a" },
  modeRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  modeChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
    alignItems: "center",
  },
  modeChipActive: {
    borderColor: "#2563eb",
    backgroundColor: "#eff6ff",
  },
  modeChipDisabled: {
    borderColor: "#e2e8f0",
    backgroundColor: "#f1f5f9",
    opacity: 0.85,
  },
  modeChipText: { fontSize: 13, fontWeight: "600", color: "#64748b", textAlign: "center" },
  modeChipTextActive: { color: "#1d4ed8" },
  modeChipTextDisabled: { color: "#94a3b8", fontWeight: "500", fontSize: 12 },
  listSection: { flex: 1 },
  field: { marginHorizontal: 16, marginBottom: 8, gap: 6 },
  label: { fontSize: 13, color: "#94a3b8" },
  searchInput: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    fontSize: 16,
    color: "#0f172a",
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  muted: { marginTop: 8, color: "#64748b", textAlign: "center", fontSize: 14 },
  err: { color: "#b91c1c", textAlign: "center", marginBottom: 12 },
  retry: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: { color: "#fff", fontWeight: "600" },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#0f172a", marginBottom: 8 },
  listPad: { paddingHorizontal: 16, paddingBottom: 28 },
  hint: { fontSize: 13, color: "#64748b", marginBottom: 12, lineHeight: 18 },
  emptyFilter: { textAlign: "center", color: "#64748b", paddingVertical: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardText: { flex: 1, paddingRight: 8 },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  actionLink: { paddingVertical: 4, paddingHorizontal: 2 },
  actionLinkText: { fontSize: 15, fontWeight: "700", color: "#2563eb" },
  actionSep: { marginHorizontal: 6, color: "#cbd5e1", fontSize: 18 },
  cardSpinner: { marginLeft: 8 },
  name: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  sub: { fontSize: 13, color: "#64748b", marginTop: 4 },
  rating: { fontSize: 13, color: "#ca8a04", marginTop: 6, fontWeight: "600" },
});
