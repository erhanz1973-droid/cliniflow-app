// app/admin/create-treatment-group.tsx
// Admin Treatment Group Creation Page

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";

interface Doctor {
  id: string;
  name: string;
  department: string;
}

export default function CreateTreatmentGroupScreen() {
  const router = useRouter();
  const { patientId } = useLocalSearchParams();
  const { user, isAuthReady } = useAuth();
  
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fetchingDoctors, setFetchingDoctors] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("");
  const [selectedDoctors, setSelectedDoctors] = useState<string[]>([]);
  const [primaryDoctorId, setPrimaryDoctorId] = useState<string>("");

  useEffect(() => {
    if (!isAuthReady || !user) {
      router.replace("/admin-login");
      return;
    }

    if (user.role !== "ADMIN") {
      router.replace("/login");
      return;
    }

    if (!patientId) {
      Alert.alert("Hata", "Patient ID bulunamadı");
      router.back();
      return;
    }

    loadDoctors();
  }, [isAuthReady, user, patientId]);

  const loadDoctors = async () => {
    try {
      setFetchingDoctors(true);
      const token = localStorage.getItem("admin_token");
      
      const response = await fetch(`${API_BASE}/api/admin/doctors`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error("Doktorlar yüklenemedi");
      }

      const data = await response.json();
      if (data.ok) {
        setDoctors(data.doctors || []);
      } else {
        throw new Error(data.error || "Doktorlar yüklenemedi");
      }
    } catch (error) {
      console.error("Load doctors error:", error);
      Alert.alert("Hata", "Doktorlar yüklenemedi");
    } finally {
      setFetchingDoctors(false);
    }
  };

  const toggleDoctorSelection = (doctorId: string) => {
    setSelectedDoctors(prev => {
      if (prev.includes(doctorId)) {
        // Remove from selection
        const newSelection = prev.filter(id => id !== doctorId);
        // If removed doctor was primary, clear primary selection
        if (primaryDoctorId === doctorId) {
          setPrimaryDoctorId("");
        }
        return newSelection;
      } else {
        // Add to selection
        const newSelection = [...prev, doctorId];
        // If this is the first selection, make it primary
        if (newSelection.length === 1) {
          setPrimaryDoctorId(doctorId);
        }
        return newSelection;
      }
    });
  };

  const setPrimaryDoctor = (doctorId: string) => {
    if (selectedDoctors.includes(doctorId)) {
      setPrimaryDoctorId(doctorId);
    }
  };

  const handleSubmit = async () => {
    // Prevent double submission
    if (isSubmitting) {
      return;
    }
    
    // Strong validation for doctor selection
    if (!selectedDoctorId || selectedDoctorId.trim() === '') {
      Alert.alert("Hata", "Bir doktor seçmelisiniz. Tedavi grubu oluşturulamaz.");
      setIsSubmitting(false);
      return;
    }

    console.log("[CREATE GROUP] Submitting with:", {
      patientId,
      selectedDoctorId,
      doctorId: selectedDoctorId?.trim()
    });

    setIsSubmitting(true);
    
    try {
      setLoading(true);
      const token = localStorage.getItem("admin_token");

      const requestBody = {
        patient_id: patientId,
        doctor_id: selectedDoctorId.trim()
      };

      console.log("[CREATE GROUP] Request body:", requestBody);

      const response = await fetch(`${API_BASE}/api/admin/treatments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        Alert.alert("Başarılı", "Tedavi grubu başarıyla oluşturuldu");
        router.back();
      } else {
        console.error("[CREATE GROUP] API Error:", data);
        throw new Error(data.error || "Tedavi grubu oluşturulamadı");
      }
    } catch (error) {
      console.error("Create treatment group error:", error);
      Alert.alert("Hata", "Tedavi grubu oluşturulamadı");
    } finally {
      setLoading(false);
      setIsSubmitting(false);
    }
  };

  if (fetchingDoctors) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Doktorlar yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Tedavi Grubu Oluştur</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.formGroup}>
          <Text style={styles.label}>Doktor Seçimi</Text>
          <Text style={styles.subLabel}>
            Seçtiğiniz doktor için tedavi grubu oluşturulacaktır. Grup adı otomatik olarak belirlenecektir.
          </Text>
          
          {doctors.map((doctor) => (
            <View key={doctor.id} style={styles.doctorItem}>
              <TouchableOpacity
                style={styles.doctorRadio}
                onPress={() => setSelectedDoctorId(doctor.id)}
              >
                <View style={[
                  styles.checkbox,
                  selectedDoctorId === doctor.id && styles.checkboxChecked
                ]}>
                  {selectedDoctorId === doctor.id && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.doctorInfo}
                onPress={() => setSelectedDoctorId(doctor.id)}
              >
                <View style={styles.doctorDetails}>
                  <Text style={styles.doctorName}>{doctor.name}</Text>
                  <Text style={styles.doctorDepartment}>{doctor.department}</Text>
                  {selectedDoctorId === doctor.id && (
                    <View style={[
                      styles.primaryBadge,
                      styles.primaryBadgeSelected
                    ]}>
                      <Text style={[
                        styles.primaryBadgeText,
                        styles.primaryBadgeSelectedText
                      ]}>
                        Seçili Doktor
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <TouchableOpacity
          style={[
            styles.submitButton,
            (loading || isSubmitting) && styles.submitButtonDisabled
          ]}
          onPress={handleSubmit}
          disabled={loading || isSubmitting}
        >
          {loading || isSubmitting ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.submitButtonText}>Tedavi Grubu Oluştur</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: "#2563EB",
    fontWeight: "600",
  },
  placeholder: {
    width: 40,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
    textAlign: "center",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  formGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  subLabel: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 12,
  },
  input: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  note: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
    marginBottom: 8,
    fontStyle: "italic",
  },
  doctorRadio: {
    flex: 1,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 16,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  doctorCheckbox: {
    marginRight: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  checkmark: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  doctorInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  doctorDetails: {
    flex: 1,
  },
  doctorName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 2,
  },
  doctorDepartment: {
    fontSize: 14,
    color: "#6B7280",
  },
  primaryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#D1D5DB",
  },
  primaryBadgeSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  primaryBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  primaryBadgeSelectedText: {
    color: "#FFFFFF",
  },
  submitButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 24,
  },
  submitButtonDisabled: {
    backgroundColor: "#9CA3AF",
  },
  submitButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
  },
});
