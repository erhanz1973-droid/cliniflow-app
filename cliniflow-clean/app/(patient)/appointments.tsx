import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";
import { useLanguage } from "../../lib/language-context";
import { useDateLocale } from "../../lib/date-locale";

function formatDate(v: string | null | undefined, locale: string) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

function useStatusLabel() {
  const { t } = useLanguage();
  return (s: string) => {
    switch (String(s || "").toUpperCase()) {
      case "COMPLETED": case "DONE": return t("treatment.status.completed");
      case "IN_PROGRESS": case "ACTIVE": return t("treatment.status.inProgress");
      case "PLANNED": return t("treatment.status.planned");
      case "SCHEDULED": return t("treatment.status.scheduled");
      case "CANCELLED": return t("treatment.status.cancelled");
      default: return s || "—";
    }
  };
}

function statusColor(s: string) {
  switch (String(s || "").toUpperCase()) {
    case "COMPLETED": case "DONE": return "#16a34a";
    case "IN_PROGRESS": return "#2563eb";
    case "PLANNED": return "#f59e0b";
    case "CANCELLED": return "#dc2626";
    default: return "#6b7280";
  }
}

type Appointment = {
  id: string;
  title: string;
  rawType?: string;
  status: string;
  scheduled_date: string | null;
  completed_at: string | null;
  toothId: string | null;
  chair: string | null;
  doctorName: string | null;
};

export default function AppointmentsScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const locale = useDateLocale();
  const statusLabel = useStatusLabel();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [upcoming, setUpcoming] = useState<Appointment[]>([]);
  const [past, setPast] = useState<Appointment[]>([]);

  const patientId = String(user?.patientId || user?.id || "").trim();
  const now = new Date();

  const fetchData = useCallback(async () => {
    if (!user?.token || !patientId) { setLoading(false); setRefreshing(false); return; }
    try {
      const res = await fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/treatments`, {
        headers: { Authorization: `Bearer ${user.token}`, Accept: "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      const teeth: any[] = Array.isArray(json.teeth) ? json.teeth : [];

      const all: Appointment[] = [];
      teeth.forEach((tooth: any) => {
        (tooth.procedures || []).forEach((proc: any) => {
          const scheduledMs = proc.scheduledAt ? Number(proc.scheduledAt) : null;
          const scheduled_date = proc.scheduled_date || (scheduledMs ? new Date(scheduledMs).toISOString() : null);
          const completed_at = proc.completed_at || proc.completedAt || null;
          if (scheduled_date || completed_at) {
            all.push({
              id: proc.id || proc.procedureId,
              title: proc.title || proc.type || "",
              rawType: proc.type,
              status: proc.status || "PLANNED",
              scheduled_date,
              completed_at,
              toothId: proc.toothId || String(tooth.toothId || "") || null,
              chair: proc.chair || null,
              doctorName: proc.doctorName || proc.doctor_name || null,
            });
          }
        });
      });

      const up = all
        .filter((a) => {
          const d = a.scheduled_date ? new Date(a.scheduled_date) : null;
          const s = String(a.status || "").toUpperCase();
          return d && d >= now && s !== "COMPLETED" && s !== "DONE" && s !== "CANCELLED";
        })
        .sort((a, b) => new Date(a.scheduled_date!).getTime() - new Date(b.scheduled_date!).getTime());

      const ps = all
        .filter((a) => {
          const d = a.scheduled_date ? new Date(a.scheduled_date) : null;
          const s = String(a.status || "").toUpperCase();
          return s === "COMPLETED" || s === "DONE" || (d && d < now);
        })
        .sort((a, b) =>
          new Date(b.completed_at || b.scheduled_date || 0).getTime() -
          new Date(a.completed_at || a.scheduled_date || 0).getTime()
        )
        .slice(0, 10);

      setUpcoming(up);
      setPast(ps);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.token, patientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor="#2563eb" />}
    >
      <Text style={styles.pageTitle}>{t("appointments.title")}</Text>

      {/* UPCOMING */}
      <Text style={styles.sectionTitle}>{t("appointments.upcoming")}</Text>
      {upcoming.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t("appointments.noUpcoming")}</Text>
        </View>
      ) : (
        upcoming.map((a, i) => (
          <View key={`up-${a.id}-${i}`} style={[styles.card, { borderLeftColor: statusColor(a.status), borderLeftWidth: 4 }]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{a.rawType ? (t(`treatment.type.${a.rawType}`) || a.title) : a.title}</Text>
              <View style={[styles.badge, { backgroundColor: statusColor(a.status) + "22" }]}>
                <Text style={[styles.badgeText, { color: statusColor(a.status) }]}>
                  {statusLabel(a.status)}
                </Text>
              </View>
            </View>
            <Text style={styles.dateText}>📅 {formatDate(a.scheduled_date, locale)}</Text>
            <View style={styles.metaRow}>
              {a.toothId ? <Text style={styles.metaText}>🦷 {t("common.tooth")} {a.toothId}</Text> : null}
              {a.chair ? <Text style={styles.metaText}>🪑 {t("common.chair")} {a.chair}</Text> : null}
              {a.doctorName ? <Text style={styles.metaText}>👨‍⚕️ {a.doctorName}</Text> : null}
            </View>
          </View>
        ))
      )}

      {/* PAST */}
      <Text style={[styles.sectionTitle, { marginTop: 24 }]}>{t("appointments.past")}</Text>
      {past.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{t("appointments.noPast")}</Text>
        </View>
      ) : (
        past.map((a, i) => (
          <View key={`ps-${a.id}-${i}`} style={[styles.card, { borderLeftColor: "#9ca3af", borderLeftWidth: 4, opacity: 0.85 }]}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{a.rawType ? (t(`treatment.type.${a.rawType}`) || a.title) : a.title}</Text>
              <View style={[styles.badge, { backgroundColor: statusColor(a.status) + "22" }]}>
                <Text style={[styles.badgeText, { color: statusColor(a.status) }]}>
                  {statusLabel(a.status)}
                </Text>
              </View>
            </View>
            <Text style={styles.dateText}>
              📅 {formatDate(a.completed_at || a.scheduled_date, locale)}
            </Text>
            <View style={styles.metaRow}>
              {a.toothId ? <Text style={styles.metaText}>🦷 {t("common.tooth")} {a.toothId}</Text> : null}
              {a.chair ? <Text style={styles.metaText}>🪑 {t("common.chair")} {a.chair}</Text> : null}
              {a.doctorName ? <Text style={styles.metaText}>👨‍⚕️ {a.doctorName}</Text> : null}
            </View>
            <TouchableOpacity
              style={styles.detailBtn}
              activeOpacity={0.7}
              onPress={() =>
                router.push({
                  pathname: "/(patient)/encounter/[encounterId]",
                  params: {
                    encounterId: a.toothId || "all",
                    patientId,
                    toothLabel: a.toothId || "",
                  },
                })
              }
            >
              <Text style={styles.detailBtnText}>Ziyaret Detayı →</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f3f4f6" },
  pageTitle: { fontSize: 24, fontWeight: "700", color: "#111827", marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: "#6b7280", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  card: {
    backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: "700", color: "#111827", flex: 1, marginRight: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  dateText: { fontSize: 13, color: "#6b7280" },
  emptyCard: { backgroundColor: "#fff", borderRadius: 12, padding: 20, alignItems: "center" },
  emptyText: { color: "#9ca3af", fontSize: 13 },
  metaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  metaText: { fontSize: 12, color: "#6b7280" },
  detailBtn: {
    marginTop: 10,
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#eff6ff",
    borderRadius: 8,
  },
  detailBtnText: { fontSize: 12, color: "#2563eb", fontWeight: "600" },
});
