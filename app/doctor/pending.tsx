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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
  },
  statusText: {
    fontSize: 14,
    color: "#2563eb",
    textAlign: "center",
    marginTop: 8,
    fontWeight: "600",
  },
  loadingText: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    marginTop: 16,
  },
  infoContainer: {
    backgroundColor: "#f0f9ff",
    borderWidth: 1,
    borderColor: "#3b82f6",
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1e40af",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: "#1e40af",
    lineHeight: 20,
  },
  actionsContainer: {
    width: "100%",
    maxWidth: 300,
  },
  refreshButton: {
    backgroundColor: "#2563eb",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginBottom: 12,
  },
  refreshButtonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  logoutButton: {
    backgroundColor: "transparent",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2563eb",
  },
  logoutButtonText: {
    color: "#2563eb",
    fontSize: 16,
    fontWeight: "600",
  },
  contactContainer: {
    alignItems: "center",
    marginTop: 24,
  },
  contactText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
});
