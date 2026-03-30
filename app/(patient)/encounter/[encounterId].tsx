import React, { useCallback, useEffect, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth } from "../../../lib/auth";
import { API_BASE } from "../../../lib/api";
import DiagnosisCard, { DiagnosisItem } from "../../../components/DiagnosisCard";

// ─── patient-friendly diagnosis label mapper ──────────────────────────────
const ICD_FRIENDLY: Record<string, { title: string; description: string }> = {
  "K02":   { title: "Diş çürüğü", description: "Dişinizde bakteri kaynaklı bir çürük oluşmuş. Erken tedavi ile kolayca giderilebilir." },
  "K02.0": { title: "Mine çürüğü", description: "Dişin en dış tabakasında (mine) başlangıç çürüğü. Erken evrede tedavi oldukça kolaydır." },
  "K02.1": { title: "Dentin çürüğü", description: "Çürük, minenin altındaki dentin tabakasına ulaşmış. Dolgu ile tedavi edilir." },
  "K04":   { title: "Diş siniri problemi", description: "Dişin iç kanallarını veya sinirini etkileyen bir sorun tespit edildi." },
  "K04.0": { title: "Diş siniri iltihabı", description: "Diş sinirinde iltihaplanma var. Kanal tedavisi veya ilaç ile iyileşebilir." },
  "K04.1": { title: "Diş siniri hasarı", description: "Dişin siniri hasar görmüş. Doktorunuz tedavi seçeneklerini değerlendirecek." },
  "K05":   { title: "Diş eti problemi", description: "Diş etinizde iltihap veya hasar tespit edildi." },
  "K05.0": { title: "Diş eti iltihabı (Akut)", description: "Diş etinde ani başlayan iltihap. Ağız hijyeni ve tedavi ile geçer." },
  "K05.1": { title: "Diş eti iltihabı (Kronik)", description: "Uzun süreli diş eti iltihabı. Diş taşı temizliği ve düzenli bakım önerilir." },
  "K08":   { title: "Diş kayıpları veya sorunları", description: "Diş kaybı veya diş yapısıyla ilgili bir sorun tespit edildi." },
  "K08.1": { title: "Diş kaybı (Kaza/Hastalık)", description: "Kaza ya da hastalık nedeniyle diş kaybı oluşmuş." },
  "S02":   { title: "Diş kırığı", description: "Dişte kırık veya çatlak tespit edildi." },
};

function toFriendly(code: string, rawDescription: string): DiagnosisItem {
  const prefix4 = code?.substring(0, 4);
  const prefix3 = code?.substring(0, 3);
  const mapped = ICD_FRIENDLY[code] || ICD_FRIENDLY[prefix4] || ICD_FRIENDLY[prefix3];
  return {
    code: code || "—",
    title: mapped?.title || rawDescription || "Diş ile ilgili bulgu",
    description: mapped?.description,
  };
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

function procedureName(type: string) {
  const map: Record<string, string> = {
    CROWN: "Kuron", FILLING: "Dolgu", EXTRACTION: "Çekim",
    ROOT_CANAL_TREATMENT: "Kanal Tedavisi", IMPLANT: "İmplant",
    IMPLANT_CROWN: "İmplant Kuron", BRIDGE_UNIT: "Köprü",
    TEMP_CROWN: "Geçici Kuron", TEMP_FILLING: "Geçici Dolgu",
    FOLLOWUP: "Kontrol", CONSULT: "Konsültasyon",
    LAB: "Lab / Tarama", TREATMENT: "Tedavi Randevusu",
  };
  return map[type] || type;
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
  const patientId = paramPatientId || String(user?.patientId || user?.id || "");

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

      setDiagnoses(relevant.map((d) => toFriendly(d.icd10_code || "", d.icd10_description || "")));

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
  }, [patientId, encounterId, user?.token]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const title = toothNum ? `Diş ${toothNum} – Ziyaret Detayı` : "Ziyaret Detayı";

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
    >
      {/* Back */}
      <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
        <Text style={styles.backText}>← Geri</Text>
      </TouchableOpacity>

      <Text style={styles.screenTitle}>{title}</Text>

      {/* ── Diagnosis ─────────────────────────── */}
      <SectionTitle label="🔍 Tanı" />
      <DiagnosisCard diagnoses={diagnoses} />

      {/* ── Treatments ────────────────────────── */}
      {procedures.length > 0 && (
        <>
          <SectionTitle label="🦷 İşlemler" />
          {procedures.map((p, idx) => (
            <View key={p.id || idx} style={styles.procCard}>
              <Text style={styles.procName}>
                {procedureName(p.type || p.procedure_id || "")}
              </Text>
              <Text style={styles.procMeta}>
                Diş {p.tooth_number || "—"}
                {p.status ? `  ·  ${p.status === "PLANNED" ? "Planlandı" : p.status === "COMPLETED" ? "Tamamlandı" : p.status}` : ""}
              </Text>
            </View>
          ))}
        </>
      )}

      {diagnoses.length === 0 && procedures.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Bu ziyaret için henüz kayıt bulunmuyor.</Text>
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
