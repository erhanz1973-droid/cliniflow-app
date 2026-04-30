/**
 * Klinik konumu — koordinat girişi ve GPS (Konumum),
 * PUT /api/admin/clinic ile kayıt.
 * Route: /admin-clinic-location
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";
import { normalizeCity } from "../lib/cityCodes";

type LatLng = { latitude: number; longitude: number };

function formatCoord(n: number): string {
  return Number.isFinite(n) ? String(n) : "";
}

export default function AdminClinicLocationScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const token = user?.token ?? "";

  const [marker, setMarker] = useState<LatLng | null>(null);
  const [latText, setLatText] = useState("");
  const [lngText, setLngText] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("Tbilisi");
  const [country, setCountry] = useState("GE");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (marker) {
      setLatText(formatCoord(marker.latitude));
      setLngText(formatCoord(marker.longitude));
    }
  }, [marker]);

  const applyLatLngFromInputs = useCallback(() => {
    const lat = parseFloat(latText.replace(",", "."));
    const lng = parseFloat(lngText.replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      Alert.alert("Koordinat", "Geçerli enlem ve boylam girin (ondalık).");
      return;
    }
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      Alert.alert("Koordinat", "Enlem -90…90, boylam -180…180 aralığında olmalı.");
      return;
    }
    setMarker({ latitude: lat, longitude: lng });
  }, [latText, lngText]);

  const setMyLocation = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Konum", "Konum izni gerekiyor.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      setMarker({ latitude: lat, longitude: lng });
    } catch {
      Alert.alert("Konum", "Konum alınamadı. Lütfen tekrar deneyin.");
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!token) {
      Alert.alert("Oturum", "Yönetici oturumu gerekli.");
      return;
    }
    if (!marker) {
      Alert.alert("Konum", "Konum seçin veya enlem/boylam girin.");
      return;
    }
    if (!name.trim()) {
      Alert.alert("İsim", "Klinik adı girin.");
      return;
    }

    const countryCode = country.trim().toUpperCase().slice(0, 2);
    if (countryCode.length !== 2) {
      Alert.alert("Ülke", "Ülke kodu iki harf olmalı (örn. GE, TR).");
      return;
    }

    const cityTrim = city.trim();
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/clinic`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          latitude: marker.latitude,
          longitude: marker.longitude,
          lat: marker.latitude,
          lng: marker.longitude,
          city: cityTrim || null,
          city_code: cityTrim ? normalizeCity(cityTrim) : null,
          country: countryCode,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        const msg =
          (typeof data.message === "string" && data.message) ||
          (typeof data.error === "string" && data.error) ||
          `HTTP ${res.status}`;
        throw new Error(msg);
      }
      Alert.alert("Kaydedildi", "Klinik konumu güncellendi.", [
        { text: "Tamam", onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert("Hata", e instanceof Error ? e.message : "Kayıt başarısız.");
    } finally {
      setSaving(false);
    }
  }, [token, marker, name, city, country, router]);

  if (!user || user.type !== "admin") {
    return (
      <View style={[styles.center, { paddingTop: insets.top + 24 }]}>
        <Text style={styles.denied}>Bu ekran yalnızca klinik yöneticileri içindir.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>← Geri</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>← Geri</Text>
        </Pressable>
        <Text style={styles.title}>Klinik konumu</Text>
        <TouchableOpacity onPress={() => void handleSave()} disabled={saving} style={styles.saveBtn}>
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Kaydet</Text>
          )}
        </TouchableOpacity>
      </View>

      <TextInput
        placeholder="Klinik adı"
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholderTextColor="#94a3b8"
      />
      <View style={styles.row}>
        <TextInput
          placeholder="Şehir"
          value={city}
          onChangeText={setCity}
          style={[styles.input, styles.half]}
          placeholderTextColor="#94a3b8"
        />
        <TextInput
          placeholder="Ülke (ISO-2)"
          value={country}
          onChangeText={setCountry}
          autoCapitalize="characters"
          maxLength={2}
          style={[styles.input, styles.half]}
          placeholderTextColor="#94a3b8"
        />
      </View>

      <View style={styles.fallbackBox}>
        <Text style={styles.fallbackTitle}>
          {Constants.appOwnership === "expo" ? "Expo Go: koordinat girişi" : "Koordinat girişi"}
        </Text>
        <Text style={styles.fallbackSub}>
          {Constants.appOwnership === "expo"
            ? "Koordinatları aşağıya yazın veya Konumum ile doldurun."
            : "Enlem ve boylamı girin veya Konumum ile GPS kullanın."}
        </Text>
        <View style={styles.coordRow}>
          <TextInput
            style={[styles.input, styles.coordInput]}
            placeholder="Enlem (lat)"
            value={latText}
            onChangeText={setLatText}
            keyboardType="numbers-and-punctuation"
            placeholderTextColor="#94a3b8"
          />
          <TextInput
            style={[styles.input, styles.coordInput]}
            placeholder="Boylam (lng)"
            value={lngText}
            onChangeText={setLngText}
            keyboardType="numbers-and-punctuation"
            placeholderTextColor="#94a3b8"
          />
        </View>
        <TouchableOpacity style={styles.applyCoordBtn} onPress={applyLatLngFromInputs}>
          <Text style={styles.applyCoordBtnText}>Koordinatı uygula</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.myLocationBtnInline} onPress={() => void setMyLocation()}>
          <Text style={styles.myLocationBtnText}>Konumum (GPS)</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.hint}>
        Koordinatları onaylayın veya Konumum ile doldurun. Kaydet sunucuya enlem/boylam yazar.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 10,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  back: { fontSize: 16, color: "#2563eb", fontWeight: "600" },
  title: { fontSize: 17, fontWeight: "800", color: "#0f172a" },
  saveBtn: {
    backgroundColor: "#2563eb",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 72,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  input: {
    padding: 12,
    marginHorizontal: 12,
    marginTop: 8,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    fontSize: 16,
    color: "#0f172a",
  },
  row: { flexDirection: "row", gap: 8, paddingHorizontal: 12 },
  half: { flex: 1, marginHorizontal: 0 },
  myLocationBtnText: { fontSize: 14, fontWeight: "700", color: "#2563eb" },
  fallbackBox: {
    flex: 1,
    margin: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  fallbackTitle: { fontSize: 16, fontWeight: "700", color: "#0f172a", marginBottom: 6 },
  fallbackSub: { fontSize: 13, color: "#64748b", lineHeight: 18, marginBottom: 12 },
  coordRow: { flexDirection: "row", gap: 8 },
  coordInput: { flex: 1, marginHorizontal: 0, marginTop: 0 },
  applyCoordBtn: {
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  applyCoordBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  myLocationBtnInline: {
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2563eb",
  },
  hint: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    fontSize: 12,
    color: "#64748b",
    lineHeight: 18,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  denied: { color: "#0f172a", textAlign: "center", marginBottom: 16 },
  link: { color: "#2563eb", fontWeight: "600" },
});
