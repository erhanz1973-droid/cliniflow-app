import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Image, ActivityIndicator, Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../../lib/auth";
import { useRouter } from "expo-router";
import { API_BASE } from "../../lib/api";
import { useLanguage } from "../../lib/language-context";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, Language } from "../../lib/i18n";

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || "—"}</Text>
    </View>
  );
}

function toDisplayPhotoUrl(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  const s = String(pathOrUrl).trim();
  if (!s) return null;
  if (s.startsWith("http://") || s.startsWith("https://") || s.startsWith("file:")) return s;
  if (s.startsWith("/")) return `${API_BASE}${s}`;
  return s;
}

const pickerImageOptions: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  allowsEditing: true,
  aspect: [1, 1],
  quality: 0.85,
};

export default function ProfileScreen() {
  const { user, signOut, patchUser } = useAuth();
  const router = useRouter();
  const { t, currentLanguage, setLanguage } = useLanguage();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);

  const name = String(user?.name || "Hasta").trim();
  const phone = String(user?.phone || "").trim();
  const clinicCode = String((user as any)?.clinicCode || "").trim();
  const status = String((user as any)?.status || "").trim();
  const storedPhoto = (user as { profilePhotoUrl?: string })?.profilePhotoUrl;
  const photoUri = localPhotoUri || toDisplayPhotoUrl(storedPhoto);

  const uploadPhoto = async (uri: string, mimeType: string) => {
    if (!user?.token) return;
    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      const ext = uri.split(".").pop()?.toLowerCase() || "jpg";
      formData.append("photo", { uri, name: `profile.${ext}`, type: mimeType } as any);
      const res = await fetch(`${API_BASE}/api/patient/profile-photo`, {
        method: "POST",
        headers: { Authorization: `Bearer ${user.token}` },
        body: formData,
      });
      const text = await res.text();
      let json: { ok?: boolean; error?: string; profilePhotoUrl?: string; url?: string };
      try {
        json = JSON.parse(text) as typeof json;
      } catch {
        throw new Error(`Sunucu hatası: ${text.substring(0, 120)}`);
      }
      if (!json.ok) throw new Error(json.error || t("profile.photoError"));
      const path = json.profilePhotoUrl || json.url;
      if (path) {
        await patchUser({ profilePhotoUrl: path });
        setLocalPhotoUri(null);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : t("profile.photoError");
      Alert.alert(t("common.error"), msg);
      setLocalPhotoUri(null);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const runPicker = async (asset: ImagePicker.ImagePickerAsset) => {
    setLocalPhotoUri(asset.uri);
    const mime =
      asset.mimeType ||
      (asset.type === "image" ? "image/jpeg" : "image/jpeg");
    await uploadPhoto(asset.uri, mime);
  };

  const openGallery = async () => {
    const { status: permStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permStatus !== "granted") {
      Alert.alert(t("profile.permissionRequired"), t("profile.galleryPermission"));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync(pickerImageOptions);
    if (result.canceled || !result.assets?.[0]) return;
    await runPicker(result.assets[0]);
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(t("profile.permissionRequired"), t("profile.cameraPermission"));
      return;
    }
    const result = await ImagePicker.launchCameraAsync(pickerImageOptions);
    if (result.canceled || !result.assets?.[0]) return;
    await runPicker(result.assets[0]);
  };

  const handleChangePhoto = () => {
    if (uploadingPhoto) return;
    const buttons: {
      text: string;
      style?: "cancel" | "destructive" | "default";
      onPress?: () => void;
    }[] = [];
    if (Platform.OS !== "web") {
      buttons.push({ text: t("profile.photoTakeCamera"), onPress: openCamera });
    }
    buttons.push({ text: t("profile.photoChooseGallery"), onPress: openGallery });
    buttons.push({ text: t("common.cancel"), style: "cancel" });
    Alert.alert(t("profile.changePhotoTitle"), t("profile.changePhotoMessage"), buttons);
  };

  const handleLanguageChange = async (lang: Language) => {
    try {
      await setLanguage(lang);
      // Sync to server
      if (user?.token) {
        fetch(`${API_BASE}/api/patient/language`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${user.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ language: lang }),
        }).catch(() => {}); // fire-and-forget
      }
    } catch (_) {}
  };

  const handleLogout = () => {
    Alert.alert(t("profile.logoutTitle"), t("profile.logoutConfirm"), [
      { text: t("profile.logoutCancel"), style: "cancel" },
      {
        text: t("profile.logout"),
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/role-select" as any);
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* AVATAR */}
      <View style={styles.avatarSection}>
        <TouchableOpacity style={styles.avatarWrapper} onPress={handleChangePhoto} activeOpacity={0.8}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.avatarImg} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            {uploadingPhoto ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.avatarEditIcon}>📷</Text>
            )}
          </View>
        </TouchableOpacity>
        <Text style={styles.name}>{name}</Text>
        {status ? (
          <View style={[styles.statusBadge, status === "APPROVED" && styles.statusApproved]}>
            <Text style={styles.statusText}>
              {status === "APPROVED" ? t("profile.approvedPatient") : status}
            </Text>
          </View>
        ) : null}
      </View>

      {/* ACCOUNT INFO */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("profile.accountInfo")}</Text>
        <View style={styles.card}>
          <Row label={t("profile.name")} value={name} />
          <View style={styles.divider} />
          <Row label={t("profile.phone")} value={phone || t("profile.notRegistered")} />
          <View style={styles.divider} />
          <Row label={t("profile.clinicCode")} value={clinicCode || "—"} />
          <View style={styles.divider} />
          <Row label={t("profile.patientId")} value={user?.patientId || user?.id} />
        </View>
      </View>

      {/* LANGUAGE */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("profile.language")}</Text>
        <View style={styles.langGrid}>
          {SUPPORTED_LANGUAGES.map((lang) => (
            <TouchableOpacity
              key={lang}
              style={[styles.langBtn, currentLanguage === lang && styles.langBtnActive]}
              onPress={() => handleLanguageChange(lang)}
              activeOpacity={0.8}
            >
              <Text style={[styles.langBtnText, currentLanguage === lang && styles.langBtnTextActive]}>
                {LANGUAGE_NAMES[lang]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* HEALTH FORM */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("profile.health")}</Text>
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={() => router.push("/(patient)/medical-form" as any)}
        >
          <Text style={styles.menuBtnIcon}>🏥</Text>
          <Text style={styles.menuBtnText}>{t("profile.healthForm")}</Text>
          <Text style={styles.menuBtnArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* LOGOUT */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>{t("profile.logout")}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  avatarSection: {
    alignItems: "center", paddingTop: 60, paddingBottom: 24,
    backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
  },
  avatarWrapper: { position: "relative", marginBottom: 12 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: "#2563eb", justifyContent: "center", alignItems: "center",
  },
  avatarImg: { width: 80, height: 80, borderRadius: 40 },
  avatarEditBadge: {
    position: "absolute", bottom: 0, right: 0,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "#2563eb", alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
  },
  avatarEditIcon: { fontSize: 13 },
  avatarText: { fontSize: 28, fontWeight: "800", color: "#fff" },
  name: { fontSize: 20, fontWeight: "700", color: "#111827" },
  statusBadge: {
    marginTop: 8, paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 20, backgroundColor: "#e5e7eb",
  },
  statusApproved: { backgroundColor: "#dcfce7" },
  statusText: { fontSize: 12, fontWeight: "600", color: "#166534" },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: {
    fontSize: 13, fontWeight: "600", color: "#6b7280",
    marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5,
  },
  card: {
    backgroundColor: "#fff", borderRadius: 12, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  row: {
    flexDirection: "row", justifyContent: "space-between",
    alignItems: "center", paddingHorizontal: 16, paddingVertical: 14,
  },
  rowLabel: { fontSize: 14, color: "#6b7280" },
  rowValue: { fontSize: 14, fontWeight: "600", color: "#111827", maxWidth: "60%", textAlign: "right" },
  divider: { height: 1, backgroundColor: "#f3f4f6", marginHorizontal: 16 },
  langGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  langBtn: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10,
    backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5e7eb",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  langBtnActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  langBtnText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  langBtnTextActive: { color: "#fff" },
  logoutBtn: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16,
    alignItems: "center", borderWidth: 1, borderColor: "#fecaca",
  },
  logoutText: { fontSize: 15, fontWeight: "700", color: "#dc2626" },
  menuBtn: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16,
    flexDirection: "row", alignItems: "center", gap: 12,
  },
  menuBtnIcon: { fontSize: 18 },
  menuBtnText: { flex: 1, fontSize: 15, fontWeight: "600", color: "#111827" },
  menuBtnArrow: { fontSize: 20, color: "#9ca3af" },
});
