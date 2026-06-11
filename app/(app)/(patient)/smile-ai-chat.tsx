import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../../lib/language-context";
import { useAuth } from "../../../lib/auth";
import { postAiCoordinatorChat } from "../../../lib/aiCoordinator/api";
import { parseSmileContextFromRoute } from "../../../lib/smileScoreNavigation";
import { formatSmileScore } from "../../../lib/smileScore";

type ChatRow = { id: string; role: "user" | "assistant"; text: string };

const SUGGESTED_KEYS = [
  "smileScore.suggest.whyScore",
  "smileScore.suggest.improve",
  "smileScore.suggest.whitening",
  "smileScore.suggest.alignment",
] as const;

export default function SmileAiChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ clinicId?: string; smileContextJson?: string }>();

  const smileContext = useMemo(
    () => parseSmileContextFromRoute(params.smileContextJson),
    [params.smileContextJson],
  );

  const [input, setInput] = useState("");
  const [rows, setRows] = useState<ChatRow[]>(() => {
    if (!smileContext) return [];
    return [
      {
        id: "welcome",
        role: "assistant",
        text: t("smileScore.chatWelcome", {
          score: formatSmileScore(smileContext.smileScore),
        }),
      },
    ];
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summaryRef = useRef("");

  const sendMessage = useCallback(
    async (text: string) => {
      const msg = String(text || "").trim();
      if (!msg || loading) return;
      if (!smileContext) {
        setError(t("smileScore.chatNoContext"));
        return;
      }

      const userRow: ChatRow = { id: `u_${Date.now()}`, role: "user", text: msg };
      setInput("");
      setLoading(true);
      setError(null);

      const history = [
        ...rows
          .filter((r) => r.id !== "welcome")
          .slice(-8)
          .map((r) => ({ role: r.role, text: r.text })),
        { role: "user" as const, text: msg },
      ];
      setRows((prev) => [...prev, userRow]);

      try {
        const result = await postAiCoordinatorChat({
          message: msg,
          patientId: user?.patientId || user?.id,
          clinicId: params.clinicId,
          contextMode: "treatment_guide",
          history,
          conversationSummary: summaryRef.current || null,
          smileAnalysisContext: smileContext,
        });
        summaryRef.current = result.conversationSummary || summaryRef.current;
        setRows((prev) => [
          ...prev,
          { id: `a_${Date.now()}`, role: "assistant", text: result.reply },
        ]);
      } catch (e) {
        const err = e as { message?: string };
        setError(String(err?.message || t("common.error")));
      } finally {
        setLoading(false);
      }
    },
    [loading, smileContext, rows, user, params.clinicId, t],
  );

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={8}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color="#111827" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("smileScore.askAi")}</Text>
        <View style={{ width: 26 }} />
      </View>

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View
            style={[
              styles.bubble,
              item.role === "user" ? styles.bubbleUser : styles.bubbleAi,
            ]}
          >
            <Text
              style={[
                styles.bubbleText,
                item.role === "user" ? styles.bubbleTextUser : styles.bubbleTextAi,
              ]}
            >
              {item.text}
            </Text>
          </View>
        )}
        ListFooterComponent={
          loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#2563eb" />
            </View>
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : null
        }
      />

      <View style={styles.suggestRow}>
        {SUGGESTED_KEYS.map((key) => (
          <TouchableOpacity
            key={key}
            style={styles.suggestChip}
            onPress={() => void sendMessage(t(key))}
            disabled={loading}
          >
            <Text style={styles.suggestText} numberOfLines={2}>
              {t(key)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={t("smileScore.chatPlaceholder")}
          placeholderTextColor="#94a3b8"
          multiline
          maxLength={2000}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendDisabled]}
          onPress={() => void sendMessage(input)}
          disabled={!input.trim() || loading}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#f8fafc" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#111827" },
  list: { padding: 16, gap: 10, paddingBottom: 8 },
  bubble: {
    maxWidth: "88%",
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    backgroundColor: "#2563eb",
  },
  bubbleAi: {
    alignSelf: "flex-start",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: "#fff" },
  bubbleTextAi: { color: "#1e293b" },
  loadingRow: { paddingVertical: 12, alignItems: "center" },
  errorText: { color: "#b91c1c", fontSize: 13, paddingHorizontal: 4 },
  suggestRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  suggestChip: {
    backgroundColor: "#ecfdf5",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    maxWidth: "48%",
  },
  suggestText: { fontSize: 12, fontWeight: "600", color: "#047857" },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  sendDisabled: { opacity: 0.45 },
});
