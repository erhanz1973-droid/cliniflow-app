// app/patients.tsx
// Patients List - Doctor can view and manage all patients

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
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";

interface Patient {
  id: string;
  patientId: string;
  name: string;
  phone: string;
  email?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: number;
  lastVisit?: string;
  nextAppointment?: string;
}

export default function PatientsScreen() {
  const router = useRouter();
  const { user, isAuthReady } = useAuth();
  const [loading, setLoading] = useState(true);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredPatients, setFilteredPatients] = useState<Patient[]>([]);

  useEffect(() => {
    if (!isAuthReady || !user) return;
    
    // Only doctors can access this screen
    if (user.role !== "DOCTOR") {
      router.replace("/home");
      return;
    }

    loadPatients();
  }, [isAuthReady, user, router]);

  useEffect(() => {
    // Filter patients based on search query
    if (searchQuery.trim() === "") {
      setFilteredPatients(patients);
    } else {
      const filtered = patients.filter(
        (patient) =>
          patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          patient.patientId.toLowerCase().includes(searchQuery.toLowerCase()) ||
          patient.phone.includes(searchQuery)
      );
      setFilteredPatients(filtered);
    }
  }, [searchQuery, patients]);

  const loadPatients = async () => {
    try {
      setLoading(true);
      
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
        } else {
          Alert.alert("Hata", data.message || "Hastalar yüklenemedi");
        }
      } else {
        Alert.alert("Hata", "Hastalar yüklenemedi");
      }
    } catch (error) {
      console.error("[PATIENTS] Error loading patients:", error);
      Alert.alert("Hata", "Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  };

  const handlePatientPress = (patient: Patient) => {
    router.push({
      pathname: "/doctor-treatment",
      params: {
        patientId: patient.patientId,
        patientName: patient.name,
      },
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "APPROVED": return "#10B981";
      case "PENDING": return "#F59E0B";
      case "REJECTED": return "#EF4444";
      default: return "#6B7280";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "APPROVED": return "Onaylı";
      case "PENDING": return "Beklemede";
      case "REJECTED": return "Reddedildi";
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
        <Text style={styles.title}>Hastalar</Text>
        <Pressable 
          style={styles.addButton}
          onPress={() => router.push("/add-patient")}
        >
          <Text style={styles.addButtonText}>+ Hasta Ekle</Text>
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Hasta ara..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#9CA3AF"
        />
      </View>

      {/* Patients List */}
      <ScrollView style={styles.listContainer} contentContainerStyle={styles.listContent}>
        {filteredPatients.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyText}>
              {searchQuery ? "Hasta bulunamadı" : "Henüz hasta kaydı yok"}
            </Text>
            {!searchQuery && (
              <Pressable 
                style={styles.emptyButton}
                onPress={() => router.push("/add-patient")}
              >
                <Text style={styles.emptyButtonText}>İlk Hasta Ekle</Text>
              </Pressable>
            )}
          </View>
        ) : (
          filteredPatients.map((patient) => (
            <Pressable
              key={patient.id}
              style={styles.patientCard}
              onPress={() => handlePatientPress(patient)}
            >
              <View style={styles.patientHeader}>
                <View style={styles.patientInfo}>
                  <Text style={styles.patientName}>{patient.name}</Text>
                  <Text style={styles.patientId}>{patient.patientId}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(patient.status) }]}>
                  <Text style={styles.statusText}>{getStatusText(patient.status)}</Text>
                </View>
              </View>
              
              <View style={styles.patientDetails}>
                <Text style={styles.patientPhone}>📱 {patient.phone}</Text>
                {patient.email && (
                  <Text style={styles.patientEmail}>✉️ {patient.email}</Text>
                )}
                <Text style={styles.patientDate}>
                  📅 Kayıt: {new Date(patient.createdAt).toLocaleDateString("tr-TR")}
                </Text>
                {patient.nextAppointment && (
                  <Text style={styles.nextAppointment}>
                    🕐 Sonraki Randevu: {patient.nextAppointment}
                  </Text>
                )}
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
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
  searchContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  searchInput: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
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
  patientCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  patientHeader: {
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
  patientDetails: {
    gap: 4,
  },
  patientPhone: {
    fontSize: 14,
    color: "#6B7280",
  },
  patientEmail: {
    fontSize: 14,
    color: "#6B7280",
  },
  patientDate: {
    fontSize: 14,
    color: "#6B7280",
  },
  nextAppointment: {
    fontSize: 14,
    color: "#2563EB",
    fontWeight: "600",
  },
});
