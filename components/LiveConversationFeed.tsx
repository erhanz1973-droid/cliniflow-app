import { useEffect, useRef } from "react";
import { FlatList, StyleSheet, Text, View, type ViewStyle } from "react-native";

import type { ConversationTurn } from "@/lib/coordinationWorkspaceTypes";

type BubbleStyleKey =
  | "bubblePatient"
  | "bubbleAi"
  | "bubbleHuman"
  | "bubbleDoctor"
  | "bubbleIntent"
  | "bubbleDraft"
  | "bubbleSystem";

type RoleMeta = {
  emoji: string;
  label: string;
  bubbleKey: BubbleStyleKey;
  labelColor: string;
  caption?: string;
};

const ROLE_META: Record<string, RoleMeta> = {
  patient: {
    emoji: "👤",
    label: "Hasta",
    bubbleKey: "bubblePatient",
    labelColor: "#1e40af",
  },
  ai: {
    emoji: "🤖",
    label: "AI Koordinatör",
    bubbleKey: "bubbleAi",
    labelColor: "#0369a1",
  },
  human: {
    emoji: "💬",
    label: "Klinik ekibi",
    bubbleKey: "bubbleHuman",
    labelColor: "#047857",
  },
  doctor: {
    emoji: "👨‍⚕️",
    label: "Doktor",
    bubbleKey: "bubbleDoctor",
    labelColor: "#7c2d12",
  },
  doctor_intent: {
    emoji: "👨‍⚕️",
    label: "Doktor rehberliği",
    bubbleKey: "bubbleIntent",
    labelColor: "#6b21a8",
    caption: "İç not — hastaya gönderilmez",
  },
  ai_draft: {
    emoji: "🤖",
    label: "AI taslağı",
    bubbleKey: "bubbleDraft",
    labelColor: "#4338ca",
    caption: "Onay bekliyor",
  },
  system: {
    emoji: "⚙️",
    label: "Sistem",
    bubbleKey: "bubbleSystem",
    labelColor: "#6b7280",
  },
};

function formatTime(iso?: string) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("tr-TR", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function metaForTurn(item: ConversationTurn): RoleMeta {
  if (item.kind === "system" || item.role === "system") {
    return ROLE_META.system;
  }
  return ROLE_META[item.role] || ROLE_META.system;
}

type Props = {
  turns: ConversationTurn[];
  patientName?: string;
  flex?: boolean;
  /** Render static rows inside a parent ScrollView (no nested VirtualizedList). */
  embedInParentScroll?: boolean;
};

function TurnRow({
  item,
  patientName,
}: {
  item: ConversationTurn;
  patientName?: string;
}) {
  const meta = metaForTurn(item);
  const bubbleStyle = styles[meta.bubbleKey] as ViewStyle;
  const isSystem = item.kind === "system" || item.role === "system";
  const displayLabel = String(item.label || "").trim();
  const who =
    item.role === "patient" && patientName
      ? patientName
      : displayLabel || meta.label;

  return (
    <View style={[styles.turn, isSystem && styles.turnSystem]}>
      <Text style={[styles.who, { color: meta.labelColor }]}>
        {meta.emoji} {who}
        {item.at ? <Text style={styles.time}> · {formatTime(item.at)}</Text> : null}
      </Text>
      {meta.caption ? <Text style={styles.caption}>{meta.caption}</Text> : null}
      {item.label && item.kind !== "system" ? (
        <Text style={styles.eventLabel}>{item.label}</Text>
      ) : null}
      <View style={[styles.bubble, bubbleStyle, isSystem && styles.bubbleSystemOnly]}>
        <Text style={[styles.body, isSystem && styles.bodySystem]}>{item.text}</Text>
      </View>
    </View>
  );
}

export function LiveConversationFeed({
  turns,
  patientName,
  flex,
  embedInParentScroll = false,
}: Props) {
  const listRef = useRef<FlatList<ConversationTurn>>(null);

  useEffect(() => {
    if (embedInParentScroll || turns.length === 0) return;
    listRef.current?.scrollToEnd({ animated: true });
  }, [embedInParentScroll, turns.length, turns[turns.length - 1]?.id]);

  if (!turns.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Henüz mesaj yok</Text>
        <Text style={styles.emptyBody}>
          Hasta veya AI yanıtları burada görünür. Üstteki “Son hasta” özetinde metin varsa ↻ ile yenileyin.
        </Text>
      </View>
    );
  }

  if (embedInParentScroll) {
    return (
      <View style={[styles.list, styles.listEmbedded]}>
        {turns.map((item) => (
          <TurnRow key={item.id} item={item} patientName={patientName} />
        ))}
      </View>
    );
  }

  return (
    <FlatList
      ref={listRef}
      data={turns}
      keyExtractor={(item) => item.id}
      style={[styles.list, flex && styles.listFlex]}
      contentContainerStyle={styles.listContent}
      renderItem={({ item }) => <TurnRow item={item} patientName={patientName} />}
    />
  );
}

const styles = StyleSheet.create({
  list: { maxHeight: 360 },
  listEmbedded: { maxHeight: undefined, paddingVertical: 8, gap: 14, paddingBottom: 16 },
  listFlex: { flex: 1, maxHeight: undefined },
  listContent: { paddingVertical: 8, gap: 14, paddingBottom: 16 },
  turn: { marginBottom: 2 },
  turnSystem: { marginVertical: 4 },
  who: { fontSize: 12, fontWeight: "700", marginBottom: 2 },
  time: { fontWeight: "400", color: "#9ca3af" },
  caption: { fontSize: 10, color: "#9ca3af", marginBottom: 4, fontStyle: "italic" },
  eventLabel: { fontSize: 10, color: "#6b7280", marginBottom: 4, fontWeight: "600" },
  bubble: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
  },
  bubblePatient: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    alignSelf: "flex-start",
    maxWidth: "94%",
  },
  bubbleAi: {
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
    alignSelf: "flex-start",
    maxWidth: "94%",
  },
  bubbleHuman: {
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    alignSelf: "flex-start",
    maxWidth: "94%",
  },
  bubbleDoctor: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    alignSelf: "flex-start",
    maxWidth: "94%",
  },
  bubbleIntent: {
    backgroundColor: "#faf5ff",
    borderColor: "#e9d5ff",
    borderStyle: "dashed",
    alignSelf: "flex-start",
    maxWidth: "94%",
  },
  bubbleDraft: {
    backgroundColor: "#eef2ff",
    borderColor: "#c7d2fe",
    borderStyle: "dashed",
    alignSelf: "flex-start",
    maxWidth: "94%",
  },
  bubbleSystem: {
    backgroundColor: "#f9fafb",
    borderColor: "#e5e7eb",
    alignSelf: "stretch",
    maxWidth: "100%",
  },
  bubbleSystemOnly: {
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  body: { fontSize: 14, lineHeight: 21, color: "#111827" },
  bodySystem: { fontSize: 12, color: "#4b5563", textAlign: "center" },
  empty: {
    padding: 20,
    alignItems: "center",
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    flex: 1,
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 14, fontWeight: "600", color: "#374151", marginBottom: 4 },
  emptyBody: { fontSize: 12, color: "#6b7280", textAlign: "center", lineHeight: 18 },
});
