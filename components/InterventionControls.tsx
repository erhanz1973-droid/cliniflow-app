import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { apiFetchJson } from "@/lib/api";
import type { AiState } from "@/lib/coordinationWorkspaceTypes";

type PatchAiResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
  aiPaused?: boolean;
  aiEscalationRequired?: boolean;
  responderMode?: string;
  responderModeLabel?: string;
  delegation?: {
    draftGenerationAllowed?: boolean;
    autoReplyAllowed?: boolean;
    aiEscalationRequired?: boolean;
    conversationOwner?: string;
    canSendPatientMessageAsDoctor?: boolean;
    statusLabel?: string;
  };
};

function patchToAiState(json: PatchAiResponse): Partial<AiState> {
  const d = json.delegation;
  const owner = d?.conversationOwner === "doctor" ? "doctor" : "ai";
  return {
    conversationOwner: owner,
    conversationOwnerLabel:
      owner === "doctor"
        ? "Doktor konuşmayı yönetiyor"
        : "AI konuşmayı yönetiyor",
    aiPaused: json.aiPaused,
    aiEscalationRequired: json.aiEscalationRequired ?? d?.aiEscalationRequired,
    responderMode: json.responderMode,
    responderModeLabel: json.responderModeLabel,
    draftGenerationAllowed: d?.draftGenerationAllowed,
    autoReplyAllowed: d?.autoReplyAllowed,
    canSendPatientMessageAsDoctor: d?.canSendPatientMessageAsDoctor,
    handlingStateLabel: d?.statusLabel,
  };
}

type Props = {
  patientId: string;
  aiState?: AiState;
  onRefresh: () => void;
  onAiPatch?: (patch: Partial<AiState>) => void;
  onGuideAi: () => void;
  compact?: boolean;
};

export function InterventionControls({
  patientId,
  aiState,
  onRefresh,
  onAiPatch,
  onGuideAi,
  compact,
}: Props) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doctorOwns = aiState?.conversationOwner === "doctor";
  const aiOwns = aiState?.conversationOwner === "ai" || !doctorOwns;

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setSaving(true);
      setError(null);
      try {
        const json = await apiFetchJson<PatchAiResponse>(
          `/api/doctor/patients/${encodeURIComponent(patientId)}/ai-coordination`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            timeoutMs: 30_000,
          },
        );
        if (!json.ok) throw new Error(json.message || json.error || "Kaydedilemedi");
        onAiPatch?.(patchToAiState(json));
        void onRefresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kaydedilemedi");
      } finally {
        setSaving(false);
      }
    },
    [patientId, onRefresh, onAiPatch],
  );

  const takeOver = useCallback(async () => {
    await patch({ action: "takeOver" });
    setTimeout(() => onGuideAi?.(), Platform.OS === "ios" ? 350 : 200);
  }, [patch, onGuideAi]);

  const resumeAi = useCallback(() => {
    void patch({ action: "resumeAi", clearEscalation: true });
  }, [patch]);

  const ownerLabel =
    aiState?.conversationOwnerLabel ||
    (doctorOwns ? "Doktor konuşmayı yönetiyor" : "AI konuşmayı yönetiyor");

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={[styles.ownerBanner, doctorOwns ? styles.ownerDoctor : styles.ownerAi]}>
        <Text style={styles.ownerTitle}>Konuşma sahibi</Text>
        <Text style={styles.ownerText}>{ownerLabel}</Text>
        <Text style={styles.ownerHint}>
          {doctorOwns
            ? "Hastaya giden tüm mesajlar doktor adına. AI hastaya yazmaz; yalnızca öneri üretebilir."
            : "AI hastayla konuşur. Doktor izler; dahili not ve rehberlik Intent Panel'den."}
        </Text>
      </View>

      <View style={styles.row}>
        <ActionBtn
          label="Devral"
          onPress={() => void takeOver()}
          disabled={saving || doctorOwns}
          variant="primary"
        />
        <ActionBtn
          label="AI devam etsin"
          onPress={resumeAi}
          disabled={saving || aiOwns}
          variant="secondary"
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {saving ? <ActivityIndicator size="small" color="#2563eb" style={{ marginTop: 8 }} /> : null}
    </View>
  );
}

function ActionBtn({
  label,
  onPress,
  disabled,
  variant,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant: "primary" | "secondary";
}) {
  const bg = variant === "primary" ? "#2563eb" : "#0f766e";
  return (
    <Pressable
      style={[styles.btn, { backgroundColor: bg }, disabled && styles.btnDisabled]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 14,
    marginBottom: 16,
  },
  wrapCompact: { padding: 10, marginBottom: 8, borderRadius: 10 },
  ownerBanner: { borderRadius: 10, padding: 12, marginBottom: 12 },
  ownerAi: { backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe" },
  ownerDoctor: { backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#bbf7d0" },
  ownerTitle: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    color: "#6b7280",
    marginBottom: 4,
  },
  ownerText: { fontSize: 15, fontWeight: "700", color: "#111827" },
  ownerHint: { fontSize: 12, color: "#4b5563", marginTop: 6, lineHeight: 17 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  btn: { flex: 1, minWidth: 120, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 8 },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: "#fff", fontSize: 13, fontWeight: "700", textAlign: "center" },
  error: { marginTop: 8, fontSize: 12, color: "#b91c1c" },
});
