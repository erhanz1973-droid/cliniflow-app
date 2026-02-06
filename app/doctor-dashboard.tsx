// app/doctor-dashboard.tsx
// Doctor Dashboard - Role-based interface for doctors

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../lib/auth";
import { API_BASE } from "../lib/api";

interface DashboardStats {
  todayAppointments: number;
  pendingProcedures: number;
  waitingPatients: number;
  totalPatients: number;
}

interface TodayAppointment {
  id: string;
  patientName: string;
  time: string;
  procedure: string;
  status: "scheduled" | "in-progress" | "completed";
}

export default function DoctorDashboardScreen() {
  const router = useRouter();
  const { user, isAuthReady } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    todayAppointments: 0,
    pendingProcedures: 0,
    waitingPatients: 0,
    totalPatients: 0,
  });
  const [todayAppointments, setTodayAppointments] = useState<TodayAppointment[]>([]);

  useEffect(() => {
    if (!isAuthReady || !user) return;
    
    // Only doctors can access this screen
    if (user.role !== "DOCTOR") {
      router.replace("/home");
      return;
    }

    loadDashboardData();
  }, [isAuthReady, user, router]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load dashboard stats
      const statsResponse = await fetch(`${API_BASE}/api/doctor/dashboard/stats`, {
        headers: {
          Authorization: `Bearer ${user.token}`,
          Accept: "application/json",
        },
      });

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        if (statsData.ok) {
          setStats(statsData.stats);
        }
      }

      // Load today's appointments
      const appointmentsResponse = await fetch(`${API_BASE}/api/doctor/dashboard/appointments`, {
        headers: {
          Authorization: `Bearer ${user.token}`,
          Accept: "application/json",
        },
      });

      if (appointmentsResponse.ok) {
        const appointmentsData = await appointmentsResponse.json();
        if (appointmentsData.ok) {
          setTodayAppointments(appointmentsData.appointments);
        }
      }
    } catch (error) {
      console.error("[DOCTOR DASHBOARD] Error loading data:", error);
    } finally {
      setLoading(false);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "#10B981";
      case "in-progress": return "#F59E0B";
      case "scheduled": return "#2563EB";
      default: return "#6B7280";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed": return "Tamamlandı";
      case "in-progress": return "Devam Ediyor";
      case "scheduled": return "Planlandı";
      default: return "Bilinmiyor";
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>Doktor Paneli</Text>
        <Text style={styles.subtitle}>Hoş geldiniz, Dr. {user?.name}</Text>
      </View>

      {/* Stats Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.todayAppointments}</Text>
          <Text style={styles.statLabel}>Bugünkü Randevular</Text>
        </View>
        
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.pendingProcedures}</Text>
          <Text style={styles.statLabel}>Bekleyen İşlemler</Text>
        </View>
        
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.waitingPatients}</Text>
          <Text style={styles.statLabel}>Bekleyen Hastalar</Text>
        </View>
        
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{stats.totalPatients}</Text>
          <Text style={styles.statLabel}>Toplam Hasta</Text>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hızlı İşlemler</Text>
        
        <View style={styles.actionsGrid}>
          <Pressable 
            style={styles.actionButton}
            onPress={() => router.push("/patients")}
          >
            <Text style={styles.actionIcon}>👥</Text>
            <Text style={styles.actionText}>Hastalar</Text>
          </Pressable>
          
          <Pressable 
            style={styles.actionButton}
            onPress={() => router.push("/treatment-plans")}
          >
            <Text style={styles.actionIcon}>🦷</Text>
            <Text style={styles.actionText}>Tedavi Planları</Text>
          </Pressable>
          
          <Pressable 
            style={styles.actionButton}
            onPress={() => router.push("/calendar")}
          >
            <Text style={styles.actionIcon}>📅</Text>
            <Text style={styles.actionText}>Takvim</Text>
          </Pressable>
          
          <Pressable 
            style={styles.actionButton}
            onPress={() => router.push("/profile")}
          >
            <Text style={styles.actionIcon}>👤</Text>
            <Text style={styles.actionText}>Profil</Text>
          </Pressable>
        </View>
      </View>

      {/* Today's Appointments */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Bugünkü Randevular</Text>
          <Pressable onPress={() => router.push("/calendar")}>
            <Text style={styles.seeAllText}>Tümünü Gör</Text>
          </Pressable>
        </View>
        
        {todayAppointments.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Bugün randevu bulunmuyor</Text>
          </View>
        ) : (
          todayAppointments.map((appointment) => (
            <View key={appointment.id} style={styles.appointmentCard}>
              <View style={styles.appointmentHeader}>
                <Text style={styles.patientName}>{appointment.patientName}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(appointment.status) }]}>
                  <Text style={styles.statusText}>{getStatusText(appointment.status)}</Text>
                </View>
              </View>
              <View style={styles.appointmentDetails}>
                <Text style={styles.appointmentTime}>🕐 {appointment.time}</Text>
                <Text style={styles.appointmentProcedure}>🦷 {appointment.procedure}</Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: "#6B7280",
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
  },
  statsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  statCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  statNumber: {
    fontSize: 24,
    fontWeight: "700",
    color: "#2563EB",
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280",
    textAlign: "center",
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  seeAllText: {
    fontSize: 14,
    color: "#2563EB",
    fontWeight: "600",
  },
  actionsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  actionButton: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
  },
  emptyState: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  appointmentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  appointmentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  patientName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
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
  },
  appointmentTime: {
    fontSize: 14,
    color: "#6B7280",
  },
  appointmentProcedure: {
    fontSize: 14,
    color: "#6B7280",
  },
});
