// app/doctor-treatment.tsx
// Doctor Treatment Screen - Role-based treatment management

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
  date?: string;
  price?: number;
  notes?: string;
}

interface PatientInfo {
  id: string;
  patientId: string;
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
  notes?: string;
  quality: "good" | "poor" | "repeat_needed";
  linkedTooth?: string;
}

export default function DoctorTreatmentScreen() {
  const router = useRouter();
  const { patientId } = useLocalSearchParams();
  const { user, isAuthReady, isDoctor, isPatient } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [patientInfo, setPatientInfo] = useState<PatientInfo | null>(null);
  const [teeth, setTeeth] = useState<Tooth[]>([]);
  const [selectedTooth, setSelectedTooth] = useState<Tooth | null>(null);
  const [treatmentRecords, setTreatmentRecords] = useState<TreatmentRecord[]>([]);
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [showToothModal, setShowToothModal] = useState(false);
  const [showICDModal, setShowICDModal] = useState(false);
  const [showProcedureModal, setShowProcedureModal] = useState(false);
  const [editingTooth, setEditingTooth] = useState<Tooth | null>(null);

  // Role-based redirect
  useEffect(() => {
    if (!isAuthReady) return;
    
    // Only doctors can access this screen
    if (!isDoctor) {
      if (isPatient) {
        router.replace(`/treatments?patientId=${patientId}`);
      } else {
        router.replace("/login");
      }
      return;
    }
  }, [isAuthReady, isDoctor, isPatient, router, patientId]);

  useEffect(() => {
    if (!isAuthReady || !isDoctor || !patientId) return;
    loadTreatmentData();
  }, [isAuthReady, isDoctor, patientId]);

  const loadTreatmentData = async () => {
    try {
      setLoading(true);
      
      // Load patient info
      const patientResponse = await fetch(`${API_BASE}/api/doctor/patient/${patientId}`, {
        headers: {
          Authorization: `Bearer ${user?.token}`,
          Accept: "application/json",
        },
      });

      if (patientResponse.ok) {
        const patientData = await patientResponse.json();
        if (patientData.ok) {
          setPatientInfo(patientData.patient);
        }
      }

      // Load teeth data
      const teethResponse = await fetch(`${API_BASE}/api/doctor/treatment/${patientId}/teeth`, {
        headers: {
          Authorization: `Bearer ${user?.token}`,
          Accept: "application/json",
        },
      });

      if (teethResponse.ok) {
        const teethData = await teethResponse.json();
        if (teethData.ok) {
          setTeeth(teethData.teeth || []);
        }
      }

      // Load treatment records
      const recordsResponse = await fetch(`${API_BASE}/api/doctor/treatment/${patientId}/records`, {
        headers: {
          Authorization: `Bearer ${user?.token}`,
          Accept: "application/json",
        },
      });

      if (recordsResponse.ok) {
        const recordsData = await recordsResponse.json();
        if (recordsData.ok) {
          setTreatmentRecords(recordsData.records || []);
        }
      }

      // Load photos
      const photosResponse = await fetch(`${API_BASE}/api/doctor/treatment/${patientId}/photos`, {
        headers: {
          Authorization: `Bearer ${user?.token}`,
          Accept: "application/json",
        },
      });

      if (photosResponse.ok) {
        const photosData = await photosResponse.json();
        if (photosData.ok) {
          setPhotos(photosData.photos || []);
        }
      }
    } catch (error) {
      console.error("[DOCTOR TREATMENT] Error loading data:", error);
      Alert.alert("Hata", "Veriler yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const handleToothPress = (tooth: Tooth) => {
    setSelectedTooth(tooth);
    setEditingTooth(tooth);
    setShowToothModal(true);
  };

  const handleAddDiagnosis = (tooth: Tooth) => {
    setSelectedTooth(tooth);
    setShowICDModal(true);
  };

  const handleAddProcedure = (tooth: Tooth) => {
    setSelectedTooth(tooth);
    setShowProcedureModal(true);
  };

  const handleCompleteProcedure = async (procedureId: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/doctor/treatment/procedure/${procedureId}/complete`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${user?.token}`,
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          Alert.alert("Başarılı", "İşlem tamamlandı olarak işaretlendi.");
          loadTreatmentData();
        } else {
          Alert.alert("Hata", data.message || "İşlem tamamlanamadı");
        }
      } else {
        Alert.alert("Hata", "İşlem tamamlanamadı");
      }
    } catch (error) {
      console.error("[DOCTOR TREATMENT] Error completing procedure:", error);
      Alert.alert("Hata", "Bağlantı hatası");
    }
  };

  const getToothColor = (status: string) => {
    switch (status) {
      case "COMPLETED": return "#10B981";
      case "IN_PROGRESS": return "#F59E0B";
      case "PLANNED": return "#EF4444";
      case "EMPTY": return "#E5E7EB";
      default: return "#E5E7EB";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "COMPLETED": return "Tamamlandı";
      case "IN_PROGRESS": return "Devam Ediyor";
      case "PLANNED": return "Planlandı";
      case "EMPTY": return "Boş";
      default: return "Bilinmiyor";
    }
  };

  const renderToothMap = () => {
    // FDI numbering: 11-18 (upper right), 21-28 (upper left), 31-38 (lower left), 41-48 (lower right)
    const upperRight = Array.from({length: 8}, (_, i) => 18 - i); // 18, 17, 16, 15, 14, 13, 12, 11
    const upperLeft = Array.from({length: 8}, (_, i) => 21 + i); // 21, 22, 23, 24, 25, 26, 27, 28
    const lowerLeft = Array.from({length: 8}, (_, i) => 38 - i); // 38, 37, 36, 35, 34, 33, 32, 31
    const lowerRight = Array.from({length: 8}, (_, i) => 41 + i); // 41, 42, 43, 44, 45, 46, 47, 48

    return (
      <View style={styles.toothMapContainer}>
        {/* Upper Jaw */}
        <View style={styles.jawRow}>
          <View style={styles.toothRow}>
            {upperRight.map((num) => {
              const tooth = teeth.find(t => t.fdiNumber === num.toString());
              return (
                <Pressable
                  key={num}
                  style={[styles.tooth, { backgroundColor: getToothColor(tooth?.status || "EMPTY") }]}
                  onPress={() => tooth && handleToothPress(tooth)}
                >
                  <Text style={styles.toothNumber}>{num}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.toothRow}>
            {upperLeft.map((num) => {
              const tooth = teeth.find(t => t.fdiNumber === num.toString());
              return (
                <Pressable
                  key={num}
                  style={[styles.tooth, { backgroundColor: getToothColor(tooth?.status || "EMPTY") }]}
                  onPress={() => tooth && handleToothPress(tooth)}
                >
                  <Text style={styles.toothNumber}>{num}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Lower Jaw */}
        <View style={styles.jawRow}>
          <View style={styles.toothRow}>
            {lowerLeft.map((num) => {
              const tooth = teeth.find(t => t.fdiNumber === num.toString());
              return (
                <Pressable
                  key={num}
                  style={[styles.tooth, { backgroundColor: getToothColor(tooth?.status || "EMPTY") }]}
                  onPress={() => tooth && handleToothPress(tooth)}
                >
                  <Text style={styles.toothNumber}>{num}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.toothRow}>
            {lowerRight.map((num) => {
              const tooth = teeth.find(t => t.fdiNumber === num.toString());
              return (
                <Pressable
                  key={num}
                  style={[styles.tooth, { backgroundColor: getToothColor(tooth?.status || "EMPTY") }]}
                  onPress={() => tooth && handleToothPress(tooth)}
                >
                  <Text style={styles.toothNumber}>{num}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  if (!isAuthReady) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Tedavi verileri yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Sticky Header - Patient Info */}
      <View style={styles.patientHeader}>
        <View style={styles.patientInfo}>
          <Text style={styles.patientName}>{patientInfo?.name}</Text>
          <View style={styles.patientStatus}>
            <Text style={styles.statusText}>Durum: </Text>
            <Text style={[styles.statusValue, { color: patientInfo?.status === "Active" ? "#10B981" : "#6B7280" }]}>
              {patientInfo?.status === "Active" ? "Aktif" : "Tamamlandı"}
            </Text>
          </View>
          {patientInfo?.lastVisit && (
            <Text style={styles.lastVisit}>Son ziyaret: {new Date(patientInfo.lastVisit).toLocaleDateString("tr-TR")}</Text>
          )}
        </View>
        
        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Pressable style={styles.quickActionButton}>
            <Ionicons name="checkmark-circle" size={20} color="#10B981" />
            <Text style={styles.quickActionText}>İşlem Tamamla</Text>
          </Pressable>
          <Pressable style={styles.quickActionButton}>
            <Ionicons name="calendar" size={20} color="#2563EB" />
            <Text style={styles.quickActionText}>Randevu</Text>
          </Pressable>
          <Pressable style={styles.quickActionButton}>
            <Ionicons name="cash" size={20} color="#F59E0B" />
            <Text style={styles.quickActionText}>Fiyat</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Tooth Map */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Diş Haritası</Text>
          {renderToothMap()}
          
          {/* Legend */}
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: "#EF4444" }]} />
              <Text style={styles.legendText}>Problem/Tanı</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: "#F59E0B" }]} />
              <Text style={styles.legendText}>Planlandı</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: "#10B981" }]} />
              <Text style={styles.legendText}>Uygulandı</Text>
            </View>
          </View>
        </View>

        {/* Selected Tooth Details */}
        {selectedTooth && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Diş #{selectedTooth.fdiNumber} Detayları</Text>
            
            <View style={styles.toothDetails}>
              <Text style={styles.detailLabel}>Durum:</Text>
              <Text style={styles.detailValue}>{getStatusText(selectedTooth.status)}</Text>
              
              {selectedTooth.diagnosis && selectedTooth.diagnosis.length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Tanılar:</Text>
                  {selectedTooth.diagnosis.map((diag, index) => (
                    <Text key={index} style={styles.detailValue}>• {diag}</Text>
                  ))}
                </View>
              )}
              
              {selectedTooth.procedures && selectedTooth.procedures.length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>İşlemler:</Text>
                  {selectedTooth.procedures.map((proc, index) => (
                    <View key={proc.id} style={styles.procedureItem}>
                      <Text style={styles.detailValue}>• {proc.type}</Text>
                      <Text style={styles.procedureStatus}>{getStatusText(proc.status)}</Text>
                      {isDoctor && proc.status !== "COMPLETED" && (
                        <Pressable
                          style={styles.completeButton}
                          onPress={() => handleCompleteProcedure(proc.id)}
                        >
                          <Text style={styles.completeButtonText}>✓</Text>
                        </Pressable>
                      )}
                    </View>
                  ))}
                </View>
              )}
              
              {selectedTooth.notes && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Notlar:</Text>
                  <Text style={styles.detailValue}>{selectedTooth.notes}</Text>
                </View>
              )}
              
              {selectedTooth.price && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailLabel}>Fiyat:</Text>
                  <Text style={styles.detailValue}>₺{selectedTooth.price}</Text>
                </View>
              )}
            </View>
            
            {/* Doctor Actions */}
            {isDoctor && (
              <View style={styles.doctorActions}>
                <Pressable
                  style={styles.actionButton}
                  onPress={() => handleAddDiagnosis(selectedTooth)}
                >
                  <Ionicons name="add-circle" size={20} color="#2563EB" />
                  <Text style={styles.actionButtonText}>ICD-10 Tanı Ekle</Text>
                </Pressable>
                <Pressable
                  style={styles.actionButton}
                  onPress={() => handleAddProcedure(selectedTooth)}
                >
                  <Ionicons name="medical" size={20} color="#2563EB" />
                  <Text style={styles.actionButtonText}>İşlem Ekle</Text>
                </Pressable>
                <Pressable
                  style={styles.actionButton}
                  onPress={() => setShowToothModal(true)}
                >
                  <Ionicons name="create" size={20} color="#2563EB" />
                  <Text style={styles.actionButtonText}>Düzenle</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Treatment Timeline */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tedavi Geçmişi</Text>
          {treatmentRecords.length === 0 ? (
            <Text style={styles.emptyText}>Henüz tedavi kaydı yok</Text>
          ) : (
            treatmentRecords.map((record) => (
              <View key={record.id} style={styles.timelineItem}>
                <Text style={styles.timelineDate}>
                  {new Date(record.date).toLocaleDateString("tr-TR")}
                </Text>
                <Text style={styles.timelineTooth}>Diş #{record.tooth}</Text>
                <Text style={styles.timelineProcedure}>{record.procedure}</Text>
                <Text style={[styles.timelineStatus, { color: getToothColor(record.status) }]}>
                  {getStatusText(record.status)}
                </Text>
                {record.doctorName && (
                  <Text style={styles.timelineDoctor}>Dr. {record.doctorName}</Text>
                )}
              </View>
            ))
          )}
        </View>

        {/* Photos & Documents */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fotoğraflar & Belgeler</Text>
          {photos.length === 0 ? (
            <Text style={styles.emptyText}>Henüz fotoğraf belge yok</Text>
          ) : (
            photos.map((photo) => (
              <View key={photo.id} style={styles.photoItem}>
                <View style={styles.photoInfo}>
                  <Text style={styles.photoType}>{photo.type}</Text>
                  <Text style={styles.photoDate}>
                    {new Date(photo.date).toLocaleDateString("tr-TR")}
                  </Text>
                  {photo.linkedTooth && (
                    <Text style={styles.photoTooth}>Diş #{photo.linkedTooth}</Text>
                  )}
                </View>
                <View style={styles.photoActions}>
                  <View style={[styles.qualityBadge, { 
                    backgroundColor: photo.quality === "good" ? "#10B981" : 
                                     photo.quality === "poor" ? "#F59E0B" : "#EF4444" 
                  }]}>
                    <Text style={styles.qualityText}>
                      {photo.quality === "good" ? "İyi" : 
                       photo.quality === "poor" ? "Yetersiz" : "Tekrar Çek"}
                    </Text>
                  </View>
                  {isDoctor && (
                    <Pressable style={styles.photoAction}>
                      <Ionicons name="attach" size={16} color="#2563EB" />
                    </Pressable>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* Tooth Detail Modal */}
      <Modal
        visible={showToothModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowToothModal(false)}>
              <Text style={styles.cancelText}>İptal</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Diş #{editingTooth?.fdiNumber}</Text>
            <Pressable onPress={() => setShowToothModal(false)}>
              <Text style={styles.saveText}>Kaydet</Text>
            </Pressable>
          </View>
          
          <ScrollView style={styles.modalContent}>
            <Text style={styles.label}>Durum</Text>
            <Pressable style={styles.selectButton}>
              <Text style={styles.selectText}>{getStatusText(editingTooth?.status || "EMPTY")}</Text>
            </Pressable>

            <Text style={styles.label}>Notlar</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Diş hakkında notlar..."
              value={editingTooth?.notes || ""}
              onChangeText={(text) => setEditingTooth(editingTooth ? {...editingTooth, notes: text} : null)}
              multiline
              numberOfLines={4}
            />

            <Text style={styles.label}>Fiyat</Text>
            <TextInput
              style={styles.input}
              placeholder="₺0"
              value={editingTooth?.price?.toString() || ""}
              onChangeText={(text) => setEditingTooth(editingTooth ? {...editingTooth, price: parseFloat(text) || 0} : null)}
              keyboardType="numeric"
            />

            <Text style={styles.label}>Planlanan Tarih</Text>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              value={editingTooth?.plannedDate || ""}
              onChangeText={(text) => setEditingTooth(editingTooth ? {...editingTooth, plannedDate: text} : null)}
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
  patientHeader: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    padding: 16,
  },
  patientInfo: {
    marginBottom: 12,
  },
  patientName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  patientStatus: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  statusText: {
    fontSize: 14,
    color: "#6B7280",
  },
  statusValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  lastVisit: {
    fontSize: 12,
    color: "#6B7280",
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  quickActionButton: {
    alignItems: "center",
    padding: 8,
  },
  quickActionText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  toothMapContainer: {
    marginBottom: 16,
  },
  jawRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  toothRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    flex: 1,
  },
  tooth: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 2,
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  toothNumber: {
    fontSize: 10,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  legend: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 2,
    marginRight: 4,
  },
  legendText: {
    fontSize: 12,
    color: "#6B7280",
  },
  toothDetails: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 8,
  },
  detailSection: {
    marginBottom: 12,
  },
  procedureItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  procedureStatus: {
    fontSize: 12,
    color: "#6B7280",
  },
  completeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#10B981",
    alignItems: "center",
    justifyContent: "center",
  },
  completeButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
  },
  doctorActions: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
  },
  actionButtonText: {
    fontSize: 12,
    color: "#2563EB",
    marginLeft: 4,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    paddingVertical: 20,
  },
  timelineItem: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  timelineDate: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 2,
  },
  timelineTooth: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  timelineProcedure: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 2,
  },
  timelineStatus: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 2,
  },
  timelineDoctor: {
    fontSize: 12,
    color: "#6B7280",
  },
  photoItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  photoInfo: {
    flex: 1,
  },
  photoType: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  photoDate: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 2,
  },
  photoTooth: {
    fontSize: 12,
    color: "#2563EB",
  },
  photoActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  qualityBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  qualityText: {
    fontSize: 10,
    color: "#FFFFFF",
    fontWeight: "600",
  },
  photoAction: {
    padding: 4,
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
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    backgroundColor: "#FFFFFF",
    height: 100,
    textAlignVertical: "top",
    marginBottom: 16,
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
