import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "../../lib/api";
import { useRouter } from "expo-router";
import { useLanguage } from "../../lib/language-context";
import { getCliniflowAuthToken, getPatientIdFromToken } from "../../lib/cliniflowAiMobile";

// ─── Types ────────────────────────────────────────────────────────────────────

type YesNoField = {
  value: boolean | null;
  detail: string;
};

type MedicalCondition =
  | "diabetes"
  | "heart_disease"
  | "high_blood_pressure"
  | "asthma"
  | "bleeding_disorders"
  | "none";

const CONDITIONS: { key: MedicalCondition; label: string }[] = [
  { key: "diabetes", label: "Diabetes" },
  { key: "heart_disease", label: "Heart disease" },
  { key: "high_blood_pressure", label: "High blood pressure" },
  { key: "asthma", label: "Asthma" },
  { key: "bleeding_disorders", label: "Bleeding disorders" },
  { key: "none", label: "None of the above" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

function YesNoQuestion({
  label,
  field,
  onChange,
  yesLabel,
  noLabel,
  detailPlaceholder,
}: {
  label: string;
  field: YesNoField;
  onChange: (f: YesNoField) => void;
  yesLabel: string;
  noLabel: string;
  detailPlaceholder: string;
}) {
  return (
    <View style={styles.yesNoBlock}>
      <Text style={styles.questionLabel}>{label}</Text>
      <View style={styles.yesNoRow}>
        <TouchableOpacity
          style={[styles.yesNoBtn, field.value === true && styles.yesNoBtnActive]}
          onPress={() => onChange({ ...field, value: true })}
        >
          <Text style={[styles.yesNoBtnText, field.value === true && styles.yesNoBtnTextActive]}>
            {yesLabel}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.yesNoBtn, field.value === false && styles.yesNoBtnActiveNo]}
          onPress={() => onChange({ ...field, value: false, detail: "" })}
        >
          <Text style={[styles.yesNoBtnText, field.value === false && styles.yesNoBtnTextActive]}>
            {noLabel}
          </Text>
        </TouchableOpacity>
      </View>
      {field.value === true && (
        <TextInput
          style={styles.detailInput}
          placeholder={detailPlaceholder}
          placeholderTextColor="#9ca3af"
          value={field.detail}
          onChangeText={(v) => onChange({ ...field, detail: v })}
          multiline
          numberOfLines={3}
        />
      )}
    </View>
  );
}

function CheckboxItem({
  label,
  checked,
  onToggle,
  isNone,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  isNone?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.checkboxRow} onPress={onToggle} activeOpacity={0.7}>
      <View style={[styles.checkbox, checked && (isNone ? styles.checkboxNone : styles.checkboxChecked)]}>
        {checked && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <Text style={[styles.checkboxLabel, isNone && styles.checkboxLabelNone]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MedicalFormScreen() {
  const router = useRouter();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  // Personal Health
  const [allergies, setAllergies] = useState<YesNoField>({ value: null, detail: "" });
  const [medications, setMedications] = useState<YesNoField>({ value: null, detail: "" });
  const [chronicDiseases, setChronicDiseases] = useState<YesNoField>({ value: null, detail: "" });

  // Medical Conditions
  const [conditions, setConditions] = useState<Set<MedicalCondition>>(new Set());

  // Medications list
  const [medicationsList, setMedicationsList] = useState("");

  // Notes
  const [notes, setNotes] = useState("");

  // ── Load existing form ──────────────────────────────────────────────────────
  const loadForm = useCallback(async () => {
    const token = await getCliniflowAuthToken(AsyncStorage);
    if (!token) {
      setLoading(false);
      return;
    }
    const patientId = getPatientIdFromToken(token);
    if (!patientId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/medical-form`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      });
      if (!res.ok) { setLoading(false); return; }
      const json = await res.json().catch(() => ({}));
      const d = json.formData || json.form;
      if (!d) { setLoading(false); return; }

      if (d.allergies) setAllergies(d.allergies);
      if (d.medications) setMedications(d.medications);
      if (d.chronicDiseases) setChronicDiseases(d.chronicDiseases);
      if (Array.isArray(d.conditions)) setConditions(new Set(d.conditions));
      if (d.medicationsList) setMedicationsList(d.medicationsList);
      if (d.notes) setNotes(d.notes);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadForm(); }, [loadForm]);

  // ── Conditions toggle ───────────────────────────────────────────────────────
  const toggleCondition = (key: MedicalCondition) => {
    setConditions((prev) => {
      const next = new Set(prev);
      if (key === "none") {
        return next.has("none") ? new Set() : new Set(["none"]);
      }
      next.delete("none");
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const token = await getCliniflowAuthToken(AsyncStorage);
    if (!token) {
      Alert.alert(t("common.error"), t("medicalForm.saveError"));
      return;
    }
    const patientId = getPatientIdFromToken(token);
    if (!patientId) {
      Alert.alert(t("common.error"), t("medicalForm.saveError"));
      return;
    }
    setSubmitting(true);
    setSaved(false);
    try {
      const body = {
        allergies,
        medications,
        chronicDiseases,
        conditions: [...conditions],
        medicationsList: medicationsList.trim(),
        notes: notes.trim(),
        submittedAt: new Date().toISOString(),
      };
      const res = await fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/medical-form`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "save_failed");
      setSaved(true);
      Alert.alert(t("medicalForm.saved"), "", [
        { text: t("common.close"), onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert(t("common.error"), t("medicalForm.saveError"));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>{t("medicalForm.back")}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t("medicalForm.title")}</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Data consent notice */}
        <View style={styles.consentCard}>
          <Text style={styles.consentIcon}>🔒</Text>
          <Text style={styles.consentText}>{t("medicalForm.consentNotice")}</Text>
        </View>

        {/* ── PERSONAL HEALTH ── */}
        <SectionHeader title={t("profile.health")} />
        <View style={styles.card}>
          <YesNoQuestion
            label={t("medicalForm.allergies")}
            field={allergies}
            onChange={setAllergies}
            yesLabel={t("medicalForm.yes")}
            noLabel={t("medicalForm.no")}
            detailPlaceholder={t("medicalForm.detailPlaceholder")}
          />
          <View style={styles.divider} />
          <YesNoQuestion
            label={t("medicalForm.medications")}
            field={medications}
            onChange={setMedications}
            yesLabel={t("medicalForm.yes")}
            noLabel={t("medicalForm.no")}
            detailPlaceholder={t("medicalForm.detailPlaceholder")}
          />
          <View style={styles.divider} />
          <YesNoQuestion
            label={t("medicalForm.chronicDiseases")}
            field={chronicDiseases}
            onChange={setChronicDiseases}
            yesLabel={t("medicalForm.yes")}
            noLabel={t("medicalForm.no")}
            detailPlaceholder={t("medicalForm.detailPlaceholder")}
          />
        </View>

        {/* ── MEDICAL CONDITIONS ── */}
        <SectionHeader title={t("medicalForm.conditions")} />
        <View style={styles.card}>
          {CONDITIONS.map((c) => (
            <CheckboxItem
              key={c.key}
              label={c.label}
              checked={conditions.has(c.key)}
              onToggle={() => toggleCondition(c.key)}
              isNone={c.key === "none"}
            />
          ))}
        </View>

        {/* ── MEDICATIONS ── */}
        <SectionHeader title={t("medicalForm.medicationsList")} />
        <View style={styles.card}>
          <TextInput
            style={styles.textArea}
            placeholder={t("medicalForm.medicationsPlaceholder")}
            placeholderTextColor="#9ca3af"
            value={medicationsList}
            onChangeText={setMedicationsList}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* ── NOTES ── */}
        <SectionHeader title={t("medicalForm.notes")} />
        <View style={styles.card}>
          <TextInput
            style={styles.textArea}
            placeholder={t("medicalForm.notesPlaceholder")}
            placeholderTextColor="#9ca3af"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* ── SUBMIT ── */}
        <TouchableOpacity
          style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>
              {saved ? t("medicalForm.saved") : t("medicalForm.save")}
            </Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f3f4f6" },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  backBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: "#f3f4f6" },
  backBtnText: { fontSize: 14, fontWeight: "600", color: "#374151" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: "#111827" },

  content: { padding: 16 },

  // Consent notice
  consentCard: {
    backgroundColor: "#f0fdf4",
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  consentIcon: { fontSize: 18 },
  consentText: { flex: 1, fontSize: 13, color: "#166534", lineHeight: 20 },

  // Intro (kept for backward compat)
  introCard: {
    backgroundColor: "#eff6ff",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#bfdbfe",
  },
  introIcon: { fontSize: 24 },
  introText: { flex: 1, fontSize: 13, color: "#1e40af", lineHeight: 20 },

  // Section
  sectionHeader: { marginTop: 20, marginBottom: 8 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },

  // Card
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardSubtitle: { fontSize: 13, color: "#6b7280", marginBottom: 12 },
  divider: { height: 1, backgroundColor: "#f3f4f6", marginVertical: 14 },

  // Yes/No
  yesNoBlock: {},
  questionLabel: { fontSize: 15, fontWeight: "600", color: "#111827", marginBottom: 10, lineHeight: 22 },
  yesNoRow: { flexDirection: "row", gap: 10 },
  yesNoBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  yesNoBtnActive: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  yesNoBtnActiveNo: { borderColor: "#16a34a", backgroundColor: "#f0fdf4" },
  yesNoBtnText: { fontSize: 14, fontWeight: "600", color: "#9ca3af" },
  yesNoBtnTextActive: { color: "#111827" },
  detailInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#f9fafb",
    minHeight: 72,
    textAlignVertical: "top",
  },

  // Checkbox
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: "#d1d5db",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f9fafb",
  },
  checkboxChecked: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  checkboxNone: { backgroundColor: "#6b7280", borderColor: "#6b7280" },
  checkmark: { color: "#fff", fontSize: 13, fontWeight: "700" },
  checkboxLabel: { fontSize: 15, color: "#111827", flex: 1 },
  checkboxLabelNone: { color: "#6b7280", fontStyle: "italic" },

  // Text area
  textArea: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#f9fafb",
    minHeight: 100,
    textAlignVertical: "top",
  },

  // Optional label
  optional: { fontSize: 12, color: "#9ca3af", fontWeight: "400" },

  // Submit
  submitBtn: {
    marginTop: 24,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  submitBtnDisabled: { backgroundColor: "#9ca3af" },
  submitBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
