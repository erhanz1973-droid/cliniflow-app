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
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";
import { saveSelectedChatClinic } from "../lib/selectedChatClinic";

/** Same key as patient messages (preferred country / "nearby"). */
const PREFERRED_DESTINATION_KEY = "@clinifly:preferredDestination";

/** When GPS is unavailable — Tbilisi (sensible default for regional listings). */
const DEFAULT_LOCATION = {
  lat: 41.7151,
  lng: 44.8271,
};

type ClinicRow = {
  id: string;
  name: string;
  city?: string | null;
  country?: string | null;
  clinicCode?: string | null;
  rating?: number | null;
  /** Sunucudan gelirse kullanılır; yoksa yerel etiketlerle aynı anlam */
  links?: { id: string; label: string; clinicId?: string; clinicCode?: string | null }[];
};

async function resolveSearchCoords(): Promise<{ lat: number; lng: number }> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      return { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng };
    }
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat, lng };
    }
  } catch {
    // use default
  }
  return { lat: DEFAULT_LOCATION.lat, lng: DEFAULT_LOCATION.lng };
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
  const { user, signIn } = useAuth();
  const token = user?.token ?? "";
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [joiningCode, setJoiningCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const filteredClinics = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return clinics;
    return clinics.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const city = (c.city || "").toLowerCase();
      const country = (c.country || "").toLowerCase();
      const code = (c.clinicCode || "").toLowerCase();
      return (
        name.includes(q) ||
        city.includes(q) ||
        country.includes(q) ||
        code.includes(q)
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
          body: JSON.stringify({ clinic_code: code.trim().toUpperCase() }),
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
        Alert.alert("Bilgi", "Teklif almak için hasta hesabıyla giriş yapın.");
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
    [user, router]
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
      const { lat, lng } = await resolveSearchCoords();
      const country = await resolvePreferredCountry();

      const qs1 = new URLSearchParams();
      qs1.set("lat", String(lat));
      qs1.set("lng", String(lng));
      if (country) qs1.set("country", country);

      const res = await fetch(`${API_BASE}/api/patient/clinics?${qs1.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
        clinics?: ClinicRow[];
      };
      if (!res.ok || !data.ok) {
        const msg =
          (typeof data.message === "string" && data.message) ||
          (data.error === "db_error"
            ? "Klinik listesi şu an yüklenemiyor. Lütfen biraz sonra tekrar deneyin."
            : "") ||
          data.error ||
          `HTTP ${res.status}`;
        throw new Error(msg);
      }
      let list = Array.isArray(data.clinics) ? data.clinics : [];

      if (list.length === 0) {
        setStatusMessage("Yakınında klinik bulunamadı. Daha geniş bölgede arıyoruz...");
        const qs2 = new URLSearchParams();
        if (country) qs2.set("country", country);
        const suffix = qs2.toString() ? `?${qs2.toString()}` : "";
        const res2 = await fetch(`${API_BASE}/api/patient/clinics${suffix}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data2 = (await res2.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          message?: string;
          clinics?: ClinicRow[];
        };
        if (!res2.ok || !data2.ok) {
          const msg =
            (typeof data2.message === "string" && data2.message) ||
            (data2.error === "db_error"
              ? "Klinik listesi şu an yüklenemiyor. Lütfen biraz sonra tekrar deneyin."
              : "") ||
            data2.error ||
            `HTTP ${res2.status}`;
          throw new Error(msg);
        }
        list = Array.isArray(data2.clinics) ? data2.clinics : [];
      }

      if (list.length > 0) {
        setStatusMessage(null);
      }
      setClinics(list);
    } catch (e: any) {
      setError(e?.message || "Liste yüklenemedi");
      setClinics([]);
      setStatusMessage(null);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Klinik bul</Text>
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
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="İsim, şehir, ülke veya klinik kodu ara…"
              placeholderTextColor="#94a3b8"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
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
                        {[item.city, item.country].filter(Boolean).join(", ") || "—"}
                        {item.clinicCode ? ` · ${item.clinicCode}` : ""}
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
                        item.links?.find((l) => l.id === "request_quote")?.label || "Teklif al"
                      }
                    >
                      <Text style={styles.actionLinkText}>
                        {item.links?.find((l) => l.id === "request_quote")?.label || "Teklif al"}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.actionSep}>·</Text>
                    <TouchableOpacity
                      style={styles.actionLink}
                      onPress={() => handleJoinClinicPress(item)}
                      disabled={joiningCode === item.clinicCode}
                      accessibilityRole="button"
                      accessibilityLabel={
                        item.links?.find((l) => l.id === "join_clinic")?.label || "Kaydol"
                      }
                    >
                      <Text style={styles.actionLinkText}>
                        {item.links?.find((l) => l.id === "join_clinic")?.label || "Kaydol"}
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
                  {filteredClinics.length === clinics.length
                    ? `${clinics.length} klinik. Teklif al veya Kaydol ile devam edin.`
                    : `${filteredClinics.length} / ${clinics.length} sonuç (filtreli).`}
                </Text>
              }
              ListEmptyComponent={
                searchQuery.trim() ? (
                  <Text style={styles.emptyFilter}>Aramanızla eşleşen klinik yok.</Text>
                ) : null
              }
            />
          </View>
        )}

        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Text style={styles.backText}>← Geri</Text>
        </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    paddingTop: 56,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#0f172a" },
  listSection: { flex: 1 },
  searchInput: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
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
  listPad: { paddingHorizontal: 16, paddingBottom: 100 },
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
  back: { position: "absolute", bottom: 24, left: 16 },
  backText: { fontSize: 16, color: "#2563eb", fontWeight: "600" },
});
