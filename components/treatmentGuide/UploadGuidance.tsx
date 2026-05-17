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
  pickIntakeDocumentFile,
  pickIntakeImageFromLibrary,
  uploadPatientAiDocument,
} from "../../lib/treatmentGuide/uploadDocument";
import {
  uploadPatientAiDocumentFromArchive,
  type PatientArchiveFile,
} from "../../lib/treatmentGuide/patientFileArchive";
import { PatientFileArchivePicker } from "./PatientFileArchivePicker";
import type { OperationalIntakeFlags, TreatmentGuideIntakeState } from "../../lib/treatmentGuide/types";

type Props = {
  flags: OperationalIntakeFlags | null;
  documents: TreatmentGuideIntakeState["documents"];
  sessionId: string;
  clinicId: string | null;
  patientId: string;
  intake: TreatmentGuideIntakeState;
  onIntakeUpdate: (next: TreatmentGuideIntakeState) => void;
  onRefresh: () => Promise<void>;
  onOpenFiles?: () => void;
  embedded?: boolean;
};

function documentTypeForPickedFile(mimeType: string): string {
  const m = mimeType.toLowerCase();
  if (m.includes("pdf")) return "treatment_report";
  if (m.startsWith("image/")) return "intraoral_photo";
  return "other";
}

export function UploadGuidance({
  flags,
  documents,
  sessionId,
  clinicId,
  patientId,
  intake,
  onIntakeUpdate,
  onRefresh,
  onOpenFiles,
  embedded,
}: Props) {
  const { t } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const [slotError, setSlotError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const slots = useMemo(() => buildUploadGuidanceSlots(flags, documents), [flags, documents]);

  const applyUploadResult = useCallback(
    async (result: Awaited<ReturnType<typeof uploadPatientAiDocument>>) => {
      onIntakeUpdate({
        ...intake,
        operationalIntakeFlags: result.operationalIntakeFlags ?? intake.operationalIntakeFlags,
        intakeJourney: result.intakeJourney ?? intake.intakeJourney,
      });
      await onRefresh();
    },
    [intake, onIntakeUpdate, onRefresh],
  );

  const ensureClinic = useCallback((): boolean => {
    if (clinicId) return true;
    Alert.alert(t("treatmentGuide.upload.noClinicTitle"), t("treatmentGuide.upload.noClinicBody"));
    return false;
  }, [clinicId, t]);

  const runUploadPicked = useCallback(
    async (picked: { uri: string; name: string; mimeType: string }, documentType: string) => {
      if (!ensureClinic()) return;
      setSlotError(null);
      setUploading(true);
      try {
        const result = await uploadPatientAiDocument({
          file: picked,
          documentType,
          sessionId,
          clinicId: clinicId!,
        });
        await applyUploadResult(result);
      } catch (e: unknown) {
        setSlotError(e instanceof Error ? e.message : t("messages.connectionError"));
      } finally {
        setUploading(false);
      }
    },
    [ensureClinic, sessionId, clinicId, applyUploadResult, t],
  );

  const handleSelectImage = useCallback(() => {
    if (!ensureClinic()) return;
    setArchiveOpen(true);
  }, [ensureClinic]);

  const handleArchiveSelect = useCallback(
    async (file: PatientArchiveFile) => {
      setArchiveOpen(false);
      if (!ensureClinic()) return;
      setSlotError(null);
      setUploading(true);
      try {
        const result = await uploadPatientAiDocumentFromArchive({
          file,
          sessionId,
          clinicId: clinicId!,
        });
        await applyUploadResult(result);
      } catch (e: unknown) {
        setSlotError(e instanceof Error ? e.message : t("messages.connectionError"));
      } finally {
        setUploading(false);
      }
    },
    [ensureClinic, sessionId, clinicId, applyUploadResult, t],
  );

  const handleChooseFile = useCallback(async () => {
    if (!ensureClinic()) return;
    const picked = await pickIntakeDocumentFile();
    if (!picked) return;
    await runUploadPicked(picked, documentTypeForPickedFile(picked.mimeType));
  }, [ensureClinic, runUploadPicked]);

  const handleAddFromGallery = useCallback(async () => {
    if (!ensureClinic()) return;
    const picked = await pickIntakeImageFromLibrary();
    if (!picked) return;
    await runUploadPicked(picked, "intraoral_photo");
  }, [ensureClinic, runUploadPicked]);

  if (embedded) {
    const uploadedLabels = documents
      .map((d) => d.documentTypeLabel || d.documentType)
      .filter(Boolean)
      .slice(0, 6);

    return (
      <View style={styles.embedded}>
        <Text style={styles.embeddedHint}>{t("treatmentGuide.flow.step4.uploadHint")}</Text>
        <Text style={styles.consent}>{t("treatmentGuide.upload.consentShort")}</Text>

        {uploadedLabels.length > 0 ? (
          <View style={styles.uploadedRow}>
            {uploadedLabels.map((label, i) => (
              <View key={`${label}-${i}`} style={styles.uploadedChip}>
                <Text style={styles.uploadedChipText}>✓ {label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.uploadBtn, styles.uploadBtnPrimary, uploading && styles.uploadBtnDisabled]}
            onPress={handleSelectImage}
            disabled={uploading}
            activeOpacity={0.88}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.uploadBtnPrimaryText}>
                {t("treatmentGuide.upload.btn.selectImage")}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
            onPress={() => void handleChooseFile()}
            disabled={uploading}
            activeOpacity={0.88}
          >
            <Text style={styles.uploadBtnText}>{t("treatmentGuide.upload.btn.chooseFile")}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.galleryLink}
          onPress={() => void handleAddFromGallery()}
          disabled={uploading}
          activeOpacity={0.85}
        >
          <Text style={styles.galleryLinkText}>{t("treatmentGuide.upload.archive.addFromGallery")}</Text>
        </TouchableOpacity>

        {slotError ? <Text style={styles.errorText}>{slotError}</Text> : null}

        {onOpenFiles ? (
          <TouchableOpacity style={styles.secondaryLink} onPress={onOpenFiles} activeOpacity={0.88}>
            <Text style={styles.secondaryLinkText}>{t("treatmentGuide.openFilesBrowse")}</Text>
          </TouchableOpacity>
        ) : null}

        <PatientFileArchivePicker
          visible={archiveOpen}
          patientId={patientId}
          onClose={() => setArchiveOpen(false)}
          onSelect={(file) => void handleArchiveSelect(file)}
        />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t("treatmentGuide.section.uploads")}</Text>
      <Text style={styles.hint}>{t("treatmentGuide.section.uploadsActionHint")}</Text>
      <Text style={styles.consent}>{t("treatmentGuide.upload.consentShort")}</Text>

      {slots.map((slot) => (
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
          {slot.done ? (
            <Text style={styles.uploadedLine}>✓ {t("treatmentGuide.upload.status.uploaded")}</Text>
          ) : null}
        </View>
      ))}

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
  embeddedHint: { fontSize: 14, color: "#334155", lineHeight: 21, marginBottom: 8, fontWeight: "500" },
  consent: { fontSize: 11, color: "#94a3b8", lineHeight: 16, marginBottom: 12 },
  uploadedRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 12 },
  uploadedChip: {
    backgroundColor: "#ecfdf5",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  uploadedChipText: { fontSize: 11, fontWeight: "600", color: "#047857" },
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
  uploadBtnPrimary: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnPrimaryText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  uploadBtnText: { color: "#334155", fontSize: 14, fontWeight: "600" },
  galleryLink: { marginTop: 10, alignSelf: "center", paddingVertical: 6 },
  galleryLinkText: { fontSize: 13, fontWeight: "600", color: "#2563eb" },
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
  slotHint: { fontSize: 13, color: "#64748b", lineHeight: 18, marginBottom: 6 },
  doneBadge: {
    backgroundColor: "#ecfdf5",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: "#a7f3d0",
  },
  doneBadgeText: { fontSize: 10, fontWeight: "800", color: "#047857" },
  uploadedLine: { fontSize: 13, fontWeight: "700", color: "#047857" },
  errorText: { color: "#b91c1c", fontSize: 13, marginTop: 10, lineHeight: 18 },
  secondaryLink: { marginTop: 12, paddingVertical: 8, alignItems: "center" },
  secondaryLinkText: { fontSize: 13, fontWeight: "600", color: "#64748b" },
});
