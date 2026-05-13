/**
 * Doctor message inbox — single GET /api/doctor/messages/thread-summary (no per-patient full hydrates).
 * Opening a row navigates to patient-chat, which loads GET /api/doctor/patient/:id/messages.
 */
import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth";
import { useLanguage } from "../../../lib/language-context";
import { setAuthToken } from "../../../lib/api";
import {
  fetchDoctorThreadSummary,
  invalidateDoctorMessagingCache,
  type DoctorThreadSummaryRow,
} from "../../../lib/doctorMessaging";
import { doctorPatientPrimaryKey } from "../../../lib/doctorPatientId";

function fmtPreviewTime(createdAt: number | null | undefined): string {
  if (createdAt == null || !Number.isFinite(Number(createdAt))) return "";
  try {
    const d = new Date(Number(createdAt));
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();
    if (sameDay) {
      return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  } catch {
    return "";
  }
}

export default function DoctorInboxScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const token = user?.token ?? "";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [threads, setThreads] = useState<DoctorThreadSummaryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (!token) return;
      setAuthToken(token);
      setError(null);
      try {
        const data = await fetchDoctorThreadSummary(token, {
          refresh: opts?.refresh === true,
          onlyActive: true,
        });
        setThreads(Array.isArray(data.threads) ? data.threads : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error");
        setThreads([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token]
  );

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load({ refresh: false });
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    invalidateDoctorMessagingCache();
    void load({ refresh: true });
  };

  const openThread = (row: DoctorThreadSummaryRow) => {
    const pk = doctorPatientPrimaryKey({
      id: row.patientDbId,
      patient_id: row.patientLegacyId,
      patientId: row.patientPublicId,
    });
    if (!pk) return;
    invalidateDoctorMessagingCache();
    router.push({
      pathname: "/doctor/patient-chat",
      params: {
        patientId: pk,
        patientName: encodeURIComponent(row.patientName || "Hasta"),
      },
    });
  };

  const tOr = (key: string, en: string) => {
    const v = t(key);
    return v !== key ? v : en;
  };

  const title = t("doctor.inbox.title") !== "doctor.inbox.title" ? t("doctor.inbox.title") : "Leads Inbox";

  return (
    <SafeAreaView style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Text style={styles.backTxt}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563eb" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.err}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => void load({ refresh: true })}>
            <Text style={styles.retryTxt}>{t("requests.retry") || "Retry"}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) =>
            String(item.patientDbId || item.patientPublicId || item.patientLegacyId || "").trim() || "row"
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563eb" />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTxt}>
                {t("doctor.inbox.empty") !== "doctor.inbox.empty"
                  ? t("doctor.inbox.empty")
                  : "No conversations yet."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const preview = item.lastMessage?.text?.trim() || "";
            const unread = Number(item.unreadFromPatient) || 0;
            const ts = fmtPreviewTime(item.lastActivityAt ?? item.lastMessage?.createdAt ?? null);
            const lead = item.leadPrimaryResponder;
            const isEnrolledShared = Boolean(lead && lead.threadIsLead === false);
            const leadBadge =
              t("doctor.inbox.leadBadge") !== "doctor.inbox.leadBadge" ? t("doctor.inbox.leadBadge") : "Lead";
            const unassignedLbl =
              t("doctor.inbox.unassigned") !== "doctor.inbox.unassigned"
                ? t("doctor.inbox.unassigned")
                : "Unassigned";
            const ownerPrefix =
              t("doctor.inbox.ownerPrefix") !== "doctor.inbox.ownerPrefix"
                ? t("doctor.inbox.ownerPrefix")
                : "Primary:";
            let ownerLine: string | null = null;
            if (lead && !isEnrolledShared) {
              ownerLine = lead.unassigned
                ? `${leadBadge} · ${unassignedLbl}`
                : `${leadBadge} · ${ownerPrefix} ${(lead.displayName || "").trim() || "—"}`;
            }
            if (isEnrolledShared) {
              ownerLine = tOr("doctor.inbox.enrolledStatusLine", "Clinic patient · thread continues under Patients");
            }

            if (isEnrolledShared) {
              return (
                <View style={styles.rowEnrolled}>
                  <View style={styles.enrolledAccent} />
                  <View style={styles.rowEnrolledInner}>
                    <View style={styles.rowEnrolledHeader}>
                      <View style={[styles.avatar, styles.avatarMuted]}>
                        <Text style={styles.avatarTxtMuted}>
                          {(item.patientName || "?").trim().charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.rowTop}>
                          <Text style={styles.nameEnrolled} numberOfLines={1}>
                            {item.patientName || "—"}
                          </Text>
                          {ts ? <Text style={styles.timeMuted}>{ts}</Text> : null}
                        </View>
                        {ownerLine ? (
                          <Text style={styles.enrolledStatusMuted} numberOfLines={2}>
                            {ownerLine}
                          </Text>
                        ) : null}
                      </View>
                      {unread > 0 ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeTxt}>{unread > 99 ? "99+" : String(unread)}</Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={styles.enrolledNotice}>
                      <Text style={styles.enrolledNoticeTitle}>
                        {tOr("doctor.inbox.enrolledNoticeTitle", "Joined your clinic")}
                      </Text>
                      <Text style={styles.enrolledNoticeBody}>
                        {tOr(
                          "doctor.inbox.enrolledNoticeBody",
                          "This patient has joined your clinic. Continue messaging from the Messages button on your Patients page. The conversation is the same — it moved with them, it did not disappear.",
                        )}
                      </Text>
                    </View>

                    {preview ? (
                      <Text style={styles.previewEnrolled} numberOfLines={2}>
                        <Text style={styles.previewEnrolledLabel}>
                          {tOr("doctor.inbox.lastMessageLabel", "Last:")}{" "}
                        </Text>
                        {preview}
                      </Text>
                    ) : null}

                    <Pressable
                      style={styles.enrolledCta}
                      onPress={() => openThread(item)}
                      accessibilityRole="button"
                      accessibilityLabel={tOr("doctor.inbox.openPatientChatCta", "Open patient chat")}
                    >
                      <Text style={styles.enrolledCtaTxt}>
                        {tOr("doctor.inbox.openPatientChatCta", "Open patient chat")}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            }

            return (
              <Pressable style={styles.row} onPress={() => openThread(item)}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarTxt}>
                    {(item.patientName || "?").trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.rowTop}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.patientName || "—"}
                    </Text>
                    {ts ? <Text style={styles.time}>{ts}</Text> : null}
                  </View>
                  {ownerLine ? (
                    <Text style={styles.ownerLine} numberOfLines={1}>
                      {ownerLine}
                    </Text>
                  ) : null}
                  {preview ? (
                    <Text style={styles.preview} numberOfLines={2}>
                      {preview}
                    </Text>
                  ) : (
                    <Text style={styles.previewMuted} numberOfLines={1}>
                      {t("doctor.inbox.noPreview") !== "doctor.inbox.noPreview"
                        ? t("doctor.inbox.noPreview")
                        : "No messages yet"}
                    </Text>
                  )}
                </View>
                {unread > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeTxt}>{unread > 99 ? "99+" : String(unread)}</Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
          contentContainerStyle={
            threads.length === 0 ? { flexGrow: 1 } : { paddingBottom: insets.bottom + 24 }
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f3f4f6" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  backTxt: { fontSize: 22, color: "#111827" },
  headerTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  err: { color: "#b91c1c", marginBottom: 12, textAlign: "center" },
  retryBtn: { backgroundColor: "#2563eb", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  retryTxt: { color: "#fff", fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarTxt: { fontSize: 18, fontWeight: "700", color: "#1d4ed8" },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  ownerLine: { fontSize: 12, fontWeight: "600", color: "#047857", marginTop: 2 },
  enrolledHint: {
    fontSize: 11,
    fontWeight: "600",
    color: "#1D4ED8",
    marginTop: 4,
    lineHeight: 15,
  },
  name: { fontSize: 16, fontWeight: "600", color: "#111827", flex: 1 },
  time: { fontSize: 12, color: "#9ca3af" },
  preview: { fontSize: 14, color: "#4b5563", marginTop: 4 },
  previewMuted: { fontSize: 14, color: "#9ca3af", marginTop: 4, fontStyle: "italic" },
  badge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: "#dc2626",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTxt: { color: "#fff", fontSize: 12, fontWeight: "800" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  emptyTxt: { fontSize: 15, color: "#6b7280", textAlign: "center" },
  rowEnrolled: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: "#faf5ff",
    borderBottomWidth: 1,
    borderBottomColor: "#ede9fe",
  },
  enrolledAccent: { width: 4, backgroundColor: "#7c3aed" },
  rowEnrolledInner: { flex: 1, paddingHorizontal: 14, paddingVertical: 14, gap: 10 },
  rowEnrolledHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  avatarMuted: { backgroundColor: "#e9d5ff" },
  avatarTxtMuted: { fontSize: 18, fontWeight: "700", color: "#5b21b6" },
  nameEnrolled: { fontSize: 16, fontWeight: "700", color: "#4c1d95", flex: 1 },
  timeMuted: { fontSize: 12, color: "#a78bfa" },
  enrolledStatusMuted: { fontSize: 12, fontWeight: "600", color: "#6b21a8", marginTop: 2 },
  enrolledNotice: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ddd6fe",
  },
  enrolledNoticeTitle: { fontSize: 14, fontWeight: "800", color: "#4c1d95", marginBottom: 6 },
  enrolledNoticeBody: { fontSize: 13, lineHeight: 19, color: "#5b21b6", fontWeight: "500" },
  previewEnrolled: { fontSize: 12, color: "#6b7280", lineHeight: 17 },
  previewEnrolledLabel: { fontWeight: "700", color: "#9ca3af" },
  enrolledCta: {
    alignSelf: "stretch",
    backgroundColor: "#7c3aed",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  enrolledCtaTxt: { color: "#fff", fontSize: 15, fontWeight: "800" },
});
