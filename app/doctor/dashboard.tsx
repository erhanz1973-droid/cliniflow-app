// app/doctor/dashboard.tsx
// Doctor Dashboard – Role + Status Guarded

import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';

export default function DoctorDashboard() {
  const router = useRouter();
  const { user, isAuthReady } = useAuth(); // 🔥 FIX: Use isAuthReady instead of isAuthLoading

  // 🔐 ROLE + STATUS GUARD
  useEffect(() => {
    // 🔥 CLEAN SEPARATION: Type-based guard - PRIMARY routing key
    if (!isAuthReady) return; // Wait for auth to be ready
    
    if (!user || !user.token) {
      console.log("[Doctor Dashboard] No user or token, redirecting to login");
      router.replace("/");
      return;
    }
    
    if (user.type !== "doctor") {
      console.log("[Doctor Dashboard] User is not a doctor (type:", user.type, "), redirecting to login");
      router.replace("/");
      return;
    }
    
    // Check doctor status (only if type is doctor)
    if (user.status !== "APPROVED") {
      console.log("[Doctor Dashboard] Doctor not approved (status:", user.status, "), redirecting to pending");
      router.replace("/doctor/pending");
      return;
    }
    
    console.log("[Doctor Dashboard] Access granted for doctor:", user.doctorId);
  }, [user, isAuthReady, router]);

  if (isAuthReady && user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>👨‍⚕️ Ana Sayfa</Text>
        <Text style={styles.subtitle}>
          Hoş geldin{user.name ? `, Dr. ${user.name}` : ''}
        </Text>

        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>--</Text>
            <Text style={styles.statLabel}>Aktif Hasta</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>--</Text>
            <Text style={styles.statLabel}>Bugünkü Randevu</Text>
          </View>
        </View>

        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>Hızlı İşlemler</Text>
          
          <Pressable
            style={styles.quickAction}
            onPress={() => router.push('/doctor/patients')}
          >
            <Text style={styles.quickActionIcon}>👥</Text>
            <Text style={styles.quickActionText}>Hastalar</Text>
          </Pressable>

          <Pressable
            style={styles.quickAction}
            onPress={() => router.push('/doctor/diagnosis')}
          >
            <Text style={styles.quickActionIcon}>🦷</Text>
            <Text style={styles.quickActionText}>Tanı (ICD-10)</Text>
          </Pressable>
        </View>
      </View>
    );
  } else {
    return (
      <View style={styles.center}>
        <Text>Yükleniyor...</Text>
      </View>
    );
  }

  return null; // Remove duplicate return
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F9FAFB',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    color: '#6B7280',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    flex: 1,
    marginHorizontal: 5,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563EB',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  quickActions: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  quickAction: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quickActionIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  quickActionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
});
