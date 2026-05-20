import { StyleSheet, Text, View } from "react-native";

import type { ConversationTurn } from "@/lib/coordinationWorkspaceTypes";

type FeedStats = {
  total: number;
  patient: number;
  ai: number;
  human: number;
  doctor: number;
  system: number;
  drafts: number;
};

export function countFeedStats(feed: ConversationTurn[]): FeedStats {
  const stats: FeedStats = {
    total: feed.length,
    patient: 0,
    ai: 0,
    human: 0,
    doctor: 0,
    system: 0,
    drafts: 0,
  };
  for (const t of feed) {
    if (t.role === "patient") stats.patient += 1;
    else if (t.role === "ai") stats.ai += 1;
    else if (t.role === "human") stats.human += 1;
    else if (t.role === "doctor" || t.role === "doctor_intent") stats.doctor += 1;
    else if (t.kind === "ai_draft" || t.role === "ai_draft") stats.drafts += 1;
    else if (t.kind === "system" || t.role === "system") stats.system += 1;
  }
  return stats;
}

type Props = {
  patientName?: string;
  stats: FeedStats;
  latestPatientMessage?: string | null;
  latestAiReply?: string | null;
  nextStep?: string | null;
  blocker?: string | null;
  /** Mobile: tek satır özet — sabit büyük kahraman bloğu yok. */
  compact?: boolean;
};

export function CoordinationMissionBar({
  patientName,
  stats,
  latestPatientMessage,
  latestAiReply,
  nextStep,
  blocker,
  compact,
}: Props) {
  if (compact) {
    return (
      <View style={styles.compactWrap}>
        <View style={styles.compactTop}>
          <Text style={styles.compactName} numberOfLines={1}>
            {patientName || "Hasta"}
          </Text>
          <Text style={styles.compactStats}>
            {stats.total} olay · H{stats.patient} · AI{stats.ai}
          </Text>
        </View>
        {blocker ? (
          <Text style={styles.compactAlert} numberOfLines={2}>
            ⚠️ {blocker}
          </Text>
        ) : null}
        {!blocker && nextStep ? (
          <Text style={styles.compactNext} numberOfLines={2}>
            → {nextStep}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>Koordinasyon merkezi</Text>
        <Text style={styles.heroTitle}>{patientName || "Hasta"}</Text>
        <Text style={styles.heroSub}>
          Canlı süpervizyon · {stats.total} olay akışta
        </Text>
      </View>

      <View style={styles.statRow}>
        <StatCell label="Hasta" value={String(stats.patient)} tone="patient" />
        <StatCell label="AI" value={String(stats.ai)} tone="ai" />
        <StatCell label="Ekip" value={String(stats.human)} tone="human" />
        <StatCell label="Sistem" value={String(stats.system + stats.drafts)} tone="system" />
      </View>

      {blocker ? (
        <View style={styles.bannerDanger}>
          <Text style={styles.bannerTitle}>⚠️ Engel</Text>
          <Text style={styles.bannerBody}>{blocker}</Text>
        </View>
      ) : null}

      {nextStep ? (
        <View style={styles.bannerNext}>
          <Text style={styles.bannerTitle}>→ Sıradaki adım</Text>
          <Text style={styles.bannerBody}>{nextStep}</Text>
        </View>
      ) : null}

      <View style={styles.previewRow}>
        <View style={styles.previewCard}>
          <Text style={styles.previewLabel}>Son hasta</Text>
          <Text style={styles.previewText} numberOfLines={3}>
            {latestPatientMessage?.trim() || "Henüz mesaj yok"}
          </Text>
        </View>
        <View style={[styles.previewCard, styles.previewCardAi]}>
          <Text style={styles.previewLabel}>Son AI</Text>
          <Text style={styles.previewText} numberOfLines={3}>
            {latestAiReply?.trim() || "Henüz yanıt yok"}
          </Text>
        </View>
      </View>
    </View>
  );
}

function StatCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "patient" | "ai" | "human" | "system";
}) {
  const bg =
    tone === "patient"
      ? "#f8fafc"
      : tone === "ai"
        ? "#eff6ff"
        : tone === "human"
          ? "#ecfdf5"
          : "#faf5ff";
  const border =
    tone === "patient"
      ? "#e2e8f0"
      : tone === "ai"
        ? "#bfdbfe"
        : tone === "human"
          ? "#a7f3d0"
          : "#e9d5ff";
  return (
    <View style={[styles.statCell, { backgroundColor: bg, borderColor: border }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  compactWrap: {
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    gap: 4,
  },
  compactTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  compactName: { flex: 1, fontSize: 14, fontWeight: "700", color: "#111827" },
  compactStats: { fontSize: 11, fontWeight: "600", color: "#64748b" },
  compactAlert: { fontSize: 11, color: "#b91c1c", lineHeight: 15 },
  compactNext: { fontSize: 11, color: "#0369a1", lineHeight: 15 },
  wrap: { gap: 10, marginBottom: 12 },
  hero: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    padding: 16,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#94a3b8",
    marginBottom: 4,
  },
  heroTitle: { fontSize: 20, fontWeight: "800", color: "#f8fafc" },
  heroSub: { fontSize: 12, color: "#cbd5e1", marginTop: 4 },
  statRow: { flexDirection: "row", gap: 8 },
  statCell: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  statValue: { fontSize: 18, fontWeight: "800", color: "#111827" },
  statLabel: { fontSize: 10, fontWeight: "600", color: "#64748b", marginTop: 2 },
  bannerDanger: {
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: 10,
  },
  bannerNext: {
    backgroundColor: "#f0f9ff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#bae6fd",
    padding: 10,
  },
  bannerTitle: { fontSize: 11, fontWeight: "800", color: "#334155", marginBottom: 4 },
  bannerBody: { fontSize: 13, color: "#1e293b", lineHeight: 18 },
  previewRow: { flexDirection: "row", gap: 8 },
  previewCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 10,
    minHeight: 72,
  },
  previewCardAi: { backgroundColor: "#f8fafc", borderColor: "#bfdbfe" },
  previewLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    color: "#9ca3af",
    marginBottom: 4,
  },
  previewText: { fontSize: 12, color: "#374151", lineHeight: 17 },
});
