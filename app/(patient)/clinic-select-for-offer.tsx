import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";
import { useLanguage } from "../../lib/language-context";
import {
  loadPendingAiOfferForClinicSelect,
  clearPendingAiOfferForClinicSelect,
  sendOfferRequest,
  goToOffers,
} from "../../lib/offerRequestFlow";
import { leaveToPatientHome } from "../../lib/safePatientNavigation";

const MAX_CLINICS = 5;

type ClinicRow = {
  id: string;
  name: string;
  city?: string | null;
  rating?: number | null;
};

export default function ClinicSelectForOfferScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { t } = useLanguage();
  const { user } = useAuth();
  const token = user?.token;
  const patientId = String(user?.patientId || "").trim();

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [clinics, setClinics] = useState<ClinicRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [payload, setPayload] = useState<{ image: string; analysis: Record<string, unknown> } | null>(
    null
  );

  useEffect(() => {
    setMessage(t("messages.defaultComposerText"));
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await loadPendingAiOfferForClinicSelect();
      if (cancelled) return;
      if (!p?.image) {
        Alert.alert(t("common.error"), t("messages.connectionError") || "Missing data");
        leaveToPatientHome(router, navigation);
        return;
      }
      setPayload(p);
      if (!token) {
        setLoading(false);
        Alert.alert(t("chat.sessionError"), t("chat.sessionExpired"));
        leaveToPatientHome(router, navigation);
        return;
      }
      try {
        const res = await fetch(`${API_BASE}/api/patient/clinics`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        const json = await res.json().catch(() => ({}));
        const rows = Array.isArray(json.clinics) ? json.clinics : [];
        if (!cancelled) {
          setClinics(
            rows.map((c: any) => ({
              id: String(c.id),
              name: String(c.name || "Clinic"),
              city: c.city ?? null,
              rating: typeof c.rating === "number" ? c.rating : null,
            }))
          );
        }
      } catch {
        if (!cancelled) setClinics([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, router, navigation, t]);

  const toggle = useCallback(
    (id: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else {
          if (next.size >= MAX_CLINICS) {
            Alert.alert(
              t("common.error"),
              t("messages.clinicSelectorHint")?.replace("{max}", String(MAX_CLINICS)) ||
                `En fazla ${MAX_CLINICS} klinik.`
            );
            return prev;
          }
          next.add(id);
        }
        return next;
      });
    },
    [t]
  );

  const onSubmit = useCallback(async () => {
    if (!token || !patientId) {
      Alert.alert(t("chat.sessionError"), t("chat.sessionExpired"));
      return;
    }
    if (!payload?.image) return;
    const clinicIds = [...selected];
    if (clinicIds.length === 0) {
      Alert.alert(t("common.error"), t("messages.selectAtLeastOneClinic") || "Select a clinic");
      return;
    }
    setSending(true);
    try {
      const result = await sendOfferRequest({
        token,
        clinicIds,
        image: payload.image,
        analysis: payload.analysis,
        message: message.trim(),
      });
      if (!result.ok) {
        Alert.alert(
          t("common.error"),
          result.message || result.error || t("messages.sendFailed")
        );
        return;
      }
      await clearPendingAiOfferForClinicSelect();
      goToOffers(router);
    } finally {
      setSending(false);
    }
  }, [token, patientId, payload, selected, message, router, t]);

  if (!payload && loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("quoteRequest.title")}</Text>
      <Text style={styles.sub}>
        {t("messages.clinicSelectorHint")?.replace("{max}", String(MAX_CLINICS)) ||
          `En fazla ${MAX_CLINICS} klinik seçin.`}
      </Text>

      {payload?.image ? (
        <View style={styles.photoWrap}>
          <Text style={styles.photoLabel}>
            {t("quoteRequest.photoAttached") || "Talebe eklenecek fotoğraf"}
          </Text>
          <Image source={{ uri: payload.image }} style={styles.photoThumb} resizeMode="cover" />
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color="#2563eb" />
      ) : (
        <FlatList
          data={clinics}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 12 }}
          ListEmptyComponent={
            <Text style={styles.empty}>{t("messages.clinicSelectorEmpty")}</Text>
          }
          renderItem={({ item }) => {
            const on = selected.has(item.id);
            return (
              <TouchableOpacity
                style={[styles.row, on && styles.rowOn]}
                onPress={() => toggle(item.id)}
                activeOpacity={0.85}
              >
                <Text style={styles.rowCheck}>{on ? "☑" : "☐"}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  {item.city ? <Text style={styles.rowMeta}>{item.city}</Text> : null}
                </View>
                {item.rating != null ? (
                  <Text style={styles.rowRating}>⭐ {item.rating.toFixed(1)}</Text>
                ) : null}
              </TouchableOpacity>
            );
          }}
        />
      )}

      <Text style={styles.label}>{t("quoteRequest.descLabel")}</Text>
      <TextInput
        style={styles.input}
        multiline
        value={message}
        onChangeText={setMessage}
        placeholder={t("quoteRequest.descPlaceholder")}
        placeholderTextColor="#9ca3af"
      />

      <TouchableOpacity
        style={[styles.cta, sending && styles.ctaDisabled]}
        onPress={() => void onSubmit()}
        disabled={sending}
        activeOpacity={0.88}
      >
        {sending ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.ctaText}>
            {(t("quoteRequest.sendBtn") || "").replace("{count}", String(selected.size || 1))}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc", padding: 20, paddingTop: 56 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "800", color: "#0f172a", marginBottom: 6 },
  sub: { fontSize: 14, color: "#64748b", marginBottom: 16, lineHeight: 20 },
  photoWrap: { marginBottom: 16 },
  photoLabel: { fontSize: 12, fontWeight: "600", color: "#475569", marginBottom: 8 },
  photoThumb: {
    width: "100%",
    height: 140,
    borderRadius: 12,
    backgroundColor: "#e2e8f0",
  },
  empty: { color: "#64748b", marginTop: 24, textAlign: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  rowOn: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  rowCheck: { fontSize: 22, marginRight: 12, color: "#0f172a" },
  rowName: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  rowMeta: { fontSize: 13, color: "#64748b", marginTop: 2 },
  rowRating: { fontSize: 13, color: "#ca8a04", fontWeight: "600" },
  label: { fontSize: 13, fontWeight: "700", color: "#475569", marginTop: 8, marginBottom: 6 },
  input: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
    fontSize: 15,
    color: "#0f172a",
    textAlignVertical: "top",
    marginBottom: 20,
  },
  cta: {
    backgroundColor: "#2563eb",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaDisabled: { opacity: 0.7 },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
