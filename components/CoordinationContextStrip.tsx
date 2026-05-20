import { StyleSheet, Text, View } from "react-native";

import type { AiState, CurrentStrategy, LeadHeat } from "@/lib/coordinationWorkspaceTypes";

const CONTEXT_LABELS: Record<string, string> = {
  local_patient: "Yerel hasta",
  domestic_traveler: "Yurt içi seyahat",
  international_patient: "Uluslararası",
  unknown_context: "Bağlam bilinmiyor",
};

type Props = {
  aiState?: AiState;
  leadHeat?: LeadHeat;
  strategy?: CurrentStrategy;
};

export function CoordinationContextStrip({ aiState, leadHeat, strategy }: Props) {
  const heatColor = leadHeat?.isHot
    ? "#dc2626"
    : (leadHeat?.score ?? 0) >= 60
      ? "#d97706"
      : "#6b7280";

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>AI durumu</Text>
        <Text style={styles.primary}>
          {aiState?.primaryResponderLabel || "—"} · {aiState?.responderModeLabel || "—"}
        </Text>
        {aiState?.handlingStateLabel ? (
          <Text style={styles.sub}>{aiState.handlingStateLabel}</Text>
        ) : null}
        <View style={styles.chips}>
          {aiState?.aiPaused ? <Chip label="AI duraklatıldı" tone="warn" /> : null}
          {aiState?.aiEscalationRequired ? <Chip label="Escalation" tone="danger" /> : null}
          {aiState?.autoReplyAllowed === false ? (
            <Chip label="Otomatik yanıt kapalı" tone="muted" />
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Lead sıcaklığı</Text>
        <Text style={[styles.heat, { color: heatColor }]}>
          {leadHeat?.label || "—"}
          {leadHeat?.score != null ? ` · ${leadHeat.score}` : ""}
        </Text>
        {leadHeat?.messageCount != null ? (
          <Text style={styles.sub}>{leadHeat.messageCount} mesaj</Text>
        ) : null}
      </View>

      <View style={[styles.card, styles.cardWide]}>
        <Text style={styles.cardTitle}>Güncel strateji</Text>
        <Text style={styles.primary}>
          {CONTEXT_LABELS[strategy?.patientContextClass || ""] ||
            strategy?.patientContextClass ||
            "—"}
        </Text>
        {strategy?.journeyStageLabel ? (
          <Text style={styles.sub}>Yolculuk: {strategy.journeyStageLabel}</Text>
        ) : null}
        {strategy?.readinessPercent != null ? (
          <Text style={styles.sub}>Hazırlık: %{strategy.readinessPercent}</Text>
        ) : null}
        {strategy?.waitingPartyLabel ? (
          <Text style={styles.sub}>{strategy.waitingPartyLabel}</Text>
        ) : null}
        {strategy?.travelContextDetected ? (
          <Chip label="Seyahat bağlamı açık" tone="info" />
        ) : (
          <Chip label="Yerel hasta varsayımı" tone="muted" />
        )}
        {strategy?.pricingAlreadyDiscussed ? (
          <Chip label="Fiyat konuşuldu" tone="warn" />
        ) : null}
        {strategy?.recentTopics?.length ? (
          <Text style={styles.sub} numberOfLines={2}>
            Son konular: {strategy.recentTopics.slice(-4).join(", ")}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Chip({
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
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  card: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 140,
    backgroundColor: "#fff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 10,
  },
  cardWide: { flexBasis: "100%" },
  cardTitle: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#9ca3af",
    marginBottom: 4,
  },
  primary: { fontSize: 13, fontWeight: "600", color: "#111827" },
  sub: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  heat: { fontSize: 16, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 6 },
  chip: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  chipText: { fontSize: 10, fontWeight: "600" },
});
