// app/doctor/pending.tsx
// DOCTOR PENDING SCREEN - NO TABS
import React from "react";
import { View, Text, StyleSheet, Image, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";

export default function DoctorPendingScreen() {
  const router = useRouter();

  const handleRefresh = () => {
    // Refresh the page to check status
    router.replace("/doctor-login");
  };

  return (
    <View style={styles.container}>
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
    marginBottom: 40,
  },
  logo: {
    width: 120,
    height: 40,
  },
  statusContainer: {
    alignItems: "center",
    marginBottom: 40,
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
