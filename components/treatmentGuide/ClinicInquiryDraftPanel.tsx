import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useLanguage } from "../../lib/language-context";
import {
  buildClinicInquiryDraft,
  SUGGESTED_QUESTION_KEYS,
} from "../../lib/treatmentGuide/buildClinicInquiryDraft";
import {
  collectInquiryAttachments,
  type InquiryAttachment,
} from "../../lib/treatmentGuide/collectInquiryAttachments";
import type { AiLeadData } from "../../lib/aiCoordinator/leadData";
import type { OperationalIntakeFlags, PatientIntakeDocument } from "../../lib/treatmentGuide/types";
import { ClinicInquiryAttachmentsPreview } from "./ClinicInquiryAttachmentsPreview";

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
  excludedAttachmentIds: ReadonlySet<string>;
  onToggleAttachmentExclude: (id: string) => void;
  onIncludedAttachmentsChange?: (attachments: InquiryAttachment[]) => void;
  onRequestOffers: () => void;
};

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
  excludedAttachmentIds,
  onToggleAttachmentExclude,
  onIncludedAttachmentsChange,
  onRequestOffers,
}: Props) {
  const { t } = useLanguage();
  const userEditedRef = useRef(false);

  const allAttachments = useMemo(
    () =>
      collectInquiryAttachments({
        documents,
        dentalPhotoUrl,
        sessionPhotoUrl: hasDentalPhoto ? dentalPhotoUrl : undefined,
        t,
      }),
    [documents, dentalPhotoUrl, hasDentalPhoto, t],
  );

  const includedAttachments = useMemo(
    () => allAttachments.filter((a) => !excludedAttachmentIds.has(a.id)),
    [allAttachments, excludedAttachmentIds],
  );

  useEffect(() => {
    onIncludedAttachmentsChange?.(includedAttachments);
  }, [includedAttachments, onIncludedAttachmentsChange]);

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

      <ClinicInquiryAttachmentsPreview
        attachments={collectInquiryAttachments({
          documents,
          dentalPhotoUrl,
          sessionPhotoUrl: hasDentalPhoto ? dentalPhotoUrl : undefined,
          t,
        })}
        excludedIds={excludedAttachmentIds}
        onToggleExclude={onToggleAttachmentExclude}
      />

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

      <TouchableOpacity style={styles.primaryBtn} onPress={onRequestOffers} activeOpacity={0.9}>
        <Text style={styles.primaryBtnText}>{t("treatmentGuide.inquiry.cta.requestOffers")}</Text>
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
});
