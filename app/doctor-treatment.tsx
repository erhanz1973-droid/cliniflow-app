// app/doctor-treatment.tsx
// Doctor Treatment Screen – FINAL (role + status safe)

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Dimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";
import { Ionicons } from "@expo/vector-icons";

const { width: screenWidth } = Dimensions.get("window");

/* ===================== TYPES ===================== */
interface Tooth {
  fdiNumber: string;
  status: "EMPTY" | "PLANNED" | "IN_PROGRESS" | "COMPLETED";
  diagnosis?: string[];
  procedures?: Procedure[];
  notes?: string;
  plannedDate?: string;
  price?: number;
}

interface Procedure {
  id: string;
  type: string;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED";
}

interface PatientInfo {
  id: string;
  name: string;
  status: string;
  lastVisit?: string;
}

interface TreatmentRecord {
  id: string;
  date: string;
  tooth: string;
  procedure: string;
  status: string;
  doctorName?: string;
}

interface PhotoFile {
  id: string;
  url: string;
  type: "intraoral" | "xray" | "document";
  date: string;
  quality: "good" | "poor" | "repeat_needed";
  linkedTooth?: string;
}

/* ===================== HELPERS ===================== */
async function safeJson(response: Response) {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return await response.json();
}

function getToothColor(status?: string) {
  switch (status) {
    case "COMPLETED":
      return "#10B981";
    case "IN_PROGRESS":
      return "#F59E0B";
    case "PLANNED":
      return "#EF4444";
    default:
      return "#E5E7EB";
  }
}

function getStatusText(status?: string) {
  switch (status) {
    case "COMPLETED":
      return "Tamamlandı";
    case "IN_PROGRESS":
      return "Devam Ediyor";
    case "PLANNED":
      return "Planlandı";
    default:
      return "Boş";
  }
}

/* ===================== SCREEN ===================== */
export default function DoctorTreatmentScreen() {
  const router = useRouter();
  const { patientId } = useLocalSearchParams();
  const { user, isAuthReady, isDoctor, isPatient } = useAuth();

  const [loading, setLoading] = useState(true);
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
  const [teeth, setTeeth] = useState<Tooth[]>([]);
  const [selectedTooth, setSelectedTooth] = useState<Tooth | null>(null);
  const [records, setRecords] = useState<TreatmentRecord[]>([]);
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingTooth, setEditingTooth] = useState<Tooth | null>(null);

  /* ---------- ROLE + STATUS GUARD ---------- */
  useEffect(() => {
    if (!isAuthReady) return;

    if (!isDoctor || user?.status !== "ACTIVE") {
      if (isPatient) {
        router.replace(`/treatments?patientId=${patientId}`);
      } else {
        router.replace("/waiting-approval");
      }
    }
  }, [isAuthReady, isDoctor, isPatient, user, patientId]);

  /* ---------- LOAD DATA ---------- */
  useEffect(() => {
    if (!isAuthReady || !isDoctor || user?.status !== "ACTIVE" || !patientId) {
      return;
    }
    loadAll();
  }, [isAuthReady, isDoctor, user, patientId]);

  async function loadAll() {
    try {
      setLoading(true);

      const patientRes = await fetch(
        `${API_BASE}/api/doctor/patient/${patientId}`,
        { headers: { Authorization: `Bearer ${user?.token}` } }
      );
      const patientData = await safeJson(patientRes);
      setPatientInfo(patientData.patient);

      const teethRes = await fetch(
        `${API_BASE}/api/doctor/treatment/${patientId}/teeth`,
        { headers: { Authorization: `Bearer ${user?.token}` } }
      );
      const teethData = await safeJson(teethRes);
      setTeeth(teethData.teeth || []);

      const recRes = await fetch(
        `${API_BASE}/api/doctor/treatment/${patientId}/records`,
        { headers: { Authorization: `Bearer ${user?.token}` } }
      );
      const recData = await safeJson(recRes);
      setRecords(recData.records || []);

      const photoRes = await fetch(
        `${API_BASE}/api/doctor/treatment/${patientId}/photos`,
        { headers: { Authorization: `Bearer ${user?.token}` } }
      );
      const photoData = await safeJson(photoRes);
      setPhotos(photoData.photos || []);
    } catch (e) {
      console.error(e);
      Alert.alert("Hata", "Tedavi verileri yüklenemedi");
    } finally {
      setLoading(false);
    }
  }

  /* ---------- TOOTH MAP ---------- */
  const allTeeth = [
    ...Array.from({ length: 8 }, (_, i) => 18 - i),
    ...Array.from({ length: 8 }, (_, i) => 21 + i),
    ...Array.from({ length: 8 }, (_, i) => 38 - i),
    ...Array.from({ length: 8 }, (_, i) => 41 + i),
  ];

  const renderTooth = (num: number) => {
    const tooth = teeth.find((t) => t.fdiNumber === String(num));
    return (
      <Pressable
        key={num}
        style={[
          styles.tooth,
          { backgroundColor: getToothColor(tooth?.status) },
        ]}
        onPress={() => {
          if (!tooth) {
            Alert.alert("Bilgi", "Bu diş için henüz kayıt yok.");
            return;
          }
          setSelectedTooth(tooth);
          setEditingTooth(tooth);
          setShowModal(true);
        }}
      >
        <Text style={styles.toothText}>{num}</Text>
      </Pressable>
    );
  };

  /* ---------- STATES ---------- */
  if (!isAuthReady || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Yükleniyor...</Text>
      </View>
    );
  }

  /* ---------- UI ---------- */
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.patientName}>{patientInfo?.name}</Text>
        <Text style={styles.patientStatus}>
          Durum: {patientInfo?.status}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>Diş Haritası</Text>
        <View style={styles.toothGrid}>
          {allTeeth.map(renderTooth)}
        </View>

        {selectedTooth && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              Diş #{selectedTooth.fdiNumber}
            </Text>
            <Text>Durum: {getStatusText(selectedTooth.status)}</Text>
          </View>
        )}
      </ScrollView>

      {/* ---------- MODAL ---------- */}
      <Modal visible={showModal} animationType="slide">
        <View style={styles.modal}>
          <Text style={styles.sectionTitle}>
            Diş #{editingTooth?.fdiNumber}
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Not"
            value={editingTooth?.notes || ""}
            onChangeText={(t) =>
              setEditingTooth(
                editingTooth ? { ...editingTooth, notes: t } : null
              )
            }
          />

          <Pressable
            style={styles.closeBtn}
            onPress={() => setShowModal(false)}
          >
            <Text style={{ color: "#fff" }}>Kapat</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

/* ===================== STYLES ===================== */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  patientName: { fontSize: 18, fontWeight: "700" },
  patientStatus: { fontSize: 14, color: "#6B7280" },
  content: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  toothGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  tooth: {
    width: 36,
    height: 36,
    margin: 4,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  toothText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  section: {
    marginTop: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#fff",
  },
  modal: { flex: 1, padding: 20 },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    padding: 12,
    borderRadius: 8,
    marginVertical: 12,
  },
  closeBtn: {
    backgroundColor: "#2563EB",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
});
