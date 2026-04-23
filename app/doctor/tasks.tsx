// app/doctor/tasks.tsx — Treatment plan items (tasks) from GET /api/doctor/tasks
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../lib/auth";
import { useLanguage } from "../../lib/language-context";
import { API_BASE, setAuthToken } from "../../lib/api";

type DoctorTask = {
  id: string;
  patient_id: string;
  patient: { id: string; name: string };
  treatment_plan_id: string;
  tooth_number: string;
  procedure_name: string;
  status: string;
  due_date: string | null;
  high_priority?: boolean;
};

function fmtDue(d: string | null | undefined) {
  if (!d) return "—";
  try {
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return String(d);
    return x.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return String(d);
  }
}

export default function DoctorTasksScreen() {
  const router = useRouter();
  const { t } = useLanguage();
  const { user } = useAuth();
  const token = user?.token ?? "";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<DoctorTask[]>([]);
  const [patchingId, setPatchingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      setAuthToken(token);
      const res = await fetch(`${API_BASE}/api/doctor/tasks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { ok?: boolean; tasks?: DoctorTask[]; error?: string };
      if (!data?.ok) throw new Error(String(data?.error || `HTTP ${res.status}`));
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setTasks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    void load();
  };

  const markDone = (task: DoctorTask) => {
    Alert.alert(
      t("doctor.tasks.doneTitle"),
      t("doctor.tasks.doneMessage"),
      [
        { text: t("doctor.tasks.cancel"), style: "cancel" },
        {
          text: t("doctor.tasks.markDone"),
          onPress: async () => {
            setPatchingId(task.id);
            try {
              setAuthToken(token);
              const res = await fetch(`${API_BASE}/api/doctor/tasks/${encodeURIComponent(task.id)}`, {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ status: "COMPLETED" }),
              });
              const data = (await res.json()) as { ok?: boolean };
              if (!data?.ok) throw new Error("update_failed");
              await load();
            } catch {
              Alert.alert(t("doctor.tasks.error"), t("doctor.tasks.patchError"));
            } finally {
              setPatchingId(null);
            }
          },
        },
      ]
    );
  };

  const statusLabel = (s: string) => {
    const u = String(s || "").toUpperCase();
    if (u === "IN_PROGRESS" || u === "ACTIVE") return t("doctor.status.inProgress");
    return t("doctor.status.scheduled");
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t("doctor.tasks.title")}</Text>
        <Pressable style={styles.homeBtn} onPress={() => router.replace("/doctor")}>
          <Text style={styles.homeBtnText}>⌂ {t("nav.dashboard")}</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.err}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => { setLoading(true); void load(); }}>
            <Text style={styles.retryText}>{t("requests.retry")}</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />}
          showsVerticalScrollIndicator={false}
        >
          {tasks.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyIcon}>📋</Text>
              <Text style={styles.emptyTitle}>{t("doctor.tasks.empty")}</Text>
            </View>
          ) : (
            tasks.map((task) => (
              <View key={task.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.proc}>{task.procedure_name}</Text>
                  {task.high_priority ? <Text style={styles.badge}>!</Text> : null}
                </View>
                <Text style={styles.patient}>{task.patient?.name || task.patient_id}</Text>
                {task.tooth_number ? (
                  <Text style={styles.meta}>
                    {t("doctor.tasks.tooth")} {task.tooth_number}
                  </Text>
                ) : null}
                <Text style={styles.meta}>
                  {statusLabel(task.status)} · {fmtDue(task.due_date)}
                </Text>
                <Pressable
                  style={[styles.doneBtn, patchingId === task.id && styles.doneBtnDisabled]}
                  disabled={patchingId === task.id}
                  onPress={() => markDone(task)}
                >
                  <Text style={styles.doneBtnText}>
                    {patchingId === task.id ? "…" : t("doctor.tasks.markDone")}
                  </Text>
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  backBtn: { padding: 8, marginRight: 4 },
  backBtnText: { fontSize: 20, color: "#2563eb" },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: "700", color: "#0f172a" },
  homeBtn: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: "#eff6ff", borderRadius: 8 },
  homeBtnText: { fontSize: 13, color: "#1d4ed8", fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  err: { color: "#b91c1c", textAlign: "center", marginBottom: 12 },
  retry: { paddingVertical: 10, paddingHorizontal: 20, backgroundColor: "#2563eb", borderRadius: 10 },
  retryText: { color: "#fff", fontWeight: "600" },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, paddingBottom: 32 },
  emptyBox: { alignItems: "center", paddingVertical: 48 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, color: "#64748b", textAlign: "center" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  proc: { flex: 1, fontSize: 16, fontWeight: "700", color: "#0f172a" },
  badge: {
    marginLeft: 8,
    fontWeight: "900",
    color: "#dc2626",
    fontSize: 16,
  },
  patient: { fontSize: 15, color: "#334155", marginTop: 6 },
  meta: { fontSize: 13, color: "#64748b", marginTop: 4 },
  doneBtn: {
    marginTop: 12,
    alignSelf: "flex-start",
    backgroundColor: "#16a34a",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  doneBtnDisabled: { opacity: 0.6 },
  doneBtnText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
