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
  type IntentTag,
  type RewriteAction,
} from "@/lib/clinicalGuidanceApi";

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
  /** Scroll parent so the focused field stays above the keyboard (mobile). */
  onInputFocus?: (fieldRef: RefObject<View | null>) => void;
  compact?: boolean;
};

function intentFromTags(tags: IntentTag[]): string {
  if (!tags.length) return "";
  return tags.map((tag) => TAG_LABELS[tag] || tag).join(". ");
}

export function DoctorIntentPanel({
  patientId,
  draftGenerationAllowed: draftAllowedProp,
  onInputFocus,
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
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intentFieldRef = useRef<View>(null);
  const patientDraftFieldRef = useRef<View>(null);

  useEffect(() => {
    fetchIntentTags()
      .then(setIntentTags)
      .catch(() => setIntentTags([]));
  }, []);

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

  const resetForNewMessage = useCallback(() => {
    setGuidanceId(null);
    setDraftId(null);
    setPatientDraft("");
    setWarnings([]);
    setConfidence(null);
    setSent(false);
    setError(null);
  }, []);

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
      });
      if (!res.ok) {
        const code = res.error || "";
        if (code === "expansion_not_allowed") {
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

  const onSend = async () => {
    if (sent) {
      setError("Bu mesaj zaten gönderildi. Yeni mesaj için «Yeni taslak» kullanın.");
      return;
    }
    if (!guidanceId || !draftId || !patientDraft.trim()) {
      setError("Göndermek için taslak ve onay gerekli.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await sendClinicalGuidance({
        guidanceId,
        draftId,
        finalText: patientDraft.trim(),
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gönderim hatası");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Text style={[styles.title, compact && styles.titleCompact]}>Klinik niyet → hasta mesajı</Text>
      {!compact ? (
        <Text style={styles.sub}>
          Dahili not hastaya asla doğrudan gitmez. YZ güvenli, hasta dostu taslak üretir; siz
          onaylayıp gönderirsiniz.
        </Text>
      ) : null}

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

      {warnings.length > 0 ? (
        <View style={styles.warnBox}>
          <Text style={styles.warnTitle}>Güvenlik uyarıları</Text>
          <Text style={styles.warnBody}>{warnings.join(" · ")}</Text>
        </View>
      ) : null}

      {confidence != null ? (
        <Text style={styles.meta}>Güven skoru: {Math.round(confidence * 100)}%</Text>
      ) : null}

      <Text style={styles.label}>Hasta mesajı (önizleme / düzenle)</Text>
      <View ref={patientDraftFieldRef} collapsable={false}>
        <TextInput
          style={[styles.inputMultiline, styles.draftInput, compact && styles.draftInputCompact]}
          multiline
          value={patientDraft}
          onChangeText={setPatientDraft}
          onFocus={() => onInputFocus?.(patientDraftFieldRef)}
          placeholder="YZ taslağı burada görünür…"
          editable={!busy}
          blurOnSubmit={false}
          textAlignVertical="top"
        />
      </View>

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

      <Pressable
        style={[styles.btnSend, (busy || !patientDraft || sent || !draftId) && styles.btnDisabled]}
        onPress={onSend}
        disabled={busy || !patientDraft || sent || !draftId}
      >
        <Text style={styles.btnSendText}>{sent ? "Gönderildi ✓" : "Onayla ve gönder"}</Text>
      </Pressable>

      {sent ? (
        <Pressable style={styles.btnNewDraft} onPress={resetForNewMessage} disabled={busy}>
          <Text style={styles.btnNewDraftText}>＋ Yeni taslak</Text>
        </Pressable>
      ) : null}

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
  title: { fontSize: 16, fontWeight: "700", color: "#0f172a", marginBottom: 4 },
  titleCompact: { fontSize: 13, marginBottom: 6 },
  sub: { fontSize: 12, color: "#475569", lineHeight: 17, marginBottom: 12 },
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
  errorMuted: { color: "#047857" },
  btnNewDraft: {
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#93c5fd",
    backgroundColor: "#fff",
    alignItems: "center",
  },
  btnNewDraftText: { color: "#1d4ed8", fontWeight: "700", fontSize: 13 },
});
