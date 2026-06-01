import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiFetchJson } from "@/lib/api";
import {
  expandClinicalGuidance,
  fetchIntentTags,
  rewriteClinicalDraft,
  sendClinicalGuidance,
  sendDirectPatientMessage,
  type IntentTag,
  type RewriteAction,
} from "@/lib/clinicalGuidanceApi";
import {
  REWRITE_ACTION_IDS,
  cx,
  intentTagLabel,
  rewriteActionLabel,
} from "@/lib/coordinationUiLabels";
import { useLanguage } from "@/lib/language-context";

export type DoctorSendMode = "direct" | "ai_assist";

type Props = {
  patientId: string;
  /** From coordination workspace — updates after Devral / refresh. */
  draftGenerationAllowed?: boolean;
  /** False while AI owns the patient thread (must Devral first). */
  canSendToPatient?: boolean;
  /** Scroll parent so the focused field stays above the keyboard (mobile). */
  onInputFocus?: (fieldRef: RefObject<View | null>) => void;
  /** Called after message is delivered to the patient coordination thread. */
  onMessageSent?: () => void;
  compact?: boolean;
};

function intentFromTags(tags: IntentTag[], t: (key: string) => string): string {
  if (!tags.length) return "";
  return tags.map((tag) => intentTagLabel(t, tag)).join(". ");
}

export function DoctorIntentPanel({
  patientId,
  draftGenerationAllowed: draftAllowedProp,
  canSendToPatient = true,
  onInputFocus,
  onMessageSent,
  compact,
}: Props) {
  const { t } = useLanguage();
  const [expansionAllowed, setExpansionAllowed] = useState(draftAllowedProp !== false);
  const [intentTags, setIntentTags] = useState<IntentTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<IntentTag[]>([]);
  const [intentText, setIntentText] = useState("");
  const intentTextRef = useRef("");
  const [patientDraft, setPatientDraft] = useState("");
  const [guidanceId, setGuidanceId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [sendMode, setSendMode] = useState<DoctorSendMode>("direct");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intentFieldRef = useRef<View>(null);
  const patientDraftFieldRef = useRef<View>(null);

  useEffect(() => {
    let cancelled = false;
    fetchIntentTags()
      .then((tags) => {
        if (!cancelled) setIntentTags(tags);
      })
      .catch(() => {
        if (!cancelled) setIntentTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  useEffect(() => {
    if (draftAllowedProp !== undefined) {
      setExpansionAllowed(draftAllowedProp !== false);
      if (draftAllowedProp === false) {
        setError(cx(t, "doctor.coordination.err.expansionOffPolicy", "AI expansion is off in this mode."));
      }
      return;
    }
    if (!patientId) return;
    apiFetchJson<{
      ok?: boolean;
      profile?: { delegation?: { draftGenerationAllowed?: boolean } };
    }>(`/api/doctor/patients/${patientId}/ai-coordination`, { timeoutMs: 20_000 })
      .then((res) => {
        const allowed = res.profile?.delegation?.draftGenerationAllowed !== false;
        setExpansionAllowed(allowed);
        if (!allowed) setError(cx(t, "doctor.coordination.err.expansionOffHuman", "AI expansion is off (human-only mode)."));
      })
      .catch(() => setExpansionAllowed(true));
  }, [patientId, draftAllowedProp]);

  useEffect(() => {
    if (canSendToPatient) {
      setSendMode("direct");
    }
  }, [canSendToPatient, patientId]);

  const setIntentTextLive = useCallback((value: string) => {
    intentTextRef.current = value;
    setIntentText(value);
  }, []);

  const resolveIntentText = useCallback(() => {
    const typed = (intentTextRef.current || intentText).trim();
    if (typed) return typed;
    return intentFromTags(selectedTags, t);
  }, [intentText, selectedTags, t]);

  const canExpand = Boolean(resolveIntentText()) && Boolean(patientId) && expansionAllowed;

  const clearComposeScreen = useCallback(() => {
    intentTextRef.current = "";
    setIntentText("");
    setSelectedTags([]);
    setGuidanceId(null);
    setDraftId(null);
    setPatientDraft("");
    setWarnings([]);
    setConfidence(null);
    setSent(false);
    setError(null);
  }, []);

  const hasComposeContent =
    Boolean(intentText.trim()) ||
    selectedTags.length > 0 ||
    Boolean(patientDraft.trim()) ||
    Boolean(draftId) ||
    Boolean(guidanceId) ||
    sent;

  const toggleTag = (tag: IntentTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const onExpand = useCallback(async () => {
    const resolvedIntent = resolveIntentText();
    if (!patientId) {
      setError(cx(t, "doctor.coordination.err.missingPatientId", "Missing patient id."));
      return;
    }
    if (!resolvedIntent) {
      setError(cx(t, "doctor.coordination.err.needIntent", "Write an internal note or select intent tags."));
      return;
    }
    if (!expansionAllowed) {
      setError(cx(t, "doctor.coordination.err.expansionOffHuman", "AI expansion is off (human-only mode)."));
      return;
    }
    setBusy(true);
    setError(null);
    setSent(false);
    setDraftId(null);
    try {
      const res = await expandClinicalGuidance({
        patientId,
        intentText: resolvedIntent,
        intentTags: selectedTags,
        guidanceId: sent ? undefined : guidanceId || undefined,
        explicitAiAssist: true,
      });
      if (!res.ok) {
        const code = res.error || "";
        if (code === "direct_send_required") {
          setError(cx(t, "doctor.coordination.err.directSendRequired", "Use Direct send or switch to AI draft mode."));
        } else if (code === "expansion_not_allowed") {
          setError(cx(t, "doctor.coordination.err.expansionNotAllowed", "AI expansion off."));
        } else {
          setError(res.message || code || cx(t, "doctor.coordination.err.expandFailed", "Expansion failed"));
        }
        return;
      }
      if (res.draft?.status === "sent") {
        setError(cx(t, "doctor.coordination.err.draftAlreadySent", "Draft already sent."));
        return;
      }
      if (res.guidance?.id) setGuidanceId(res.guidance.id);
      setDraftId(res.draft?.id ?? null);
      if (res.draft?.guidanceId) setGuidanceId(res.draft.guidanceId);
      if (!res.draft?.id) {
        setError(cx(t, "doctor.coordination.err.draftNotCreated", "Could not create draft."));
        return;
      }
      setPatientDraft(res.patientDraft || "");
      setConfidence(res.confidence ?? null);
      setWarnings([
        ...(res.detectedRisks || []),
        ...(res.safetyReport?.warnings || []),
      ]);
    } catch (e) {
      const err = e as Error & { status?: number; code?: string };
      if (err.status === 403 || err.code === "expansion_not_allowed") {
        setError(cx(t, "doctor.coordination.err.expansionNotAllowed", "AI expansion off."));
      } else {
        setError(err.message || cx(t, "doctor.coordination.err.expandError", "Expansion error"));
      }
    } finally {
      setBusy(false);
    }
  }, [patientId, resolveIntentText, selectedTags, guidanceId, expansionAllowed, sent, t]);

  const onRewrite = async (action: RewriteAction) => {
    if (sent) {
      setError(cx(t, "doctor.coordination.err.alreadySent", "Message already sent."));
      return;
    }
    if (!draftId || !patientDraft.trim()) {
      setError(cx(t, "doctor.coordination.err.needDraftFirst", "Create a patient draft first."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await rewriteClinicalDraft({
        draftId,
        draftText: patientDraft,
        action,
        patientId,
        explicitAiAssist: true,
      });
      if (!res.ok) {
        setError(res.message || res.error || cx(t, "doctor.coordination.err.rewriteFailed", "Rewrite failed"));
        return;
      }
      setPatientDraft(res.patientDraft || patientDraft);
      if (res.draft?.id) setDraftId(res.draft.id);
      setWarnings(res.safetyReport?.warnings || warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : cx(t, "doctor.coordination.err.rewriteError", "Rewrite error"));
    } finally {
      setBusy(false);
    }
  };

  const onSendDirect = async () => {
    if (!patientId) {
      setError(cx(t, "doctor.coordination.err.missingPatientShort", "Missing patient id."));
      return;
    }
    const text = patientDraft.trim();
    if (!text) {
      setError(cx(t, "doctor.coordination.err.needMessageText", "Enter a message to send."));
      return;
    }
    if (!canSendToPatient) {
      setError(cx(t, "doctor.coordination.err.takeOverFirst", "Take over the conversation first."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await sendDirectPatientMessage({ patientId, message: text });
      if (!res.ok) {
        if (res.error === "ai_owns_conversation" || res.error === "devral_required") {
          setError(cx(t, "doctor.coordination.err.aiOwnsTakeOver", "AI owns the conversation. Take over first."));
        } else if (res.error === "profile_not_found") {
          setError(cx(t, "doctor.coordination.err.profileNotFound", "No coordination profile."));
        } else {
          setError(res.message || res.error || cx(t, "doctor.coordination.err.sendFailed", "Could not send"));
        }
        return;
      }
      setSent(true);
      onMessageSent?.();
      clearComposeScreen();
    } catch (e) {
      const err = e as Error & { status?: number; code?: string };
      if (err.status === 404) {
        setError(cx(t, "doctor.coordination.err.apiNotFound", "Direct send API not found."));
      } else if (err.status === 403 || err.code === "ai_owns_conversation") {
        setError(cx(t, "doctor.coordination.err.takeOverFirst", "Take over the conversation first."));
      } else {
        setError(err.message || cx(t, "doctor.coordination.err.sendError", "Send error"));
      }
    } finally {
      setBusy(false);
    }
  };

  const onSendAiAssisted = async () => {
    if (sent) {
      setError(cx(t, "doctor.coordination.err.alreadySent", "Message already sent."));
      return;
    }
    if (!guidanceId || !draftId || !patientDraft.trim()) {
      setError(cx(t, "doctor.coordination.err.needAiDraft", "Create and approve an AI draft first."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await sendClinicalGuidance({
        guidanceId,
        draftId,
        finalText: patientDraft.trim(),
        sendMode: "ai_assisted",
      });
      if (!res.ok) {
        if (res.error === "draft_already_sent") {
          setSent(true);
          setError(cx(t, "doctor.coordination.err.alreadyDeliveredShort", "Already sent to patient."));
          return;
        }
        setError(res.message || res.error || cx(t, "doctor.coordination.err.sendFailed", "Could not send"));
        return;
      }
      setSent(true);
      setError(
        res.alreadySent
          ? cx(t, "doctor.coordination.err.alreadyDelivered", "Already delivered to patient.")
          : null,
      );
      onMessageSent?.();
      clearComposeScreen();
    } catch (e) {
      setError(e instanceof Error ? e.message : cx(t, "doctor.coordination.err.sendError", "Send error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, compact && styles.titleCompact, styles.titleInRow]}>
          {sendMode === "direct"
            ? cx(t, "doctor.coordination.intent.directTitle", "Message to patient (direct)")
            : cx(t, "doctor.coordination.intent.aiTitle", "Clinical intent → patient message")}
        </Text>
        <Pressable
          style={[styles.btnClear, (!hasComposeContent || busy) && styles.btnDisabled]}
          onPress={clearComposeScreen}
          disabled={!hasComposeContent || busy}
          accessibilityLabel={cx(t, "doctor.coordination.intent.clearA11y", "Clear compose fields")}
        >
          <Text style={styles.btnClearText}>{cx(t, "doctor.coordination.intent.clear", "Clear")}</Text>
        </Pressable>
      </View>
      {!compact ? (
        <Text style={styles.sub}>
          {sendMode === "direct"
            ? cx(t, "doctor.coordination.intent.directSub", "Direct send: verbatim to patient.")
            : cx(t, "doctor.coordination.intent.aiSub", "AI-assisted draft from internal note.")}
        </Text>
      ) : null}

      {canSendToPatient ? (
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeBtn, sendMode === "direct" && styles.modeBtnOn]}
            onPress={() => setSendMode("direct")}
            disabled={busy}
          >
            <Text style={[styles.modeBtnText, sendMode === "direct" && styles.modeBtnTextOn]}>
              {cx(t, "doctor.coordination.intent.directSend", "Direct send")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, sendMode === "ai_assist" && styles.modeBtnOn]}
            onPress={() => setSendMode("ai_assist")}
            disabled={busy}
          >
            <Text style={[styles.modeBtnText, sendMode === "ai_assist" && styles.modeBtnTextOn]}>
              {cx(t, "doctor.coordination.intent.aiDraft", "AI draft")}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {sendMode === "ai_assist" ? (
        <>
      <Text style={styles.label}>{cx(t, "doctor.coordination.intent.internalNote", "Internal clinical note")}</Text>
      <View ref={intentFieldRef} collapsable={false}>
        <TextInput
          style={[styles.inputMultiline, compact && styles.inputMultilineCompact]}
          multiline
          placeholder={cx(
            t,
            "doctor.coordination.intent.internalPlaceholder",
            "e.g. May need 2 implants. CBCT first.",
          )}
          value={intentText}
          onChangeText={setIntentTextLive}
          onFocus={() => onInputFocus?.(intentFieldRef)}
          editable={!busy}
          blurOnSubmit={false}
          textAlignVertical="top"
        />
      </View>

      <Text style={styles.label}>{cx(t, "doctor.coordination.intent.intentTags", "Intent tags")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagRow}>
        {(intentTags.length ? intentTags : (Object.keys({
          reassure_patient: 1,
          explain_process: 1,
          request_xray: 1,
          request_cbct: 1,
          explain_timeline: 1,
          discuss_pricing: 1,
          reduce_anxiety: 1,
          encourage_consultation: 1,
          collect_patient_info: 1,
          schedule_visit: 1,
        }) as IntentTag[])).map(
          (tag) => {
            const on = selectedTags.includes(tag);
            return (
              <Pressable
                key={tag}
                style={[styles.tag, on && styles.tagOn]}
                onPress={() => toggleTag(tag)}
              >
                <Text style={[styles.tagText, on && styles.tagTextOn]}>
                  {intentTagLabel(t, tag)}
                </Text>
              </Pressable>
            );
          },
        )}
      </ScrollView>

      {!canExpand && !busy && !sent ? (
        <Text style={styles.hint}>
          {!resolveIntentText()
            ? cx(t, "doctor.coordination.intent.hintNeedIntent", "Write internal note or select tags.")
            : !expansionAllowed
              ? cx(t, "doctor.coordination.intent.hintDraftOff", "AI draft generation is off.")
              : null}
        </Text>
      ) : null}

      <Pressable
        style={[styles.btnPrimary, (!canExpand || busy) && styles.btnDisabled]}
        onPress={onExpand}
        disabled={!canExpand || busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnPrimaryText}>
            {cx(t, "doctor.coordination.intent.createDraft", "Create patient draft")}
          </Text>
        )}
      </Pressable>
        </>
      ) : null}

      {warnings.length > 0 && sendMode === "ai_assist" ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>
            {cx(t, "doctor.coordination.intent.safetyWarnings", "Safety warnings")}
          </Text>
          <Text style={styles.warnBody}>{warnings.join(" · ")}</Text>
        </View>
      ) : null}

      {confidence != null && sendMode === "ai_assist" ? (
        <Text style={styles.meta}>
          {t("doctor.coordination.intent.confidence", { pct: Math.round(confidence * 100) }) ||
            `Confidence: ${Math.round(confidence * 100)}%`}
        </Text>
      ) : null}

      <Text style={styles.label}>
        {sendMode === "direct"
          ? cx(t, "doctor.coordination.intent.patientTextDirect", "Text going to patient")
          : cx(t, "doctor.coordination.intent.patientTextPreview", "Patient message (preview / edit)")}
      </Text>
      <View ref={patientDraftFieldRef} collapsable={false}>
        <TextInput
          style={[styles.inputMultiline, styles.draftInput, compact && styles.draftInputCompact]}
          multiline
          value={patientDraft}
          onChangeText={setPatientDraft}
          onFocus={() => onInputFocus?.(patientDraftFieldRef)}
          placeholder={
            sendMode === "direct"
              ? cx(t, "doctor.coordination.intent.placeholderDirect", "Write the exact message for the patient…")
              : cx(t, "doctor.coordination.intent.placeholderDraft", "AI draft appears here…")
          }
          editable={!busy}
          blurOnSubmit={false}
          textAlignVertical="top"
        />
      </View>

      {sendMode === "ai_assist" ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rewriteRow}>
        {REWRITE_ACTION_IDS.map((a) => (
          <Pressable
            key={a}
            style={styles.chipBtn}
            onPress={() => onRewrite(a)}
            disabled={busy || !patientDraft}
          >
            <Text style={styles.chipBtnText}>{rewriteActionLabel(t, a)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      ) : null}

      {!canSendToPatient ? (
        <Text style={styles.ownerBlock}>
          {cx(
            t,
            "doctor.coordination.intent.ownerBlock",
            "AI owns the conversation. Take over first, then compose and send.",
          )}
        </Text>
      ) : null}

      <Pressable
        style={[
          styles.btnSend,
          sendMode === "direct"
            ? (busy || !patientDraft.trim() || sent || !canSendToPatient) && styles.btnDisabled
            : (busy || !patientDraft || sent || !draftId || !canSendToPatient) && styles.btnDisabled,
        ]}
        onPress={() => void (sendMode === "direct" ? onSendDirect() : onSendAiAssisted())}
        disabled={
          sendMode === "direct"
            ? busy || !patientDraft.trim() || sent || !canSendToPatient
            : busy || !patientDraft || sent || !draftId || !canSendToPatient
        }
      >
        <Text style={styles.btnSendText}>
          {sent
            ? cx(t, "doctor.coordination.intent.sent", "Sent ✓")
            : sendMode === "direct"
              ? cx(t, "doctor.coordination.intent.sendDirect", "Send verbatim")
              : cx(t, "doctor.coordination.intent.sendApproved", "Approve and send")}
        </Text>
      </Pressable>

      {error ? (
        <Text style={[styles.error, sent && styles.errorMuted]}>{error}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#f0f9ff",
  },
  wrapCompact: { marginTop: 0, padding: 10, borderRadius: 10 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  title: { fontSize: 16, fontWeight: "700", color: "#0f172a" },
  titleInRow: { flex: 1, marginBottom: 0 },
  titleCompact: { fontSize: 13 },
  btnClear: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#fff",
  },
  btnClearText: { fontSize: 12, fontWeight: "700", color: "#475569" },
  sub: { fontSize: 12, color: "#475569", lineHeight: 17, marginBottom: 12 },
  modeRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  modeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#94a3b8",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  modeBtnOn: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  modeBtnText: { fontSize: 12, fontWeight: "700", color: "#475569" },
  modeBtnTextOn: { color: "#fff" },
  label: { fontSize: 12, fontWeight: "600", color: "#334155", marginBottom: 6, marginTop: 8 },
  hint: { fontSize: 11, color: "#64748b", marginTop: 8, marginBottom: 4, lineHeight: 15 },
  inputMultiline: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#fff",
    textAlignVertical: "top",
  },
  inputMultilineCompact: { minHeight: 56, fontSize: 13, padding: 8 },
  draftInput: { minHeight: 120, borderColor: "#93c5fd" },
  draftInputCompact: { minHeight: 72 },
  tagRow: { marginBottom: 8, maxHeight: 40 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#e2e8f0",
    marginRight: 6,
  },
  tagOn: { backgroundColor: "#2563eb" },
  tagText: { fontSize: 12, color: "#334155" },
  tagTextOn: { color: "#fff" },
  btnPrimary: {
    marginTop: 10,
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnSend: {
    marginTop: 12,
    backgroundColor: "#059669",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  btnSendText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  btnDisabled: { opacity: 0.5 },
  rewriteRow: { marginTop: 8, maxHeight: 36 },
  chipBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "#e0e7ff",
    marginRight: 6,
  },
  chipBtnText: { fontSize: 12, color: "#3730a3", fontWeight: "600" },
  warnBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  warnTitle: { fontSize: 12, fontWeight: "700", color: "#92400e" },
  warnBody: { fontSize: 11, color: "#78350f", marginTop: 4 },
  meta: { fontSize: 11, color: "#64748b", marginTop: 6 },
  error: { marginTop: 10, color: "#b91c1c", fontSize: 13 },
  ownerBlock: {
    marginTop: 10,
    fontSize: 12,
    color: "#92400e",
    backgroundColor: "#fffbeb",
    padding: 10,
    borderRadius: 8,
    lineHeight: 17,
  },
  errorMuted: { color: "#047857" },
});
