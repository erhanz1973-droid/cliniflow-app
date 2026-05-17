import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from "react-native";
import { useLanguage } from "../../lib/language-context";
import { buildUploadGuidanceSlots } from "../../lib/treatmentGuide/uploadGuidance";
import {
  promptIntakeFilePick,
  uploadPatientAiDocument,
} from "../../lib/treatmentGuide/uploadDocument";
import type { OperationalIntakeFlags, TreatmentGuideIntakeState } from "../../lib/treatmentGuide/types";
import type { UploadGuidanceSlot } from "../../lib/treatmentGuide/types";

type Props = {
  flags: OperationalIntakeFlags | null;
  documents: TreatmentGuideIntakeState["documents"];
  sessionId: string;
  clinicId: string | null;
  intake: TreatmentGuideIntakeState;
  onIntakeUpdate: (next: TreatmentGuideIntakeState) => void;
  onRefresh: () => Promise<void>;
  onOpenFiles?: () => void;
  embedded?: boolean;
};

export function UploadGuidance({
  flags,
  documents,
  sessionId,
  clinicId,
  intake,
  onIntakeUpdate,
  onRefresh,
  onOpenFiles,
  embedded,
}: Props) {
  const { t } = useLanguage();
  const [uploadingSlotId, setUploadingSlotId] = useState<string | null>(null);
  const [slotError, setSlotError] = useState<string | null>(null);

  const slots = useMemo(() => buildUploadGuidanceSlots(flags, documents), [flags, documents]);

  const runUpload = useCallback(
    async (slot: UploadGuidanceSlot, mode: "image" | "document") => {
      if (!clinicId) {
        Alert.alert(t("treatmentGuide.upload.noClinicTitle"), t("treatmentGuide.upload.noClinicBody"));
        return;
      }

      setSlotError(null);
      const pickMode =
        mode === "document" ? "document" : slot.allowDocumentPicker ? "both" : "image";
      const picked = await promptIntakeFilePick(
        pickMode,
        {
          title: t(slot.titleKey),
          selectImage: t("treatmentGuide.upload.btn.selectImage"),
          takePhoto: t("treatmentGuide.upload.btn.takePhoto"),
          chooseFile: t("treatmentGuide.upload.btn.chooseFile"),
          cancel: t("common.cancel"),
        },
      );
      if (!picked) return;

      setUploadingSlotId(slot.id);
      try {
        const result = await uploadPatientAiDocument({
          file: picked,
          documentType: slot.documentType,
          sessionId,
          clinicId,
        });
        onIntakeUpdate({
          ...intake,
          operationalIntakeFlags: result.operationalIntakeFlags ?? intake.operationalIntakeFlags,
          intakeJourney: result.intakeJourney ?? intake.intakeJourney,
        });
        await onRefresh();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : t("messages.connectionError");
        setSlotError(msg);
      } finally {
        setUploadingSlotId(null);
      }
    },
    [clinicId, sessionId, intake, onIntakeUpdate, onRefresh, t],
  );

  return (
    <View style={embedded ? styles.embedded : styles.card}>
      {!embedded ? (
        <>
          <Text style={styles.title}>{t("treatmentGuide.section.uploads")}</Text>
          <Text style={styles.hint}>{t("treatmentGuide.section.uploadsActionHint")}</Text>
        </>
      ) : (
        <Text style={styles.hint}>{t("treatmentGuide.flow.step4.uploadHint")}</Text>
      )}
      <Text style={styles.consent}>{t("treatmentGuide.upload.consentShort")}</Text>

      {slots.map((slot) => {
        const busy = uploadingSlotId === slot.id;
        return (
          <View key={slot.id} style={styles.slot}>
            <View style={styles.slotHeader}>
              <Text style={styles.slotTitle}>{t(slot.titleKey)}</Text>
              {slot.done ? (
                <View style={styles.doneBadge}>
                  <Text style={styles.doneBadgeText}>{t("treatmentGuide.upload.status.uploaded")}</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.slotHint}>{t(slot.hintKey)}</Text>

            {slot.informational ? (
              <Text style={styles.infoNote}>{t("treatmentGuide.upload.slot.doctorReviewNote")}</Text>
            ) : null}

            {slot.showUpload ? (
              <View style={styles.btnRow}>
                <TouchableOpacity
                  style={[styles.uploadBtn, styles.uploadBtnPrimary, busy && styles.uploadBtnDisabled]}
                  onPress={() => void runUpload(slot, "image")}
                  disabled={busy}
                  activeOpacity={0.88}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.uploadBtnPrimaryText}>
                      {slot.id === "panoramic_xray"
                        ? t("treatmentGuide.upload.btn.uploadXrayImage")
                        : slot.id === "other"
                          ? t("treatmentGuide.upload.btn.selectImage")
                          : t("treatmentGuide.upload.btn.uploadSmilePhoto")}
                    </Text>
                  )}
                </TouchableOpacity>
                {slot.allowDocumentPicker ? (
                  <TouchableOpacity
                    style={[styles.uploadBtn, busy && styles.uploadBtnDisabled]}
                    onPress={() => void runUpload(slot, "document")}
                    disabled={busy}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.uploadBtnText}>{t("treatmentGuide.upload.btn.chooseFile")}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : slot.done ? (
              <Text style={styles.uploadedLine}>✓ {t("treatmentGuide.upload.status.uploaded")}</Text>
            ) : null}
          </View>
        );
      })}

      {slotError ? <Text style={styles.errorText}>{slotError}</Text> : null}

      {onOpenFiles ? (
        <TouchableOpacity style={styles.secondaryLink} onPress={onOpenFiles} activeOpacity={0.88}>
          <Text style={styles.secondaryLinkText}>{t("treatmentGuide.openFilesBrowse")}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  embedded: { marginTop: 4 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  title: { fontSize: 17, fontWeight: "800", color: "#0f172a", marginBottom: 6 },
  hint: { fontSize: 13, color: "#64748b", lineHeight: 19, marginBottom: 8 },
  consent: { fontSize: 11, color: "#94a3b8", lineHeight: 16, marginBottom: 14 },
  slot: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  slotHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 4,
  },
  slotTitle: { fontSize: 15, fontWeight: "800", color: "#0f172a", flex: 1 },
  slotHint: { fontSize: 13, color: "#64748b", lineHeight: 18, marginBottom: 10 },
  infoNote: { fontSize: 12, color: "#475569", fontStyle: "italic", marginBottom: 8, lineHeight: 17 },
  doneBadge: {
    backgroundColor: "#ecfdf5",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  doneBadgeText: { fontSize: 10, fontWeight: "800", color: "#047857" },
  btnRow: { gap: 8 },
  uploadBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  uploadBtnPrimary: {
    backgroundColor: "#2563eb",
    borderColor: "#2563eb",
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  uploadBtnText: { color: "#334155", fontSize: 14, fontWeight: "600" },
  uploadedLine: { fontSize: 13, fontWeight: "700", color: "#047857" },
  errorText: { color: "#b91c1c", fontSize: 13, marginTop: 10, lineHeight: 18 },
  secondaryLink: { marginTop: 12, paddingVertical: 8, alignItems: "center" },
  secondaryLinkText: { fontSize: 13, fontWeight: "600", color: "#64748b" },
});
