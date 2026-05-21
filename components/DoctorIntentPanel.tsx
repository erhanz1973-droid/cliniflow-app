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

export type DoctorSendMode = "direct" | "ai_assist";

const REWRITE_ACTIONS: { id: RewriteAction; label: string }[] = [
  { id: "shorter", label: "Kısa" },
  { id: "simpler", label: "Basit" },
  { id: "more_empathetic", label: "Empatik" },
  { id: "more_professional", label: "Profesyonel" },
  { id: "reassure_patient", label: "Güven ver" },
  { id: "more_concise", label: "Öz" },
];

const TAG_LABELS: Record<string, string> = {
  reassure_patient: "Güven",
  explain_process: "Süreç",
  request_xray: "Röntgen",
  request_cbct: "CBCT",
  explain_timeline: "Zaman çizelgesi",
  discuss_pricing: "Fiyat",
  reduce_anxiety: "Kaygı",
  encourage_consultation: "Konsültasyon",
  collect_patient_info: "Bilgi topla",
  schedule_visit: "Ziyaret",
};

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

function intentFromTags(tags: IntentTag[]): string {
  if (!tags.length) return "";
  return tags.map((tag) => TAG_LABELS[tag] || tag).join(". ");
}

export function DoctorIntentPanel({
  patientId,
  draftGenerationAllowed: draftAllowedProp,
  canSendToPatient = true,
  onInputFocus,
  onMessageSent,
  compact,
}: Props) {
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
        setError("YZ genişletme bu modda kapalı (eskalasyon veya politika).");
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
        if (!allowed) setError("YZ genişletme bu başvuruda kapalı (yalnızca insan modu).");
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
    return intentFromTags(selectedTags);
  }, [intentText, selectedTags]);

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
      setError("Hasta kimliği eksik — Gelen Talepler’den tekrar açın.");
      return;
    }
    if (!resolvedIntent) {
      setError("Dahili klinik not yazın veya en az bir niyet etiketi seçin.");
      return;
    }
    if (!expansionAllowed) {
      setError("Bu başvuruda YZ genişletme kapalı (yalnızca insan modu).");
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
          setError("Devral modunda YZ genişletme kapalı. «Direkt gönder» kullanın veya «YZ ile taslak» moduna geçin.");
        } else if (code === "expansion_not_allowed") {
          setError("YZ genişletme kapalı (HUMAN_ONLY / eskalasyon).");
        } else {
          setError(res.message || code || "Genişletme başarısız");
        }
        return;
      }
      if (res.draft?.status === "sent") {
        setError("Bu taslak zaten gönderilmiş. Yeni mesaj için «Yeni taslak» kullanın.");
        return;
      }
      if (res.guidance?.id) setGuidanceId(res.guidance.id);
      setDraftId(res.draft?.id ?? null);
      if (res.draft?.guidanceId) setGuidanceId(res.draft.guidanceId);
      if (!res.draft?.id) {
        setError("Taslak kaydı oluşturulamadı — tekrar deneyin.");
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
        setError("YZ genişletme kapalı (HUMAN_ONLY / eskalasyon).");
      } else {
        setError(err.message || "Genişletme hatası");
      }
    } finally {
      setBusy(false);
    }
  }, [patientId, resolveIntentText, selectedTags, guidanceId, expansionAllowed, sent]);

  const onRewrite = async (action: RewriteAction) => {
    if (sent) {
      setError("Bu taslak gönderildi. Yeni mesaj için «Yeni taslak» kullanın.");
      return;
    }
    if (!draftId || !patientDraft.trim()) {
      setError("Önce hasta taslağı oluşturun.");
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
        setError(res.message || res.error || "Yeniden yazma başarısız");
        return;
      }
      setPatientDraft(res.patientDraft || patientDraft);
      if (res.draft?.id) setDraftId(res.draft.id);
      setWarnings(res.safetyReport?.warnings || warnings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Yeniden yazma hatası");
    } finally {
      setBusy(false);
    }
  };

  const onSendDirect = async () => {
    if (!patientId) {
      setError("Hasta kimliği eksik.");
      return;
    }
    const text = patientDraft.trim();
    if (!text) {
      setError("Gönderilecek mesajı yazın.");
      return;
    }
    if (!canSendToPatient) {
      setError("Önce Devral ile konuşmayı devralın.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await sendDirectPatientMessage({ patientId, message: text });
      if (!res.ok) {
        if (res.error === "ai_owns_conversation" || res.error === "devral_required") {
          setError("AI konuşmayı yönetiyor. Önce Devral.");
        } else if (res.error === "profile_not_found") {
          setError("Koordinasyon profili yok — sayfayı yenileyin veya tekrar Devral.");
        } else {
          setError(res.message || res.error || "Gönderilemedi");
        }
        return;
      }
      setSent(true);
      onMessageSent?.();
      clearComposeScreen();
    } catch (e) {
      const err = e as Error & { status?: number; code?: string };
      if (err.status === 404) {
        setError(
          "Birebir gönder API bulunamadı — backend güncellemesi gerekli (Railway deploy).",
        );
      } else if (err.status === 403 || err.code === "ai_owns_conversation") {
        setError("Önce Devral ile konuşmayı devralın.");
      } else {
        setError(err.message || "Gönderim hatası");
      }
    } finally {
      setBusy(false);
    }
  };

  const onSendAiAssisted = async () => {
    if (sent) {
      setError("Bu mesaj zaten gönderildi. Yeni mesaj için «Yeni taslak» kullanın.");
      return;
    }
    if (!guidanceId || !draftId || !patientDraft.trim()) {
      setError("Göndermek için önce YZ taslak oluşturun ve onaylayın.");
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
          setError("Bu mesaj zaten hastaya iletildi.");
          return;
        }
        setError(res.message || res.error || "Gönderilemedi");
        return;
      }
      setSent(true);
      setError(
        res.alreadySent
          ? "Bu mesaj zaten hastaya iletilmişti."
          : null,
      );
      onMessageSent?.();
      clearComposeScreen();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gönderim hatası");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.titleRow}>
        <Text style={[styles.title, compact && styles.titleCompact, styles.titleInRow]}>
          {sendMode === "direct" ? "Hastaya mesaj (direkt)" : "Klinik niyet → hasta mesajı"}
        </Text>
        <Pressable
          style={[styles.btnClear, (!hasComposeContent || busy) && styles.btnDisabled]}
          onPress={clearComposeScreen}
          disabled={!hasComposeContent || busy}
          accessibilityLabel="Yazı alanını temizle"
        >
          <Text style={styles.btnClearText}>Temizle</Text>
        </Pressable>
      </View>
      {!compact ? (
        <Text style={styles.sub}>
          {sendMode === "direct"
            ? "Direkt gönder: yazdığınız metin birebir hastaya gider. YZ genişletme veya yeniden yazma yok."
            : "YZ destekli: dahili nottan taslak üretilir; göndermeden önce düzenleyip onaylarsınız."}
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
              Direkt gönder
            </Text>
          </Pressable>
          <Pressable
            style={[styles.modeBtn, sendMode === "ai_assist" && styles.modeBtnOn]}
            onPress={() => setSendMode("ai_assist")}
            disabled={busy}
          >
            <Text style={[styles.modeBtnText, sendMode === "ai_assist" && styles.modeBtnTextOn]}>
              YZ ile taslak
            </Text>
          </Pressable>
        </View>
      ) : null}

      {sendMode === "ai_assist" ? (
        <>
      <Text style={styles.label}>Dahili klinik not</Text>
      <View ref={intentFieldRef} collapsable={false}>
        <TextInput
          style={[styles.inputMultiline, compact && styles.inputMultilineCompact]}
          multiline
          placeholder="Örn: 2 implant gerekebilir. Önce CBCT. Korkutma. 2 ziyaret sürecini kısaca anlat."
          value={intentText}
          onChangeText={setIntentTextLive}
          onFocus={() => onInputFocus?.(intentFieldRef)}
          editable={!busy}
          blurOnSubmit={false}
          textAlignVertical="top"
        />
      </View>

      <Text style={styles.label}>Niyet etiketleri</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tagRow}>
        {(intentTags.length ? intentTags : (Object.keys(TAG_LABELS) as IntentTag[])).map(
          (tag) => {
            const on = selectedTags.includes(tag);
            return (
              <Pressable
                key={tag}
                style={[styles.tag, on && styles.tagOn]}
                onPress={() => toggleTag(tag)}
              >
                <Text style={[styles.tagText, on && styles.tagTextOn]}>
                  {TAG_LABELS[tag] || tag}
                </Text>
              </Pressable>
            );
          },
        )}
      </ScrollView>

      {!canExpand && !busy && !sent ? (
        <Text style={styles.hint}>
          {!resolveIntentText()
            ? "Taslak için önce «Dahili klinik not» yazın veya niyet etiketi seçin."
            : !expansionAllowed
              ? "YZ taslak üretimi şu an kapalı."
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
          <Text style={styles.btnPrimaryText}>Hasta taslağı oluştur</Text>
        )}
      </Pressable>
        </>
      ) : null}

      {warnings.length > 0 && sendMode === "ai_assist" ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>Güvenlik uyarıları</Text>
          <Text style={styles.warnBody}>{warnings.join(" · ")}</Text>
        </View>
      ) : null}

      {confidence != null && sendMode === "ai_assist" ? (
        <Text style={styles.meta}>Güven skoru: {Math.round(confidence * 100)}%</Text>
      ) : null}

      <Text style={styles.label}>
        {sendMode === "direct" ? "Hastaya gidecek metin" : "Hasta mesajı (önizleme / düzenle)"}
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
              ? "Hastaya birebir gidecek metni yazın…"
              : "YZ taslağı burada görünür…"
          }
          editable={!busy}
          blurOnSubmit={false}
          textAlignVertical="top"
        />
      </View>

      {sendMode === "ai_assist" ? (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.rewriteRow}>
        {REWRITE_ACTIONS.map((a) => (
          <Pressable
            key={a.id}
            style={styles.chipBtn}
            onPress={() => onRewrite(a.id)}
            disabled={busy || !patientDraft}
          >
            <Text style={styles.chipBtnText}>{a.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
      ) : null}

      {!canSendToPatient ? (
        <Text style={styles.ownerBlock}>
          AI konuşmayı yönetiyor. Önce Devral; ardından dahili not → hasta taslağı → Hastaya gönder
          (koordinasyon sohbetine gider).
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
            ? "Gönderildi ✓"
            : sendMode === "direct"
              ? "Birebir gönder"
              : "Onayla ve gönder"}
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
