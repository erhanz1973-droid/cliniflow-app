import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { API_BASE } from "../../../lib/api";
import { useLanguage } from "../../../lib/language-context";
import {
  normalizeClinicInviteCode,
  savePendingClinicInvite,
} from "../../../lib/clinicInviteStorage";

type InvitePreview = {
  name: string;
  clinicCode: string;
};

export default function ClinicInviteWelcomeScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const params = useLocalSearchParams<{ code?: string }>();
  const code = normalizeClinicInviteCode(
    Array.isArray(params.code) ? params.code[0] : params.code,
  );
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError("invalid");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/public/clinic-invite/${encodeURIComponent(code)}`,
          { headers: { Accept: "application/json" } },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          if (!cancelled) setError(data?.error || "not_found");
          return;
        }
        const clinic = data.clinic || {};
        const p: InvitePreview = {
          name: String(clinic.name || code),
          clinicCode: String(clinic.clinicCode || code),
        };
        if (!cancelled) {
          setPreview(p);
          await savePendingClinicInvite({
            code: p.clinicCode,
            clinicName: p.name,
            viaInvitation: true,
          });
        }
      } catch {
        if (!cancelled) {
          setPreview({ name: code, clinicCode: code });
          await savePendingClinicInvite({ code, viaInvitation: true });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const goRegister = () => {
    router.push({
      pathname: "/register-patient",
      params: {
        prefillClinicCode: code,
        fromClinicInvite: "1",
      },
    });
  };

  if (!code) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t("clinicInvite.invalid")}</Text>
        <Pressable style={styles.btn} onPress={() => router.replace("/role-select")}>
          <Text style={styles.btnText}>{t("login.back")}</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (error === "clinic_not_found" || error === "not_found") {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{t("clinicInvite.notFound")}</Text>
        <Pressable style={styles.btn} onPress={() => router.replace("/role-select")}>
          <Text style={styles.btnText}>{t("login.back")}</Text>
        </Pressable>
      </View>
    );
  }

  const clinicName = preview?.name || code;

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <View style={styles.card}>
        <Text style={styles.emoji}>🏥</Text>
        <Text style={styles.title}>
          {t("clinicInvite.welcomeTitle", { clinic: clinicName })}
        </Text>
        <Text style={styles.subtitle}>{t("clinicInvite.invitedSubtitle")}</Text>
        <Text style={styles.hint}>{t("clinicInvite.noManualCode")}</Text>
        <Pressable style={styles.primaryBtn} onPress={goRegister}>
          <Text style={styles.primaryBtnText}>{t("clinicInvite.createAccount")}</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => router.push("/login/patient")}>
          <Text style={styles.secondaryBtnText}>{t("clinicInvite.alreadyHaveAccount")}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f6f7f9",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#f6f7f9",
  },
  card: {
    maxWidth: 400,
    width: "100%",
    alignSelf: "center",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 28,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  emoji: { fontSize: 48, textAlign: "center", marginBottom: 12 },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#111827",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#4b5563",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 8,
  },
  hint: {
    fontSize: 13,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 28,
  },
  primaryBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  secondaryBtn: { padding: 12, alignItems: "center" },
  secondaryBtnText: { color: "#2563EB", fontSize: 15, fontWeight: "600" },
  btn: {
    marginTop: 16,
    backgroundColor: "#2563EB",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnText: { color: "#fff", fontWeight: "600" },
  errorText: { fontSize: 16, color: "#b91c1c", textAlign: "center", marginBottom: 8 },
});
