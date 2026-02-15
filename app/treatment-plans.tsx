// app/treatment-plans.tsx
// Treatment Plans - Doctor can create and manage treatment plans

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";

interface TreatmentPlan {
  id: string;
  patientId: string;
  patientName: string;
  toothNumber: string;
  diagnosis: string;
  procedure: string;
  price: number;
  status: "planned" | "in-progress" | "completed" | "cancelled";
  plannedDate: string;
  completedDate?: string;
  notes?: string;
}

interface NewTreatmentPlan {
  patientId: string;
  toothNumber: string;
  diagnosis: string;
  procedure: string;
  price: string;
  plannedDate: string;
  notes: string;
}

const { width: screenWidth } = Dimensions.get("window");

export default function TreatmentPlansScreen() {
  const router = useRouter();
  const { user, isAuthReady } = useAuth();
  const [loading, setLoading] = useState(true);
  const [treatmentPlans, setTreatmentPlans] = useState<TreatmentPlan[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [patients, setPatients] = useState<Array<{id: string, patientId: string, name: string}>>([]);
  const [newPlan, setNewPlan] = useState<NewTreatmentPlan>({
    patientId: "",
    toothNumber: "",
    diagnosis: "",
    procedure: "",
    price: "",
    plannedDate: "",
    notes: "",
  });

  useEffect(() => {
    if (!isAuthReady || !user) return;
    
    // Only doctors can access this screen
    if (user.role !== "DOCTOR") {
      router.replace("/home");
      return;
    }

    loadTreatmentPlans();
    loadPatients();
  }, [isAuthReady, user, router]);

  const loadTreatmentPlans = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_BASE}/api/doctor/treatment-plans`, {
        headers: {
          Authorization: `Bearer ${user?.token}`,
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          setTreatmentPlans(data.treatmentPlans || []);
        } else {
          Alert.alert("Hata", data.message || "Tedavi planları yüklenemedi");
        }
      } else {
        Alert.alert("Hata", "Tedavi planları yüklenemedi");
      }
    } catch (error) {
      console.error("[TREATMENT PLANS] Error loading:", error);
      Alert.alert("Hata", "Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  };

  const loadPatients = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/doctor/patients`, {
        headers: {
          Authorization: `Bearer ${user?.token}`,
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          setPatients(data.patients || []);
        }
      }
    } catch (error) {
      console.error("[TREATMENT PLANS] Error loading patients:", error);
    }
  };

  const handleAddTreatmentPlan = async () => {
    // Validation
    if (!newPlan.patientId || !newPlan.toothNumber || !newPlan.diagnosis || 
        !newPlan.procedure || !newPlan.price || !newPlan.plannedDate) {
      Alert.alert("Eksik Bilgi", "Lütfen tüm zorunlu alanları doldurun.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/doctor/treatment-plans`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.token}`,
          Accept: "application/json",
        },
        body: JSON.stringify({
          patientId: newPlan.patientId,
          toothNumber: newPlan.toothNumber,
          diagnosis: newPlan.diagnosis,
          procedure: newPlan.procedure,
          price: parseFloat(newPlan.price),
          plannedDate: newPlan.plannedDate,
          notes: newPlan.notes,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          Alert.alert("Başarılı", "Tedavi planı oluşturuldu.");
          setShowAddModal(false);
          setNewPlan({
            patientId: "",
            toothNumber: "",
            diagnosis: "",
            procedure: "",
            price: "",
            plannedDate: "",
            notes: "",
          });
          loadTreatmentPlans();
        } else {
          Alert.alert("Hata", data.message || "Tedavi planı oluşturulamadı");
        }
      } else {
        Alert.alert("Hata", "Tedavi planı oluşturulamadı");
      }
    } catch (error) {
      console.error("[TREATMENT PLANS] Error adding plan:", error);
      Alert.alert("Hata", "Bağlantı hatası");
    }
  };

  const handleStatusChange = async (planId: string, newStatus: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/doctor/treatment-plans/${planId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.token}`,
          Accept: "application/json",
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          loadTreatmentPlans();
        } else {
          Alert.alert("Hata", data.message || "Durum güncellenemedi");
        }
      } else {
        Alert.alert("Hata", "Durum güncellenemedi");
      }
    } catch (error) {
      console.error("[TREATMENT PLANS] Error updating status:", error);
      Alert.alert("Hata", "Bağlantı hatası");
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "#10B981";
      case "in-progress": return "#F59E0B";
      case "planned": return "#2563EB";
      case "cancelled": return "#EF4444";
      default: return "#6B7280";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed": return "Tamamlandı";
      case "in-progress": return "Devam Ediyor";
      case "planned": return "Planlandı";
      case "cancelled": return "İptal Edildi";
      default: return "Bilinmiyor";
    }
  };

  if (!isAuthReady || loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Tedavi Planları</Text>
        <Pressable 
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Text style={styles.addButtonText}>+ Plan Ekle</Text>
        </Pressable>
      </View>

      {/* Treatment Plans List */}
      <ScrollView style={styles.listContainer} contentContainerStyle={styles.listContent}>
        {treatmentPlans.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🦷</Text>
            <Text style={styles.emptyText}>Henüz tedavi planı yok</Text>
            <Pressable 
              style={styles.emptyButton}
              onPress={() => setShowAddModal(true)}
            >
              <Text style={styles.emptyButtonText}>İlk Planı Oluştur</Text>
            </Pressable>
          </View>
        ) : (
          treatmentPlans.map((plan) => (
            <View key={plan.id} style={styles.planCard}>
              <View style={styles.planHeader}>
                <View style={styles.patientInfo}>
                  <Text style={styles.patientName}>{plan.patientName}</Text>
                  <Text style={styles.patientId}>{plan.patientId}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(plan.status) }]}>
                  <Text style={styles.statusText}>{getStatusText(plan.status)}</Text>
                </View>
              </View>
              
              <View style={styles.planDetails}>
                <Text style={styles.toothInfo}>🦷 Diş: {plan.toothNumber}</Text>
                <Text style={styles.diagnosis}>🔍 Tanı: {plan.diagnosis}</Text>
                <Text style={styles.procedure}>⚕️ İşlem: {plan.procedure}</Text>
                <Text style={styles.price}>💰 Fiyat: ₺{plan.price}</Text>
                <Text style={styles.date}>📅 Planlanan: {new Date(plan.plannedDate).toLocaleDateString("tr-TR")}</Text>
                {plan.completedDate && (
                  <Text style={styles.date}>✅ Tamamlanan: {new Date(plan.completedDate).toLocaleDateString("tr-TR")}</Text>
                )}
                {plan.notes && (
                  <Text style={styles.notes}>📝 Notlar: {plan.notes}</Text>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                {plan.status === "planned" && (
                  <Pressable
                    style={[styles.actionButton, styles.startButton]}
                    onPress={() => handleStatusChange(plan.id, "in-progress")}
                  >
                    <Text style={styles.actionButtonText}>Başlat</Text>
                  </Pressable>
                )}
                {plan.status === "in-progress" && (
                  <Pressable
                    style={[styles.actionButton, styles.completeButton]}
                    onPress={() => handleStatusChange(plan.id, "completed")}
                  >
                    <Text style={styles.actionButtonText}>Tamamla</Text>
                  </Pressable>
                )}
                {(plan.status === "planned" || plan.status === "in-progress") && (
                  <Pressable
                    style={[styles.actionButton, styles.cancelButton]}
                    onPress={() => handleStatusChange(plan.id, "cancelled")}
                  >
                    <Text style={styles.actionButtonText}>İptal</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* Add Treatment Plan Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowAddModal(false)}>
              <Text style={styles.cancelText}>İptal</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Tedavi Planı Ekle</Text>
            <Pressable onPress={handleAddTreatmentPlan}>
              <Text style={styles.saveText}>Kaydet</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.label}>Hasta *</Text>
            <Pressable style={styles.selectButton} onPress={() => {/* TODO: Patient picker */}}>
              <Text style={styles.selectText}>
                {patients.find(p => p.patientId === newPlan.patientId)?.name || "Hasta Seçin"}
              </Text>
            </Pressable>

            <Text style={styles.label}>Diş Numarası *</Text>
            <TextInput
              style={styles.input}
              placeholder="Örn: 11, 21, 36"
              value={newPlan.toothNumber}
              onChangeText={(text) => setNewPlan({...newPlan, toothNumber: text})}
            />

            <Text style={styles.label}>ICD-10 Tanı *</Text>
            <TextInput
              style={styles.input}
              placeholder="Örn: K02.1 (Diş çürüğü)"
              value={newPlan.diagnosis}
              onChangeText={(text) => setNewPlan({...newPlan, diagnosis: text})}
            />

            <Text style={styles.label}>İşlem *</Text>
            <TextInput
              style={styles.input}
              placeholder="Örn: Kanal tedavisi, Dolgu"
              value={newPlan.procedure}
              onChangeText={(text) => setNewPlan({...newPlan, procedure: text})}
            />

            <Text style={styles.label}>Fiyat *</Text>
            <TextInput
              style={styles.input}
              placeholder="Örn: 1500"
              value={newPlan.price}
              onChangeText={(text) => setNewPlan({...newPlan, price: text})}
              keyboardType="numeric"
            />

            <Text style={styles.label}>Planlanan Tarih *</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              value={newPlan.plannedDate}
              onChangeText={(text) => setNewPlan({...newPlan, plannedDate: text})}
            />

            <Text style={styles.label}>Notlar</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Ek notlar..."
              value={newPlan.notes}
              onChangeText={(text) => setNewPlan({...newPlan, notes: text})}
              multiline
              numberOfLines={4}
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  addButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 20,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
    marginBottom: 16,
  },
  emptyButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  emptyButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  planCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  planHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  patientInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  patientId: {
    fontSize: 14,
    color: "#6B7280",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  planDetails: {
    gap: 4,
    marginBottom: 16,
  },
  toothInfo: {
    fontSize: 14,
    color: "#374151",
  },
  diagnosis: {
    fontSize: 14,
    color: "#374151",
  },
  procedure: {
    fontSize: 14,
    color: "#374151",
  },
  price: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "600",
  },
  date: {
    fontSize: 14,
    color: "#6B7280",
  },
  notes: {
    fontSize: 14,
    color: "#6B7280",
    fontStyle: "italic",
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 80,
    alignItems: "center",
  },
  startButton: {
    backgroundColor: "#F59E0B",
  },
  completeButton: {
    backgroundColor: "#10B981",
  },
  cancelButton: {
    backgroundColor: "#EF4444",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  cancelText: {
    fontSize: 16,
    color: "#EF4444",
    fontWeight: "600",
  },
  saveText: {
    fontSize: 16,
    color: "#2563EB",
    fontWeight: "600",
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  selectButton: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 16,
    backgroundColor: "#FFFFFF",
    marginBottom: 16,
  },
  selectText: {
    fontSize: 16,
    color: "#111827",
  },
});
