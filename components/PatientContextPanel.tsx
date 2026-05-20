import { StyleSheet, Text, View } from "react-native";

import type { AiState, CurrentStrategy, LeadHeat, WorkspaceProfile } from "@/lib/coordinationWorkspaceTypes";

const CONTEXT_LABELS: Record<string, string> = {
  local_patient: "Yerel hasta",
  domestic_traveler: "Yurt içi seyahat",
  international_patient: "Uluslararası",
};

type Props = {
  profile?: WorkspaceProfile | null;
  aiState?: AiState;
  leadHeat?: LeadHeat;
  strategy?: CurrentStrategy;
};

export function PatientContextPanel({ profile, aiState, leadHeat, strategy }: Props) {
  const heatColor = leadHeat?.isHot
    ? "#dc2626"
    : (leadHeat?.score ?? 0) >= 60
      ? "#d97706"
      : "#6b7280";

  const readiness = strategy?.readinessPercent ?? null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.patientName}>{profile?.patientName || "Hasta"}</Text>
      {profile?.treatmentInterest ? (
        <Text style={styles.line}>🦷 {profile.treatmentInterest}</Text>
      ) : null}
      {profile?.country ? <Text style={styles.line}>🌍 {profile.country}</Text> : null}

      {profile?.conversationSummary?.trim() ? (
        <View style={styles.summaryBox}>
          <Text style={styles.summaryTitle}>Konuşma özeti</Text>
          <Text style={styles.summaryText} numberOfLines={4}>
            {profile.conversationSummary}
          </Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Lead sıcaklığı</Text>
        <Text style={[styles.heat, { color: heatColor }]}>
          {leadHeat?.label || "—"}
          {leadHeat?.score != null ? ` · ${leadHeat.score}` : ""}
        </Text>
        {leadHeat?.messageCount != null ? (
          <Text style={styles.sub}>{leadHeat.messageCount} mesaj</Text>
        ) : null}
      </View>

      {readiness != null ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Hazırlık</Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${Math.min(100, Math.max(0, readiness))}%` }]} />
          </View>
          <Text style={styles.sub}>%{readiness}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AI modu</Text>
        <Text style={styles.value}>
          {aiState?.responderModeLabel || aiState?.coordinationMode || "—"}
        </Text>
        {aiState?.primaryResponderLabel ? (
          <Text style={styles.sub}>Sorumlu: {aiState.primaryResponderLabel}</Text>
        ) : null}
        {aiState?.handlingStateLabel ? (
          <Text style={styles.sub}>{aiState.handlingStateLabel}</Text>
        ) : null}
        <View style={styles.chips}>
          {aiState?.aiPaused ? <Badge label="AI duraklatıldı" tone="warn" /> : null}
          {aiState?.aiEscalationRequired ? <Badge label="Escalation" tone="danger" /> : null}
          {aiState?.autoReplyAllowed === false ? (
            <Badge label="Oto-yanıt kapalı" tone="muted" />
          ) : null}
          {aiState?.draftGenerationAllowed === false ? (
            <Badge label="Taslak kapalı" tone="muted" />
          ) : null}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Strateji</Text>
        <Text style={styles.value}>
          {CONTEXT_LABELS[strategy?.patientContextClass || ""] ||
            strategy?.patientContextClass ||
            "—"}
        </Text>
        {strategy?.journeyStageLabel ? (
          <Text style={styles.sub}>Aşama: {strategy.journeyStageLabel}</Text>
        ) : null}
        {strategy?.waitingPartyLabel ? (
          <Text style={styles.sub}>{strategy.waitingPartyLabel}</Text>
        ) : null}
        {strategy?.recentTopics?.length ? (
          <Text style={styles.sub} numberOfLines={2}>
            Son: {strategy.recentTopics.slice(-5).join(" · ")}
          </Text>
        ) : null}
        <View style={styles.chips}>
          {strategy?.travelContextDetected ? (
            <Badge label="Seyahat" tone="info" />
          ) : (
            <Badge label="Yerel varsayım" tone="muted" />
          )}
          {strategy?.pricingAlreadyDiscussed ? (
            <Badge label="Fiyat konuşuldu" tone="warn" />
          ) : null}
        </View>
      </View>

      {profile?.delegation?.statusLabel ? (
        <View style={styles.delegation}>
          <Text style={styles.sectionTitle}>Delegasyon</Text>
          <Text style={styles.value}>{profile.delegation.statusLabel}</Text>
        </View>
      ) : null}

      {strategy?.blockingReason ? (
        <View style={styles.alert}>
          <Text style={styles.alertText}>{strategy.blockingReason}</Text>
        </View>
      ) : null}

      {strategy?.nextAction ? (
        <View style={styles.nextBox}>
          <Text style={styles.nextLabel}>Önerilen aksiyon</Text>
          <Text style={styles.nextText}>{strategy.nextAction}</Text>
        </View>
      ) : null}
    </View>
  );
}

function Badge({
  label,
  tone,
}: {
  label: string;
  tone: "warn" | "danger" | "muted" | "info";
}) {
  const bg =
    tone === "danger"
      ? "#fef2f2"
      : tone === "warn"
        ? "#fffbeb"
        : tone === "info"
          ? "#eff6ff"
          : "#f3f4f6";
  const color =
    tone === "danger"
      ? "#b91c1c"
      : tone === "warn"
        ? "#b45309"
        : tone === "info"
          ? "#1d4ed8"
          : "#4b5563";
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
  },
  patientName: { fontSize: 17, fontWeight: "700", color: "#111827", marginBottom: 6 },
  line: { fontSize: 12, color: "#4b5563", marginBottom: 2 },
  summaryBox: {
    marginTop: 10,
    marginBottom: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  summaryTitle: { fontSize: 10, fontWeight: "700", color: "#166534", marginBottom: 4 },
  summaryText: { fontSize: 12, color: "#14532d", lineHeight: 17 },
  section: { marginTop: 12 },
  sectionTitle: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#9ca3af",
    marginBottom: 4,
  },
  heat: { fontSize: 18, fontWeight: "700" },
  value: { fontSize: 13, fontWeight: "600", color: "#111827" },
  sub: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  barTrack: {
    height: 8,
    backgroundColor: "#e2e8f0",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 4,
    marginBottom: 4,
  },
  barFill: { height: "100%", backgroundColor: "#0ea5e9", borderRadius: 999 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: "600" },
  delegation: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
  },
  alert: {
    marginTop: 12,
    backgroundColor: "#fffbeb",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  alertText: { fontSize: 11, color: "#92400e" },
  nextBox: {
    marginTop: 10,
    backgroundColor: "#f0f9ff",
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: "#bae6fd",
  },
  nextLabel: { fontSize: 10, fontWeight: "700", color: "#0369a1", marginBottom: 2 },
  nextText: { fontSize: 12, color: "#0c4a6e", lineHeight: 17 },
});
