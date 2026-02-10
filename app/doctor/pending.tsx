// app/doctor/pending.tsx
// DOCTOR PENDING SCREEN - NO TABS
import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Image, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";
import { useAuth } from "../../lib/auth";
import { getCurrentDoctorProfile } from "../../lib/doctor/api";

export default function DoctorPendingScreen() {
  const router = useRouter();
  const { isAuthed } = useAuth();
  const [doctorStatus, setDoctorStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Check doctor status periodically
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const profileResponse = await getCurrentDoctorProfile();
        if (profileResponse.ok && profileResponse.doctor) {
          const status = profileResponse.doctor.status;
          setDoctorStatus(status);
          
          // If approved, redirect to dashboard
          if (status === "APPROVED" || status === "ACTIVE") {
            console.log("[DOCTOR PENDING] Status approved, redirecting to dashboard");
            router.replace("/doctor/dashboard");
            return;
          }
        }
      } catch (error) {
        console.error("[DOCTOR PENDING] Status check error:", error);
      } finally {
        setLoading(false);
      }
    };

    // Check immediately
    checkStatus();
    
    // Check every 30 seconds
    const interval = setInterval(checkStatus, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    router.replace("/doctor-login");
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.content}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Durum kontrol ediliyor...</Text>
        </View>
      ) : (
        <View style={styles.content}>
          <View style={styles.iconContainer}>
            <Image 
              source={require('../../assets/images/icon.png')} 
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          
          <View style={styles.statusContainer}>
            <View style={styles.pendingIcon}>
              <Text style={styles.pendingEmoji}>⏳</Text>
            </View>
            
            <Text style={styles.title}>Başvurunuz Değerlendiriliyor</Text>
            <Text style={styles.subtitle}>
              Doktor başvurunuz incelenmektedir. Onaylandığında bildirim alacaksınız.
            </Text>
            {doctorStatus && (
              <Text style={styles.statusText}>Mevcut Durum: {doctorStatus}</Text>
            )}
          </View>

        <View style={styles.infoContainer}>
          <Text style={styles.infoTitle}>Ne zaman onaylanır?</Text>
          <Text style={styles.infoText}>
            Başvurularınız genellikle 24-48 saat içinde incelenir ve onaylanır.
          </Text>
        </View>

        <View style={styles.actionsContainer}>
          <Pressable style={styles.refreshButton} onPress={handleRefresh}>
            <Text style={styles.refreshButtonText}>Durumu Kontrol Et</Text>
          </Pressable>
          
          <Pressable 
            style={styles.logoutButton} 
            onPress={() => router.replace("/doctor-login")}
          >
            <Text style={styles.logoutButtonText}>Çıkış Yap</Text>
          </Pressable>
        </View>

        <View style={styles.contactContainer}>
          <Text style={styles.contactText}>
            Sorularınız için: support@cliniflow.com
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f6f7f9",
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 24,
  },
  logo: {
    width: 180,
    height: 60,
  },
  statusContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  pendingIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#fef3c7",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  pendingEmoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 300,
  },
  infoContainer: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 20,
    marginBottom: 40,
    width: "100%",
    maxWidth: 350,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#6b7280",
    lineHeight: 20,
  },
  actionsContainer: {
    width: "100%",
    maxWidth: 350,
    gap: 12,
  },
  refreshButton: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
  },
  refreshButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  logoutButton: {
    backgroundColor: "transparent",
    borderRadius: 10,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  logoutButtonText: {
    color: "#6b7280",
    fontSize: 16,
    fontWeight: "600",
  },
  contactContainer: {
    marginTop: 40,
    alignItems: "center",
  },
  contactText: {
    fontSize: 14,
    color: "#9ca3af",
  },
});
