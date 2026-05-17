import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../../lib/language-context";
import {
  buildClinicInquiryDraft,
  SUGGESTED_QUESTION_KEYS,
  type ClinicInquiryAttachment,
} from "../../lib/treatmentGuide/buildClinicInquiryDraft";
import type { AiLeadData } from "../../lib/aiCoordinator/leadData";
import type { OperationalIntakeFlags, PatientIntakeDocument } from "../../lib/treatmentGuide/types";

type Props = {
  flags: OperationalIntakeFlags | null;
  leadData: AiLeadData;
  documents: PatientIntakeDocument[];
  patientNarrative: string;
  photoGuidanceSummary?: string;
  hasDentalPhoto?: boolean;
  dentalPhotoUrl?: string;
  draftText: string;
  onDraftTextChange: (text: string) => void;
  onReviewInquiry: () => void;
  onShareWithClinic: () => void;
  hasLinkedClinic: boolean;
};

function attachmentIcon(kind: ClinicInquiryAttachment["kind"]) {
  if (kind === "xray") return "scan-outline" as const;
  if (kind === "photo") return "image-outline" as const;
  return "document-text-outline" as const;
}

export function ClinicInquiryDraftPanel({
  flags,
  leadData,
  documents,
  patientNarrative,
  photoGuidanceSummary,
  hasDentalPhoto,
  dentalPhotoUrl,
  draftText,
  onDraftTextChange,
  onReviewInquiry,
  onShareWithClinic,
  hasLinkedClinic,
}: Props) {
  const { t } = useLanguage();
  const userEditedRef = useRef(false);

  const generated = useMemo(
    () =>
      buildClinicInquiryDraft({
        flags,
        leadData,
        documents,
        patientNarrative,
        photoGuidanceSummary,
        hasDentalPhoto,
        dentalPhotoUrl,
        t,
      }),
    [
      flags,
      leadData,
      documents,
      patientNarrative,
      photoGuidanceSummary,
      hasDentalPhoto,
      dentalPhotoUrl,
      t,
    ],
  );

  useEffect(() => {
    if (userEditedRef.current) return;
    if (generated.text !== draftText) onDraftTextChange(generated.text);
  }, [generated.text, draftText, onDraftTextChange]);

  const handleChangeText = useCallback(
    (text: string) => {
      userEditedRef.current = true;
      onDraftTextChange(text);
    },
    [onDraftTextChange],
  );

  const appendSuggestedQuestion = useCallback(
    (key: string) => {
      const line = t(key);
      if (draftText.includes(line)) return;
      const next = draftText.trim() ? `${draftText.trim()}\n• ${line}` : `${generated.text.trim()}\n• ${line}`;
      userEditedRef.current = true;
      onDraftTextChange(next);
    },
    [draftText, generated.text, onDraftTextChange, t],
  );

  const resetToGenerated = useCallback(() => {
    userEditedRef.current = false;
    onDraftTextChange(generated.text);
  }, [generated.text, onDraftTextChange]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t("treatmentGuide.inquiry.title")}</Text>
      <Text style={styles.hint}>{t("treatmentGuide.inquiry.hint")}</Text>

      <TextInput
        style={styles.draftInput}
        value={draftText}
        onChangeText={handleChangeText}
        multiline
        textAlignVertical="top"
        placeholder={t("treatmentGuide.inquiry.placeholder")}
        placeholderTextColor="#94a3b8"
        maxLength={4000}
      />

      <TouchableOpacity style={styles.resetLink} onPress={resetToGenerated} activeOpacity={0.85}>
        <Text style={styles.resetLinkText}>{t("treatmentGuide.inquiry.resetDraft")}</Text>
      </TouchableOpacity>

      {generated.attachments.length > 0 ? (
        <View style={styles.attachBlock}>
          <Text style={styles.attachTitle}>{t("treatmentGuide.inquiry.attachmentsTitle")}</Text>
          {generated.attachments.map((a) => (
            <View key={a.id} style={styles.attachRow}>
              <Ionicons name={attachmentIcon(a.kind)} size={18} color="#64748b" />
              <Text style={styles.attachLabel}>{a.label}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.attachEmpty}>{t("treatmentGuide.inquiry.attachments.noneHint")}</Text>
      )}

      <Text style={styles.suggestLabel}>{t("treatmentGuide.inquiry.suggestLabel")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.suggestScroll}>
        {SUGGESTED_QUESTION_KEYS.map((key) => (
          <TouchableOpacity
            key={key}
            style={styles.suggestChip}
            onPress={() => appendSuggestedQuestion(key)}
            activeOpacity={0.88}
          >
            <Text style={styles.suggestChipText}>{t(key)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <TouchableOpacity style={styles.primaryBtn} onPress={onReviewInquiry} activeOpacity={0.9}>
        <Text style={styles.primaryBtnText}>{t("treatmentGuide.inquiry.cta.review")}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryBtn} onPress={onShareWithClinic} activeOpacity={0.88}>
        <Text style={styles.secondaryBtnText}>
          {hasLinkedClinic
            ? t("treatmentGuide.inquiry.cta.shareLinked")
            : t("treatmentGuide.inquiry.cta.prepare")}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
  },
  title: { fontSize: 16, fontWeight: "800", color: "#0f172a", marginBottom: 6 },
  hint: { fontSize: 13, color: "#64748b", lineHeight: 19, marginBottom: 12 },
  draftInput: {
    minHeight: 200,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: "#0f172a",
    lineHeight: 22,
  },
  resetLink: { alignSelf: "flex-start", marginTop: 8, marginBottom: 12 },
  resetLinkText: { fontSize: 13, fontWeight: "600", color: "#2563eb" },
  attachBlock: { marginBottom: 12 },
  attachTitle: { fontSize: 13, fontWeight: "700", color: "#334155", marginBottom: 8 },
  attachRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  attachLabel: { fontSize: 13, color: "#475569", flex: 1 },
  attachEmpty: { fontSize: 12, color: "#94a3b8", marginBottom: 12, lineHeight: 17 },
  suggestLabel: { fontSize: 12, color: "#64748b", marginBottom: 8 },
  suggestScroll: { marginBottom: 16, maxHeight: 44 },
  suggestChip: {
    backgroundColor: "#f1f5f9",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    maxWidth: 260,
  },
  suggestChipText: { fontSize: 12, color: "#334155", lineHeight: 16 },
  primaryBtn: {
    backgroundColor: "#0f172a",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  secondaryBtn: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  secondaryBtnText: { color: "#334155", fontSize: 15, fontWeight: "600" },
});
