import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  type ListRenderItemInfo,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/language-context";
import {
  AI_COORDINATOR_WELCOME_MESSAGE,
  AI_TREATMENT_GUIDE_WELCOME_MESSAGE,
} from "../../lib/aiCoordinator/constants";
import {
  buildCoordinatorHistory,
  createAiCoordinatorMessage,
  createInitialAiCoordinatorMessages,
  emptyLeadData,
  postAiCoordinatorChat,
  type AiCoordinatorApiError,
  type AiCoordinatorContextMode,
  type AiCoordinatorMessage,
  type AiLeadData,
} from "../../lib/aiCoordinator";
import type { TreatmentGuideIntakeState } from "../../lib/treatmentGuide/intakeApi";
import { LeadInsightsBar } from "./LeadInsightsBar";

type Props = {
  clinicId?: string | null;
  patientId?: string | null;
  sessionId?: string | null;
  onBack?: () => void;
  /** Section inside Treatment Guide — no full-screen chrome. */
  embedded?: boolean;
  contextMode?: AiCoordinatorContextMode;
  /** Prefill composer (e.g. patient-reported narrative from intake). */
  initialDraft?: string;
  /** Session lead profile including patientReportedTags from goal chips. */
  priorLeadData?: AiLeadData | null;
  onIntakeUpdate?: (state: TreatmentGuideIntakeState) => void;
  style?: StyleProp<ViewStyle>;
};

function TypingBubble() {
  const { t } = useLanguage();
  return (
    <View style={[styles.row, styles.rowAssistant]}>
      <View style={[styles.bubble, styles.bubbleAssistant, styles.typingBubble]}>
        <ActivityIndicator size="small" color="#2563EB" />
        <Text style={styles.typingLabel}>{t("aiCoordinator.typing")}</Text>
      </View>
    </View>
  );
}

function MessageBubble({ item }: { item: AiCoordinatorMessage }) {
  const isPatient = item.role === "patient";
  return (
    <View style={[styles.row, isPatient ? styles.rowPatient : styles.rowAssistant]}>
      <View
        style={[
          styles.bubble,
          isPatient ? styles.bubblePatient : styles.bubbleAssistant,
          item.failed && styles.bubbleFailed,
        ]}
      >
        <Text style={[styles.bubbleText, isPatient && styles.bubbleTextPatient]}>{item.text}</Text>
        {item.pending ? (
          <ActivityIndicator
            size="small"
            color={isPatient ? "#fff" : "#2563EB"}
            style={styles.pendingSpinner}
          />
        ) : null}
      </View>
    </View>
  );
}

export function AiCoordinatorChatView({
  clinicId,
  patientId,
  sessionId: sessionIdProp,
  onBack,
  embedded = false,
  contextMode = "coordinator",
  initialDraft = "",
  priorLeadData: priorLeadDataProp,
  onIntakeUpdate,
  style,
}: Props) {
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const listRef = useRef<FlatList<AiCoordinatorMessage>>(null);
  const isGuide = contextMode === "treatment_guide";
  /** Embedded in Treatment Guide ScrollView — must not use FlatList (nested virtualized list). */
  const useStaticMessageList = embedded;

  const welcomeMessage = isGuide ? AI_TREATMENT_GUIDE_WELCOME_MESSAGE : AI_COORDINATOR_WELCOME_MESSAGE;

  const [messages, setMessages] = useState<AiCoordinatorMessage[]>(() =>
    createInitialAiCoordinatorMessages(welcomeMessage),
  );
  const [sessionLeadData, setSessionLeadData] = useState<AiLeadData>(
    () => priorLeadDataProp ?? emptyLeadData(),
  );
  const [leadSummarySections, setLeadSummarySections] = useState<
    Array<{ id: string; title: string; bullets: string[] }>
  >([]);
  const [leadSummaryLines, setLeadSummaryLines] = useState<string[]>([]);
  const [conversationSummary, setConversationSummary] = useState("");
  const [draft, setDraft] = useState(() => String(initialDraft || "").trim());
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolvedClinicId = String(clinicId || "").trim() || null;
  const resolvedPatientId = String(patientId || "").trim() || null;
  const sessionId = useMemo(
    () => String(sessionIdProp || "").trim() || `aic_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    [sessionIdProp],
  );

  useEffect(() => {
    const next = String(initialDraft || "").trim();
    if (next) setDraft(next);
  }, [initialDraft]);

  useEffect(() => {
    if (priorLeadDataProp) setSessionLeadData(priorLeadDataProp);
  }, [priorLeadDataProp]);

  const scrollToLatest = useCallback(() => {
    if (useStaticMessageList) return;
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated: true });
    });
  }, [useStaticMessageList]);

  useEffect(() => {
    scrollToLatest();
  }, [messages.length, sending, scrollToLatest]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;

    setError(null);
    setDraft("");

    const patientMsg = createAiCoordinatorMessage("patient", text);
    setMessages((prev) => [...prev, patientMsg]);
    setSending(true);

    try {
      const history = buildCoordinatorHistory(messages, patientMsg.id);
      const {
        reply,
        leadData,
        leadSummarySections: nextLeadSummarySections,
        leadSummaryLines: nextLeadSummaryLines,
        conversationSummary: nextSummary,
        intake,
      } = await postAiCoordinatorChat({
        message: text,
        sessionId,
        contextMode,
        ...(resolvedClinicId ? { clinicId: resolvedClinicId } : {}),
        ...(resolvedPatientId ? { patientId: resolvedPatientId } : {}),
        history,
        conversationSummary,
        priorLeadData: sessionLeadData,
      });
      setSessionLeadData(leadData);
      if (nextLeadSummarySections.length) setLeadSummarySections(nextLeadSummarySections);
      if (nextLeadSummaryLines.length) setLeadSummaryLines(nextLeadSummaryLines);
      if (intake) onIntakeUpdate?.(intake);
      if (nextSummary) setConversationSummary(nextSummary);
      setMessages((prev) => [
        ...prev,
        createAiCoordinatorMessage("assistant", reply, { leadHints: leadData }),
      ]);
    } catch (err: unknown) {
      const apiErr = err as AiCoordinatorApiError;
      const fallback = t("aiCoordinator.sendFailed");
      setError(apiErr?.message || fallback);
      setMessages((prev) =>
        prev.map((m) => (m.id === patientMsg.id ? { ...m, failed: true, pending: false } : m)),
      );
    } finally {
      setSending(false);
    }
  }, [
    draft,
    sending,
    contextMode,
    resolvedClinicId,
    resolvedPatientId,
    sessionId,
    sessionLeadData,
    conversationSummary,
    messages,
    onIntakeUpdate,
    t,
  ]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<AiCoordinatorMessage>) => <MessageBubble item={item} />,
    [],
  );

  const keyExtractor = useCallback((item: AiCoordinatorMessage) => item.id, []);

  const canSend = draft.trim().length > 0 && !sending;

  const title = isGuide ? t("treatmentGuide.chat.title") : t("aiCoordinator.title");
  const subtitle = isGuide ? t("treatmentGuide.chat.subtitle") : t("aiCoordinator.subtitle");
  const placeholder = isGuide
    ? t("treatmentGuide.chat.inputPlaceholder")
    : t("aiCoordinator.inputPlaceholder");

  const header = embedded ? (
    <View style={styles.embeddedHeader}>
      <Text style={styles.embeddedTitle}>{title}</Text>
      <Text style={styles.embeddedSub}>{subtitle}</Text>
    </View>
  ) : (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          style={styles.backBtn}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("common.back")}
        >
          <Ionicons name="chevron-back" size={24} color="#111827" />
        </Pressable>
      ) : (
        <View style={styles.backPlaceholder} />
      )}
      <View style={styles.headerCenter}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSub}>{subtitle}</Text>
      </View>
      <View style={styles.backPlaceholder} />
    </View>
  );

  const insightsBar = (
    <LeadInsightsBar
      leadData={sessionLeadData}
      leadSummarySections={leadSummarySections}
      leadSummaryLines={leadSummaryLines}
      variant={isGuide ? "treatment_guide" : "coordinator"}
    />
  );

  const messageList = useStaticMessageList ? (
    <View style={styles.embeddedMessageStack}>
      {messages.map((item) => (
        <MessageBubble key={item.id} item={item} />
      ))}
      {sending ? <TypingBubble /> : null}
    </View>
  ) : (
    <FlatList
      ref={listRef}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      data={messages}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListFooterComponent={sending ? TypingBubble : null}
      onContentSizeChange={scrollToLatest}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    />
  );

  const composer = (
    <View
      style={[
        styles.composer,
        embedded ? styles.composerEmbedded : { paddingBottom: Math.max(insets.bottom, 12) },
      ]}
    >
      <TextInput
        style={styles.input}
        value={draft}
        onChangeText={setDraft}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        multiline
        maxLength={4000}
        editable={!sending}
        returnKeyType="send"
        blurOnSubmit={false}
        onSubmitEditing={() => {
          if (canSend) void handleSend();
        }}
      />
      <Pressable
        onPress={() => void handleSend()}
        disabled={!canSend}
        style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
        accessibilityRole="button"
        accessibilityLabel={t("aiCoordinator.send")}
        accessibilityState={{ disabled: !canSend }}
      >
        {sending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Ionicons name="send" size={20} color="#fff" />
        )}
      </Pressable>
    </View>
  );

  const errorBanner = error ? (
    <View style={styles.errorBanner} accessibilityRole="alert">
      <Text style={styles.errorText}>{error}</Text>
      <Pressable onPress={() => setError(null)} hitSlop={8}>
        <Ionicons name="close-circle" size={20} color="#b91c1c" />
      </Pressable>
    </View>
  ) : null;

  if (embedded) {
    return (
      <View style={[styles.embeddedWrap, style]}>
        {header}
        {insightsBar}
        <View style={styles.embeddedChatBox}>{messageList}</View>
        {errorBanner}
        {composer}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? insets.top + 56 : 0}
    >
      {header}
      {insightsBar}
      {messageList}
      {errorBanner}
      {composer}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#f8faff" },
  embeddedWrap: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  embeddedHeader: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    backgroundColor: "#f8fafc",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  embeddedTitle: { fontSize: 16, fontWeight: "800", color: "#0f172a" },
  embeddedSub: { fontSize: 12, color: "#64748b", marginTop: 4, lineHeight: 17 },
  embeddedChatBox: { backgroundColor: "#f8faff" },
  embeddedMessageStack: {
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  backPlaceholder: { width: 40 },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#111827" },
  headerSub: { fontSize: 12, color: "#6B7280", marginTop: 2, textAlign: "center" },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 14, paddingVertical: 16, flexGrow: 1 },
  row: { marginBottom: 10, maxWidth: "88%" },
  rowPatient: { alignSelf: "flex-end" },
  rowAssistant: { alignSelf: "flex-start" },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 48,
  },
  bubblePatient: {
    backgroundColor: "#2563EB",
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderBottomLeftRadius: 4,
  },
  bubbleFailed: { opacity: 0.75, borderColor: "#fca5a5" },
  bubbleText: { fontSize: 15, lineHeight: 22, color: "#111827" },
  bubbleTextPatient: { color: "#FFFFFF" },
  pendingSpinner: { marginTop: 6 },
  typingBubble: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
  },
  typingLabel: { fontSize: 13, color: "#6B7280" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FEF2F2",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: { flex: 1, fontSize: 13, color: "#b91c1c", lineHeight: 18 },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: "#fff",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  composerEmbedded: {
    paddingBottom: 10,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#F9FAFB",
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: "#111827",
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: "#93C5FD" },
});
