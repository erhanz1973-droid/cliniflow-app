// app/calendar.tsx
// Calendar - Doctor can view and manage appointments

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";

interface Appointment {
  id: string;
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  procedure: string;
  status: "scheduled" | "in-progress" | "completed" | "cancelled";
}

export default function CalendarScreen() {
  const router = useRouter();
  const { user, isAuthReady, isDoctor, isPatient } = useAuth();
  const [loading, setLoading] = useState(true);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Role-based redirect
  useEffect(() => {
    if (!isAuthReady) return;
    
    // Only doctors can access this screen
    if (!isDoctor) {
      if (isPatient) {
        router.replace("/home");
      } else {
        router.replace("/login");
      }
      return;
    }
  }, [isAuthReady, isDoctor, isPatient, router]);

  useEffect(() => {
    if (!isAuthReady || !isDoctor) return;
    loadAppointments();
  }, [isAuthReady, isDoctor, selectedDate]);

  const loadAppointments = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_BASE}/api/doctor/calendar?date=${selectedDate}`, {
        headers: {
          Authorization: `Bearer ${user?.token}`,
          Accept: "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.ok) {
          setAppointments(data.appointments || []);
        } else {
          Alert.alert("Hata", data.message || "Randevular yüklenemedi");
        }
      } else {
        Alert.alert("Hata", "Randevular yüklenemedi");
      }
    } catch (error) {
      console.error("[CALENDAR] Error loading appointments:", error);
      Alert.alert("Hata", "Bağlantı hatası");
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "#10B981";
      case "in-progress": return "#F59E0B";
      case "scheduled": return "#2563EB";
      case "cancelled": return "#EF4444";
      default: return "#6B7280";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed": return "Tamamlandı";
      case "in-progress": return "Devam Ediyor";
      case "scheduled": return "Planlandı";
      case "cancelled": return "İptal Edildi";
      default: return "Bilinmiyor";
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("tr-TR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const formatTime = (timeString: string) => {
    // Format time from HH:MM to more readable format
    const [hours, minutes] = timeString.split(":");
    return `${hours}:${minutes}`;
  };

  if (!isAuthReady) {
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
        <Text style={styles.title}>Takvim</Text>
        <Pressable 
          style={styles.addButton}
          onPress={() => router.push("/add-appointment")}
        >
          <Text style={styles.addButtonText}>+ Randevu Ekle</Text>
        </Pressable>
      </View>

      {/* Date Selector */}
      <View style={styles.dateSelector}>
        <Pressable 
          style={styles.dateButton}
          onPress={() => {
            // Simple date picker - for now just show current date
            // In a real app, you'd use a proper date picker
            const newDate = new Date(selectedDate);
            newDate.setDate(newDate.getDate() - 1);
            setSelectedDate(newDate.toISOString().split('T')[0]);
          }}
        >
          <Text style={styles.dateButtonText}>← Önceki Gün</Text>
        </Pressable>
        
        <View style={styles.currentDate}>
          <Text style={styles.currentDateText}>{formatDate(selectedDate)}</Text>
        </View>
        
        <Pressable 
          style={styles.dateButton}
          onPress={() => {
            const newDate = new Date(selectedDate);
            newDate.setDate(newDate.getDate() + 1);
            setSelectedDate(newDate.toISOString().split('T')[0]);
          }}
        >
          <Text style={styles.dateButtonText}>Sonraki Gün →</Text>
        </Pressable>
      </View>

      {/* Appointments List */}
      <ScrollView style={styles.listContainer} contentContainerStyle={styles.listContent}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.loadingText}>Yükleniyor...</Text>
          </View>
        ) : appointments.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyText}>
              {formatDate(selectedDate)} için randevu bulunmuyor
            </Text>
            <Pressable 
              style={styles.emptyButton}
              onPress={() => router.push("/add-appointment")}
            >
              <Text style={styles.emptyButtonText}>İlk Randevuyu Ekle</Text>
            </Pressable>
          </View>
        ) : (
          appointments.map((appointment) => (
            <View key={appointment.id} style={styles.appointmentCard}>
              <View style={styles.appointmentHeader}>
                <View style={styles.appointmentInfo}>
                  <Text style={styles.patientName}>{appointment.patientName}</Text>
                  <Text style={styles.appointmentTime}>🕐 {formatTime(appointment.time)}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(appointment.status) }]}>
                  <Text style={styles.statusText}>{getStatusText(appointment.status)}</Text>
                </View>
              </View>
              
              <View style={styles.appointmentDetails}>
                <Text style={styles.procedure}>🦷 {appointment.procedure}</Text>
                <Text style={styles.appointmentId}>ID: {appointment.patientId}</Text>
              </View>

              <View style={styles.actionButtons}>
                {appointment.status === "scheduled" && (
                  <Pressable
                    style={[styles.actionButton, styles.startButton]}
                    onPress={() => {
                      // TODO: Start appointment
                    }}
                  >
                    <Text style={styles.actionButtonText}>Başlat</Text>
                  </Pressable>
                )}
                {appointment.status === "in-progress" && (
                  <Pressable
                    style={[styles.actionButton, styles.completeButton]}
                    onPress={() => {
                      // TODO: Complete appointment
                    }}
                  >
                    <Text style={styles.actionButtonText}>Tamamla</Text>
                  </Pressable>
                )}
                {(appointment.status === "scheduled" || appointment.status === "in-progress") && (
                  <Pressable
                    style={[styles.actionButton, styles.cancelButton]}
                    onPress={() => {
                      // TODO: Cancel appointment
                    }}
                  >
                    <Text style={styles.actionButtonText}>İptal</Text>
                  </Pressable>
                )}
              </View>
            </View>
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
  dateSelector: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  dateButton: {
    padding: 8,
  },
  dateButtonText: {
    fontSize: 16,
    color: "#2563EB",
    fontWeight: "600",
  },
  currentDate: {
    flex: 1,
    alignItems: "center",
  },
  currentDateText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    padding: 20,
  },
  loadingContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
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
  appointmentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  appointmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  appointmentInfo: {
    flex: 1,
  },
  patientName: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  appointmentTime: {
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
  appointmentDetails: {
    gap: 4,
    marginBottom: 16,
  },
  procedure: {
    fontSize: 14,
    color: "#374151",
  },
  appointmentId: {
    fontSize: 12,
    color: "#6B7280",
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
});
