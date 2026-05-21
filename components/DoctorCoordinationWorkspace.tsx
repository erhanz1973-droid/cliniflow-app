import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CoordinationContextStrip } from "@/components/CoordinationContextStrip";
import { CoordinationMissionBar, countFeedStats } from "@/components/CoordinationMissionBar";
import { DoctorIntentPanel } from "@/components/DoctorIntentPanel";
import { InterventionControls } from "@/components/InterventionControls";
import { LiveConversationFeed } from "@/components/LiveConversationFeed";
import { OperationalActivityLog } from "@/components/OperationalActivityLog";
import { PatientContextPanel } from "@/components/PatientContextPanel";
import {
  conversationTurnsFromFeed,
  operationalEventsFromFeed,
} from "@/lib/coordinationFeedUtils";
import { useCoordinationWorkspace } from "@/hooks/useCoordinationWorkspace";
import type { AiState } from "@/lib/coordinationWorkspaceTypes";

type Props = {
  patientId: string;
};

export function DoctorCoordinationWorkspace({ patientId }: Props) {
  const intentRef = useRef<ScrollView>(null);
  const mainScrollRef = useRef<ScrollView>(null);
  const keyboardInsetRef = useRef(0);
  const scrollYRef = useRef(0);
  const lastFocusedFieldRef = useRef<RefObject<View | null> | null>(null);
  const insets = useSafeAreaInsets();
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [showCoordinationDetails, setShowCoordinationDetails] = useState(true);
  const { width } = useWindowDimensions();
  const isWide = width >= 960;
  const { data, loading, error, refresh } = useCoordinationWorkspace(patientId);
  const [aiOverride, setAiOverride] = useState<Partial<AiState> | null>(null);

  useEffect(() => {
    setAiOverride(null);
  }, [patientId]);

  useEffect(() => {
    if (data?.aiState) setAiOverride(null);
  }, [
    data?.aiState?.responderMode,
    data?.aiState?.aiPaused,
    data?.aiState?.aiEscalationRequired,
  ]);

  const aiState = useMemo(() => {
    const base = data?.aiState;
    if (!base) return base;
    return aiOverride ? { ...base, ...aiOverride } : base;
  }, [data?.aiState, aiOverride]);

  const handleAiPatch = useCallback((patch: Partial<AiState>) => {
    setAiOverride((prev) => ({ ...(prev || {}), ...patch }));
  }, []);

  const feed = useMemo(
    () => data?.supervisionFeed || data?.conversation || data?.messages || [],
    [data],
  );

  const messageTurns = useMemo(() => conversationTurnsFromFeed(feed), [feed]);
  const stats = useMemo(() => countFeedStats(feed), [feed]);
  const operationalEvents = useMemo(() => operationalEventsFromFeed(feed), [feed]);

  const scrollToIntent = () => {
    if (isWide) {
      intentRef.current?.scrollToEnd({ animated: true });
    } else {
      mainScrollRef.current?.scrollToEnd({ animated: true });
    }
  };

  const scrollFieldIntoView = useCallback(
    (fieldRef?: RefObject<View | null>) => {
      if (fieldRef) lastFocusedFieldRef.current = fieldRef;
      if (isWide) {
        scrollToIntent();
        return;
      }
      const anchor = fieldRef?.current ?? lastFocusedFieldRef.current?.current;
      const headerClearance = insets.top + 40;
      const delays = Platform.OS === "ios" ? [50, 220, 420] : [50, 180];
      delays.forEach((ms, index) => {
        setTimeout(() => {
          const kb = keyboardInsetRef.current || 280;
          const measureTarget = anchor;
          if (!measureTarget) {
            if (index === delays.length - 1) scrollToIntent();
            return;
          }
          measureTarget.measureInWindow((_x, y, _w, h) => {
            const winH = Dimensions.get("window").height;
            const fieldTop = y;
            const fieldBottom = y + h;
            const visibleMax = winH - kb - insets.bottom - 24;
            let delta = 0;
            if (fieldBottom > visibleMax) {
              delta = fieldBottom - visibleMax + 16;
            } else if (fieldTop < headerClearance) {
              delta = fieldTop - headerClearance - 8;
            }
            if (delta !== 0) {
              mainScrollRef.current?.scrollTo({
                y: Math.max(0, scrollYRef.current + delta),
                animated: index === delays.length - 1,
              });
            }
          });
        }, ms);
      });
    },
    [isWide, insets.top, insets.bottom],
  );

  useEffect(() => {
    if (isWide) return undefined;
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, (e) => {
      const h = e.endCoordinates?.height ?? 280;
      keyboardInsetRef.current = h;
      setKeyboardInset(h);
      scrollFieldIntoView(lastFocusedFieldRef.current ?? undefined);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      keyboardInsetRef.current = 0;
      setKeyboardInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [isWide, scrollFieldIntoView]);

  if (loading && !data?.profile) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={styles.loadingText}>Koordinasyon merkezi yükleniyor…</Text>
      </View>
    );
  }

  const refreshing = loading && !!data?.profile;

  if (!data?.profile) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>Koordinasyon profili yok</Text>
        <Text style={styles.emptyBody}>
          Bu hasta henüz koordinasyon hattında değil. İlk mesaj veya başvuru sonrası canlı akış burada
          görünür.
        </Text>
      </View>
    );
  }

  const intentSection = (
    <>
      {!isWide ? null : (
        <>
          <Text style={styles.intentTitle}>Klinik rehberlik</Text>
          <Text style={styles.intentSub}>
            Dahili not → AI genişletme → onay → hastaya gönder. Taslaklar ve sistem olayları akışta görünür.
          </Text>
        </>
      )}
      <DoctorIntentPanel
        patientId={patientId}
        draftGenerationAllowed={aiState?.draftGenerationAllowed}
        canSendToPatient={aiState?.canSendPatientMessageAsDoctor ?? aiState?.conversationOwner === "doctor"}
        onInputFocus={scrollFieldIntoView}
        onMessageSent={() => void refresh()}
        compact={!isWide}
      />
    </>
  );

  const leftColumn = (
    <View style={styles.leftStack}>
      <CoordinationContextStrip
        aiState={aiState}
        leadHeat={data.leadHeat}
        strategy={data.currentStrategy}
      />
      <PatientContextPanel
        profile={data.profile}
        aiState={aiState}
        leadHeat={data.leadHeat}
        strategy={data.currentStrategy}
      />
      <OperationalActivityLog events={operationalEvents} />
    </View>
  );

  const feedPanel = (
    <View style={[styles.feedCard, !isWide && styles.feedCardMobile]}>
      <View style={styles.feedHeader}>
        <View>
          <Text style={styles.feedTitle}>Canlı konuşma akışı</Text>
          <Text style={styles.feedSub}>
            Hasta · AI · ekip · doktor · taslak · sistem
          </Text>
        </View>
        <View style={styles.feedBadge}>
          <Text style={styles.feedBadgeText}>{stats.total}</Text>
        </View>
      </View>
      <LiveConversationFeed
        turns={messageTurns}
        patientName={data.profile.patientName}
        flex={isWide}
        embedInParentScroll={!isWide}
      />
    </View>
  );

  const rightColumn = (
    <View style={styles.rightStack}>
      <InterventionControls
        patientId={patientId}
        aiState={aiState}
        onRefresh={refresh}
        onAiPatch={handleAiPatch}
        onGuideAi={scrollToIntent}
        onInputFocus={scrollFieldIntoView}
        compact={!isWide}
      />
      {isWide ? (
        <ScrollView
          ref={intentRef}
          style={styles.intentScroll}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.intentScrollContent}
        >
          {intentSection}
        </ScrollView>
      ) : (
        <View style={styles.intentBlock}>{intentSection}</View>
      )}
    </View>
  );

  const body = isWide ? (
    <View style={styles.columns}>
      <View style={styles.leftColumn}>{leftColumn}</View>
      <View style={styles.centerColumn}>{feedPanel}</View>
      <View style={styles.rightColumn}>{rightColumn}</View>
    </View>
  ) : (
    <View style={styles.columnsStacked}>
      {feedPanel}
      {rightColumn}
      <Pressable
        style={styles.detailsToggle}
        onPress={() => setShowCoordinationDetails((v) => !v)}
      >
        <Text style={styles.detailsToggleText}>
          {showCoordinationDetails ? "▲ Hasta bağlamını gizle" : "▼ Hasta bağlamı"}
        </Text>
      </Pressable>
      {showCoordinationDetails ? leftColumn : null}
    </View>
  );

  const scrollBottomPad = keyboardInset + insets.bottom + 48;

  const missionBar = (
    <CoordinationMissionBar
      compact={!isWide}
      patientName={data.profile.patientName}
      stats={stats}
      latestPatientMessage={data.latestPatientMessage}
      latestAiReply={data.latestAiReply}
      nextStep={data.nextStep || data.currentStrategy?.nextAction}
      blocker={data.blocker || data.currentStrategy?.blockingReason}
    />
  );

  const content = isWide ? (
    <>
      <View style={styles.toolbar}>
        <Pressable onPress={refresh} style={styles.refreshBtn}>
          <Text style={styles.refreshBtnText}>↻ Yenile</Text>
        </Pressable>
        {refreshing ? <ActivityIndicator size="small" color="#2563eb" /> : null}
      </View>
      {missionBar}
      {body}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </>
  ) : (
    <>
      <ScrollView
        ref={mainScrollRef}
        style={styles.mainScroll}
        contentContainerStyle={[
          styles.mainScrollContent,
          { paddingBottom: scrollBottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        nestedScrollEnabled
        onScroll={(e) => {
          scrollYRef.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        <View style={styles.toolbarMobile}>
          <Pressable onPress={refresh} style={styles.refreshBtnCompact}>
            <Text style={styles.refreshBtnText}>↻</Text>
          </Pressable>
          {refreshing ? <ActivityIndicator size="small" color="#2563eb" /> : null}
        </View>
        {missionBar}
        {body}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </>
  );

  if (isWide) {
    return <View style={styles.screen}>{content}</View>;
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={insets.top + 36}
    >
      {content}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 10, paddingBottom: 8, minHeight: 0 },
  toolbar: { flexDirection: "row", justifyContent: "flex-end", paddingVertical: 4 },
  toolbarMobile: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingTop: 2,
    paddingBottom: 4,
  },
  refreshBtnCompact: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  refreshBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  refreshBtnText: { fontSize: 13, color: "#2563eb", fontWeight: "700" },
  columns: { flex: 1, flexDirection: "row", gap: 10, minHeight: 0 },
  columnsStacked: { gap: 8 },
  detailsToggle: {
    alignSelf: "stretch",
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  detailsToggleText: { fontSize: 12, fontWeight: "600", color: "#475569", textAlign: "center" },
  leftColumn: { width: 300, minWidth: 260 },
  leftStack: { gap: 10 },
  centerColumn: { flex: 1, minWidth: 0 },
  rightColumn: { width: 300, minWidth: 260 },
  rightStack: { gap: 10, flex: 1 },
  feedCard: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    minHeight: 480,
  },
  feedCardMobile: { minHeight: 220, flex: 0 },
  feedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  feedTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  feedSub: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  feedBadge: {
    backgroundColor: "#0f172a",
    borderRadius: 999,
    minWidth: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  feedBadgeText: { color: "#f8fafc", fontSize: 12, fontWeight: "800" },
  mainScroll: { flex: 1 },
  mainScrollContent: { paddingBottom: 40 },
  intentScroll: { flex: 1, maxHeight: 520 },
  intentScrollContent: { paddingBottom: 32 },
  intentBlock: { paddingBottom: 4 },
  intentTitle: { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 4 },
  intentSub: { fontSize: 11, color: "#6b7280", marginBottom: 10, lineHeight: 16 },
  loading: { padding: 32, alignItems: "center", flex: 1 },
  loadingText: { marginTop: 12, color: "#6b7280", fontSize: 13 },
  emptyCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    margin: 16,
  },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: "#111827", marginBottom: 6 },
  emptyBody: { fontSize: 13, color: "#6b7280", lineHeight: 19 },
  error: { fontSize: 12, color: "#b91c1c", padding: 8 },
});
