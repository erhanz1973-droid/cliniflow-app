import React, { useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, Image, ActivityIndicator, Platform, Modal, Linking, TextInput,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../../lib/auth";
import { useRouter } from "expo-router";
import { API_BASE } from "../../lib/api";
import { useLanguage } from "../../lib/language-context";
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, Language } from "../../lib/i18n";
import { saveSelectedChatClinic } from "../../lib/selectedChatClinic";
import { buildJoinClinicPatchBody } from "../../../lib/patientJoinClinic";

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
  const { user, signOut, patchUser, signIn } = useAuth();
  const router = useRouter();
  const { t, currentLanguage, setLanguage } = useLanguage();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(null);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const [leavingClinic, setLeavingClinic] = useState(false);
  const [joinModal, setJoinModal]         = useState(false);
  const [joinClinicCode, setJoinClinicCode] = useState('');
  const [joinReferralCode, setJoinReferralCode] = useState('');
  const [joiningClinic, setJoiningClinic] = useState(false);

  const name = String(user?.name || t("profile.name")).trim();
  const phone = String(user?.phone || "").trim();
  const clinicCode = String((user as any)?.clinicCode || "").trim();
  const clinicId   = String((user as any)?.clinicId   || "").trim();
  const hasClinic  = !!(clinicCode || clinicId);
  const status = String((user as any)?.status || "").trim();
  const storedPhoto = (user as { profilePhotoUrl?: string })?.profilePhotoUrl;
  const photoUri = localPhotoUri || toDisplayPhotoUrl(storedPhoto);

  const leaveClinic = useCallback(() => {
    Alert.alert(
      t("profile.leaveClinic.title") || "Klinikten Ayrıl",
      t("profile.leaveClinic.warning") ||
        "Kliniğinizle olan referral bağınız ve indiriminiz sona erecek.\n\nİlerde tekrar davet ederek veya edilerek avantajlardan yeniden yararlanabilirsiniz.",
      [
        { text: t("common.cancel") || "Vazgeç", style: "cancel" },
        {
          text: t("profile.leaveClinic.confirm") || "Evet, Ayrıl",
          style: "destructive",
          onPress: async () => {
            if (!user?.token) return;
            setLeavingClinic(true);
            try {
              const res = await fetch(`${API_BASE}/api/patient/clinic`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${user.token}` },
              });
              const data = await res.json();
              if (!data.ok) throw new Error(data.error || "leave_failed");
              // Update stored session — clear clinic fields and refresh token
              await signIn({
                ...user,
                token: data.token,
                clinicId: undefined,
                clinicCode: undefined,
                type: "patient",
              });
              await saveSelectedChatClinic(null);
              Alert.alert(
                t("profile.leaveClinic.successTitle") || "Klinikten Ayrıldınız",
                t("profile.leaveClinic.successMsg") || "Artık yeni bir klinik arayabilirsiniz.",
                [{ text: "OK" }]
              );
            } catch (err: any) {
              Alert.alert(t("common.error") || "Hata", err.message);
            } finally {
              setLeavingClinic(false);
            }
          },
        },
      ]
    );
  }, [user, t, signIn]);

  const joinWithCode = useCallback(async () => {
    const code     = joinClinicCode.trim().toUpperCase();
    const referral = joinReferralCode.trim().toUpperCase();
    if (!code) {
      Alert.alert(t("profile.joinModal.errorTitle") || "Hata", t("profile.joinModal.errorCode") || "Klinik kodu gereklidir.");
      return;
    }
    if (!user?.token) return;
    setJoiningClinic(true);
    try {
      const body = buildJoinClinicPatchBody(code, referral || undefined);
      const res = await fetch(`${API_BASE}/api/patient/clinic`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) {
        if (data.error === "clinic_not_found") throw new Error(t("profile.joinModal.errorNotFound") || "Klinik bulunamadı.");
        throw new Error(data.error || "join_failed");
      }
      await signIn({ ...user, token: data.token, clinicId: data.clinic.id, clinicCode: data.clinic.clinic_code, type: "patient" });
      await saveSelectedChatClinic({
        id: String(data.clinic.id),
        clinic_code: data.clinic.clinic_code,
        name: data.clinic.name,
      });
      setJoinModal(false);
      setJoinClinicCode('');
      setJoinReferralCode('');
      // Referral may have succeeded, failed, or not been requested
      const refOk =
        data.referral?.linked === true || data.referral?.duplicate === true;
      const refBad = data.referral?.attempted && data.referral?.error;
      let successMsg: string;
      if (refOk) {
        successMsg = (t("profile.joinModal.successReferral") || "Kliniğe katıldınız! Referral indiriminiz aktif edilecek.").replace("{clinic}", data.clinic.name);
      } else if (refBad) {
        successMsg = (t("profile.joinModal.successNoReferral") || "Kliniğe katıldınız! Ancak referral kodu geçersiz — indirim uygulanmadı.").replace("{clinic}", data.clinic.name);
      } else {
        successMsg = (t("profile.joinModal.success") || "Kliniğe başarıyla katıldınız!").replace("{clinic}", data.clinic.name);
      }
      Alert.alert("✅ " + data.clinic.name, successMsg);
    } catch (err: any) {
      Alert.alert(t("common.error") || "Hata", err.message);
    } finally {
      setJoiningClinic(false);
    }
  }, [joinClinicCode, joinReferralCode, user, t, signIn]);

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
        throw new Error(t("common.error") + ": " + text.substring(0, 80));
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

      {/* CLINIC SECTION — Find a Clinic or Leave Clinic depending on membership */}
      <View style={styles.section}>
        {hasClinic ? (
          /* LEAVE CLINIC */
          <TouchableOpacity
            style={styles.leaveClinicBtn}
            onPress={leaveClinic}
            activeOpacity={0.85}
            disabled={leavingClinic}
          >
            {leavingClinic ? (
              <ActivityIndicator size="small" color="#DC2626" style={{ marginRight: 8 }} />
            ) : (
              <Text style={styles.leaveClinicIcon}>🚪</Text>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.leaveClinicTitle}>{t("profile.leaveClinic.btn") || "Klinikten Ayrıl"}</Text>
              <Text style={styles.leaveClinicSub}>
                {clinicCode ? `${t("profile.clinicCode")}: ${clinicCode}` : t("profile.leaveClinic.sub") || "Klinik üyeliğinizi sonlandırın"}
              </Text>
            </View>
            <Text style={[styles.menuBtnArrow, { color: "#DC2626" }]}>›</Text>
          </TouchableOpacity>
        ) : (
          /* NO CLINIC — two options */
          <View style={{ gap: 10 }}>
            {/* Direct join with clinic code + referral code */}
            <TouchableOpacity
              style={styles.joinCodeBtn}
              onPress={() => setJoinModal(true)}
              activeOpacity={0.85}
            >
              <Text style={styles.findClinicIcon}>🔑</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.joinCodeTitle}>{t("profile.joinWithCode.btn") || "Klinik Kodu ile Katıl"}</Text>
                <Text style={styles.joinCodeSub}>{t("profile.joinWithCode.sub") || "Klinik kodu ve referral kodunla katıl"}</Text>
              </View>
              <Text style={styles.menuBtnArrow}>›</Text>
            </TouchableOpacity>
            {/* Marketplace clinic search */}
            <TouchableOpacity
              style={styles.findClinicBtn}
              onPress={() => router.push("/clinic-onboarding" as any)}
              activeOpacity={0.85}
            >
              <Text style={styles.findClinicIcon}>🏥</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.findClinicTitle}>{t("profile.findClinic")}</Text>
                <Text style={styles.findClinicSub}>{t("profile.findClinicSub")}</Text>
              </View>
              <Text style={styles.menuBtnArrow}>›</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* AI DENTAL ANALYSIS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI Diş Analizi</Text>
        <TouchableOpacity
          style={styles.aiAnalysisBtn}
          activeOpacity={0.85}
          onPress={() =>
            router.push({
              pathname: "/(patient)/messages" as any,
              params: { openCamera: "true" },
            })
          }
        >
          <Text style={styles.aiAnalysisIcon}>🦷</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.aiAnalysisTitle}>Diş Fotoğrafı Çek</Text>
            <Text style={styles.aiAnalysisSub}>AI analizi ile klinik önerisi al</Text>
          </View>
          <Text style={styles.menuBtnArrow}>›</Text>
        </TouchableOpacity>
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

      {/* LEGAL */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("profile.legal")}</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.legalBtn} onPress={() => setPrivacyVisible(true)} activeOpacity={0.7}>
            <Text style={styles.legalIcon}>🔒</Text>
            <Text style={styles.legalBtnText}>{t("profile.privacyPolicy")}</Text>
            <Text style={styles.menuBtnArrow}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.legalBtn}
            onPress={() => Linking.openURL("https://www.clinifly.net/terms-and-conditions")}
            activeOpacity={0.7}
          >
            <Text style={styles.legalIcon}>📄</Text>
            <Text style={styles.legalBtnText}>{t("profile.termsOfService") || "Terms of Service"}</Text>
            <Text style={styles.menuBtnArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* LOGOUT */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>{t("profile.logout")}</Text>
        </TouchableOpacity>
      </View>

      {/* JOIN WITH CODE MODAL */}
      <Modal
        visible={joinModal}
        animationType="slide"
        transparent
        onRequestClose={() => setJoinModal(false)}
      >
        <View style={styles.joinModalOverlay}>
          <View style={styles.joinModalSheet}>
            <View style={styles.joinModalHandle} />
            <Text style={styles.joinModalTitle}>{t("profile.joinWithCode.modalTitle") || "🔑 Klinik Kodu ile Katıl"}</Text>
            <Text style={styles.joinModalSub}>{t("profile.joinWithCode.modalSub") || "Kliniğinizden aldığınız kodu girin."}</Text>

            <Text style={styles.joinInputLabel}>{t("profile.joinWithCode.clinicCodeLabel") || "Klinik Kodu"} *</Text>
            <TextInput
              style={styles.joinInput}
              placeholder="ABC123"
              placeholderTextColor="#9CA3AF"
              value={joinClinicCode}
              onChangeText={v => setJoinClinicCode(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="next"
            />

            <Text style={styles.joinInputLabel}>
              {t("profile.joinWithCode.referralLabel") || "Referral Kodu"}{" "}
              <Text style={{ color: "#9CA3AF", fontWeight: "400" }}>({t("common.optional") || "isteğe bağlı"})</Text>
            </Text>
            <TextInput
              style={styles.joinInput}
              placeholder={t("profile.joinWithCode.referralPlaceholder") || "Sizi davet edenin kodu"}
              placeholderTextColor="#9CA3AF"
              value={joinReferralCode}
              onChangeText={v => setJoinReferralCode(v.toUpperCase())}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
            />
            <Text style={styles.joinReferralHint}>
              {t("profile.joinWithCode.referralHint") || "Sizi kliniğe davet eden başka bir hastanın ID kodudur. İndirim için gereklidir."}
            </Text>

            <TouchableOpacity
              style={[styles.joinSubmitBtn, joiningClinic && { opacity: 0.6 }]}
              onPress={joinWithCode}
              disabled={joiningClinic}
            >
              {joiningClinic
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={styles.joinSubmitBtnText}>{t("profile.joinWithCode.submit") || "Kliniğe Katıl"}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setJoinModal(false); setJoinClinicCode(''); setJoinReferralCode(''); }} style={{ alignItems: "center", paddingVertical: 12 }}>
              <Text style={{ color: "#6B7280", fontSize: 14 }}>{t("common.cancel") || "Vazgeç"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PRIVACY POLICY MODAL — transparent overlay avoids new native view controller */}
      <Modal
        visible={privacyVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setPrivacyVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t("profile.privacyPolicyTitle")}</Text>
            <TouchableOpacity onPress={() => setPrivacyVisible(false)} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.modalBodyText}>{t("profile.privacyPolicyBody")}</Text>
            <TouchableOpacity
              style={styles.privacyLinkBtn}
              onPress={() => Linking.openURL("https://www.clinifly.net/privacy-policy")}
            >
              <Text style={styles.privacyLinkText}>🌐 www.clinifly.net/privacy-policy</Text>
            </TouchableOpacity>
          </ScrollView>
          <TouchableOpacity style={styles.modalDoneBtn} onPress={() => setPrivacyVisible(false)}>
            <Text style={styles.modalDoneBtnText}>{t("profile.close")}</Text>
          </TouchableOpacity>
        </View>
      </Modal>
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
  findClinicBtn: {
    backgroundColor: "#EFF6FF", borderRadius: 14, borderWidth: 1, borderColor: "#BFDBFE",
    padding: 16, flexDirection: "row", alignItems: "center", gap: 12,
  },
  findClinicIcon: { fontSize: 22 },
  findClinicTitle: { fontSize: 15, fontWeight: "700", color: "#1D4ED8", marginBottom: 2 },
  findClinicSub: { fontSize: 12, color: "#3B82F6", lineHeight: 17 },
  leaveClinicBtn: {
    backgroundColor: "#FFF1F2", borderRadius: 14, borderWidth: 1, borderColor: "#FECACA",
    padding: 16, flexDirection: "row", alignItems: "center", gap: 12,
  },
  leaveClinicIcon: { fontSize: 22 },
  leaveClinicTitle: { fontSize: 15, fontWeight: "700", color: "#DC2626", marginBottom: 2 },
  leaveClinicSub: { fontSize: 12, color: "#EF4444", lineHeight: 17 },
  joinCodeBtn: {
    backgroundColor: "#F0FDF4", borderRadius: 14, borderWidth: 1, borderColor: "#BBF7D0",
    padding: 16, flexDirection: "row", alignItems: "center", gap: 12,
  },
  joinCodeTitle: { fontSize: 15, fontWeight: "700", color: "#15803D", marginBottom: 2 },
  joinCodeSub: { fontSize: 12, color: "#16A34A", lineHeight: 17 },
  // AI dental analysis button
  aiAnalysisBtn: {
    backgroundColor: "#EFF6FF", borderRadius: 14, borderWidth: 1, borderColor: "#BFDBFE",
    padding: 16, flexDirection: "row", alignItems: "center", gap: 12,
  },
  aiAnalysisIcon: { fontSize: 22 },
  aiAnalysisTitle: { fontSize: 15, fontWeight: "700", color: "#1D4ED8", marginBottom: 2 },
  aiAnalysisSub: { fontSize: 12, color: "#3B82F6", lineHeight: 17 },
  // Join modal
  joinModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  joinModalSheet: {
    backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingHorizontal: 22, paddingTop: 12, paddingBottom: 36,
  },
  joinModalHandle: {
    width: 36, height: 4, backgroundColor: "#D1D5DB", borderRadius: 2,
    alignSelf: "center", marginBottom: 18,
  },
  joinModalTitle: { fontSize: 20, fontWeight: "800", color: "#111827", marginBottom: 4 },
  joinModalSub: { fontSize: 13, color: "#6B7280", marginBottom: 20, lineHeight: 18 },
  joinInputLabel: { fontSize: 13, fontWeight: "700", color: "#374151", marginBottom: 6 },
  joinInput: {
    backgroundColor: "#F9FAFB", borderWidth: 1.5, borderColor: "#D1D5DB", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: "#111827",
    letterSpacing: 1, marginBottom: 14,
  },
  joinReferralHint: { fontSize: 11, color: "#9CA3AF", lineHeight: 16, marginBottom: 20, marginTop: -10 },
  joinSubmitBtn: {
    backgroundColor: "#15803D", borderRadius: 12, paddingVertical: 15, alignItems: "center", marginBottom: 4,
  },
  joinSubmitBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  menuBtnArrow: { fontSize: 20, color: "#9ca3af" },
  legalBtn: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  legalIcon: { fontSize: 18 },
  legalBtnText: { flex: 1, fontSize: 15, fontWeight: "600", color: "#111827" },
  modalContainer: { flex: 1, backgroundColor: "#fff" },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
  },
  modalTitle: { fontSize: 17, fontWeight: "800", color: "#111827" },
  modalCloseBtn: { padding: 4 },
  modalCloseText: { fontSize: 18, color: "#6b7280" },
  modalBody: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  modalBodyText: { fontSize: 14, color: "#374151", lineHeight: 22 },
  modalDoneBtn: {
    margin: 20, backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, alignItems: "center",
  },
  modalDoneBtnText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  privacyLinkBtn: {
    marginTop: 20, marginBottom: 8, paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: "#EFF6FF", borderRadius: 10, borderWidth: 1, borderColor: "#BFDBFE",
    alignItems: "center",
  },
  privacyLinkText: { fontSize: 13, color: "#2563EB", fontWeight: "600" },
});
