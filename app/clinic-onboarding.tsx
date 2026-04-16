/**
 * "Find a clinic" — lists active clinics from GET /api/patient/clinics.
 * Route: /clinic-onboarding
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";

type ClinicRow = {
  id: string;
  name: string;
  city?: string | null;
  country?: string | null;
  clinicCode?: string | null;
  rating?: number | null;
};

export default function ClinicOnboardingScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const token = user?.token ?? "";
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setError("Oturum bulunamadı. Lütfen yeniden giriş yapın.");
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/patient/clinics`, {
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
      setClinics(Array.isArray(data.clinics) ? data.clinics : []);
    } catch (e: any) {
      setError(e?.message || "Liste yüklenemedi");
      setClinics([]);
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
            <Text style={styles.muted}>Klinikler yükleniyor…</Text>
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
            <Text style={styles.emptyTitle}>Henüz kayıtlı klinik yok</Text>
            <Text style={styles.muted}>
              Aktif klinikler burada listelenir. Yakında daha fazla seçenek
              eklenecek veya klinik kodu ile katılabilirsiniz.
            </Text>
          </View>
        ) : (
          <FlatList
            data={clinics}
            keyExtractor={(item) => item.id}
            refreshControl={
              <RefreshControl refreshing={loading} onRefresh={() => void load()} />
            }
            contentContainerStyle={styles.listPad}
            renderItem={({ item }) => (
              <View style={styles.card}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>
                  {[item.city, item.country].filter(Boolean).join(", ") || "—"}
                  {item.clinicCode ? ` · ${item.clinicCode}` : ""}
                </Text>
                {item.rating != null && (
                  <Text style={styles.rating}>★ {item.rating.toFixed(1)}</Text>
                )}
              </View>
            )}
            ListHeaderComponent={
              <Text style={styles.hint}>
                Kayıtlı {clinics.length} klinik gösteriliyor. Detay veya randevu için
                mesajlar üzerinden klinikle iletişime geçebilirsiniz.
              </Text>
            }
          />
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
  listPad: { padding: 16, paddingBottom: 80 },
  hint: { fontSize: 13, color: "#64748b", marginBottom: 12, lineHeight: 18 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  name: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  sub: { fontSize: 13, color: "#64748b", marginTop: 4 },
  rating: { fontSize: 13, color: "#ca8a04", marginTop: 6, fontWeight: "600" },
  back: { position: "absolute", bottom: 24, left: 16 },
  backText: { fontSize: 16, color: "#2563eb", fontWeight: "600" },
});
