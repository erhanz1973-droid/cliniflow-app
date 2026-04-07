import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth";
import { useLanguage } from "../../../lib/language-context";
import { API_BASE } from "../../../lib/api";
import DiagnosisCard, { DiagnosisItem } from "../../../components/DiagnosisCard";
import { getIcd10En } from "../../../lib/icd10-en";
import { getIcd10Tr } from "../../../lib/icd10-tr";
import { getIcd10Ru } from "../../../lib/icd10-ru";
import { getIcd10Ka } from "../../../lib/icd10-ka";

function getIcd10Label(
  lang: string,
  code: string,
  fallback: string,
): string {
  if (lang === "tr") return getIcd10Tr(code, fallback);
  if (lang === "ru") return getIcd10Ru(code, fallback);
  if (lang === "ka") return getIcd10Ka(code, fallback);
  return getIcd10En(code, fallback);
}

// ─── types ────────────────────────────────────────────────────────────────
interface RawDiagnosis {
  icd10_code?: string;
  icd10_description?: string;
  tooth_number?: string | number;
  notes?: string;
}

interface Procedure {
  id: string;
  type?: string;
  procedure_id?: string;
  status?: string;
  scheduledAt?: string | number | null;
  tooth_number?: string | number;
}

// ─── section header ────────────────────────────────────────────────────────
function SectionTitle({ label }: { label: string }) {
  return <Text style={styles.sectionTitle}>{label}</Text>;
}

// ─── main screen ──────────────────────────────────────────────────────────
export default function EncounterDetailScreen() {
  const router = useRouter();
  const { encounterId, patientId: paramPatientId, toothLabel } = useLocalSearchParams<{
    encounterId: string;
    patientId: string;
    toothLabel?: string;
  }>();

  const { user } = useAuth();
  const { t, currentLanguage } = useLanguage();
  const patientId = paramPatientId || String(user?.patientId || user?.id || "");

  const procedureName = (type: string) => {
    const map: Record<string, string> = {
      CROWN: t("encounter.procedure.crown"),
      FILLING: t("encounter.procedure.filling"),
      EXTRACTION: t("encounter.procedure.extraction"),
      ROOT_CANAL_TREATMENT: t("encounter.procedure.rootCanal"),
      IMPLANT: t("encounter.procedure.implant"),
      IMPLANT_CROWN: t("encounter.procedure.implantCrown"),
      BRIDGE_UNIT: t("encounter.procedure.bridge"),
      TEMP_CROWN: t("encounter.procedure.tempCrown"),
      TEMP_FILLING: t("encounter.procedure.tempFilling"),
      FOLLOWUP: t("encounter.procedure.followup"),
      CONSULT: t("encounter.procedure.consult"),
      LAB: t("encounter.procedure.lab"),
      TREATMENT: t("encounter.procedure.treatment"),
    };
    return map[type] || type;
  };

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [diagnoses, setDiagnoses] = useState<DiagnosisItem[]>([]);
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [toothNum, setToothNum] = useState<string>(toothLabel || "");

  const load = useCallback(async () => {
    if (!patientId || !user?.token) { setLoading(false); setRefreshing(false); return; }
    try {
      const res = await fetch(
        `${API_BASE}/api/patient/${encodeURIComponent(patientId)}/treatments`,
        { headers: { Authorization: `Bearer ${user.token}`, Accept: "application/json" } }
      );
      const json = await res.json().catch(() => ({}));

      // All diagnoses across all teeth
      const rawDiags: RawDiagnosis[] = Array.isArray(json.diagnoses) ? json.diagnoses : [];

      // Filter by encounterId (= tooth toothId or all if none)
      const relevant = encounterId
        ? rawDiags.filter((d) =>
            !d.tooth_number ||
            String(d.tooth_number) === String(encounterId) ||
            encounterId === "all"
          )
        : rawDiags;

      setDiagnoses(relevant.map((d) => ({
        code: d.icd10_code || "—",
        title: getIcd10Label(currentLanguage, d.icd10_code || "", d.icd10_description || t("encounter.findingLabel")),
      })));

      // Procedures for this encounter/tooth
      const teeth: any[] = Array.isArray(json.teeth) ? json.teeth : [];
      const procs: Procedure[] = [];
      teeth.forEach((tooth) => {
        const tid = String(tooth.toothId || tooth.toothNumber || tooth.fdiNumber || "");
        if (!encounterId || encounterId === "all" || tid === String(encounterId)) {
          (tooth.procedures || []).forEach((p: any) => {
            procs.push({ ...p, tooth_number: tid });
          });
        }
      });
      setProcedures(procs);
      if (!toothNum && procs.length) setToothNum(procs[0].tooth_number?.toString() || "");
    } catch (_) {
      /* silent */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [patientId, encounterId, user?.token, currentLanguage, t]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const title = toothNum
    ? t("encounter.toothVisit").replace("{toothNum}", toothNum)
    : t("encounter.visitDetail");

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* Back */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>{t("encounter.back")}</Text>
      </TouchableOpacity>

      <Text style={styles.screenTitle}>{title}</Text>

      {/* ── Diagnosis ─────────────────────────── */}
      <SectionTitle label={t("encounter.diagnosisSection")} />
      <DiagnosisCard diagnoses={diagnoses} />

      {/* ── Treatments ────────────────────────── */}
      {procedures.length > 0 && (
        <>
          <SectionTitle label={t("encounter.treatmentsSection")} />
          {procedures.map((p, idx) => (
            <View key={p.id || idx} style={styles.procCard}>
              <Text style={styles.procName}>
                {procedureName(p.type || p.procedure_id || "")}
              </Text>
              <Text style={styles.procMeta}>
                {t("encounter.toothLabel").replace("{toothNum}", String(p.tooth_number || "—"))}
                {p.status ? `  ·  ${p.status === "PLANNED" ? t("encounter.statusPlanned") : p.status === "COMPLETED" ? t("encounter.statusCompleted") : p.status}` : ""}
              </Text>
            </View>
          ))}
        </>
      )}

      {diagnoses.length === 0 && procedures.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>{t("diagnosis.noData")}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  backBtn: { marginBottom: 16 },
  backText: { color: "#2563eb", fontSize: 14, fontWeight: "500" },
  screenTitle: { fontSize: 20, fontWeight: "700", color: "#111827", marginBottom: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6b7280",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 10,
    marginTop: 20,
  },
  procCard: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  procName: { fontSize: 15, fontWeight: "600", color: "#111827" },
  procMeta: { fontSize: 12, color: "#6b7280", marginTop: 4 },
  empty: { alignItems: "center", paddingVertical: 40 },
  emptyText: { color: "#9ca3af", fontSize: 14 },
});
