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
    if (user.status !== "ACTIVE") {
      console.log("[Doctor Dashboard] Doctor not active (status:", user.status, "), redirecting to waiting approval");
      router.replace("/waiting-approval");
      return;
    }
    
    console.log("[Doctor Dashboard] Access granted for doctor:", user.doctorId);
  }, [user, isAuthReady, router]);

  if (isAuthReady && user) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>👨‍⚕️ Doktor Paneli</Text>
        <Text style={styles.subtitle}>
          Hoş geldin{user.name ? `, ${user.name}` : ''}
        </Text>

        <Pressable
          style={styles.button}
          onPress={() => router.push('/doctor/patients')}
        >
          <Text style={styles.buttonText}>👥 Hastalar</Text>
        </Pressable>

        <Pressable
          style={styles.button}
          onPress={() => router.push('/doctor/diagnosis')}
        >
          <Text style={styles.buttonText}>🦷 Tanı (ICD-10)</Text>
        </Pressable>

        <Pressable
          style={styles.buttonSecondary}
          onPress={() => router.push('/doctor/profile')}
        >
          <Text style={styles.buttonSecondaryText}>👤 Profil</Text>
        </Pressable>
      </View>
    );
  } else {
    return (
      <View style={styles.center}>
        <Text>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>👨‍⚕️ Doktor Paneli</Text>
      <Text style={styles.subtitle}>
        Hoş geldin{user.name ? `, ${user.name}` : ''}
      </Text>

      <Pressable
        style={styles.button}
        onPress={() => router.push('/doctor/patients')}
      >
        <Text style={styles.buttonText}>👥 Hastalar</Text>
      </Pressable>

      <Pressable
        style={styles.button}
        onPress={() => router.push('/doctor/diagnosis')}
      >
        <Text style={styles.buttonText}>🦷 Tanı (ICD-10)</Text>
      </Pressable>

      <Pressable
        style={styles.buttonSecondary}
        onPress={() => router.push('/doctor/profile')}
      >
        <Text style={styles.buttonSecondaryText}>👤 Profil</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
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
  button: {
    backgroundColor: '#2563EB',
    padding: 20,
    borderRadius: 10,
    marginBottom: 15,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonSecondary: {
    backgroundColor: '#E5E7EB',
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonSecondaryText: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '600',
  },
});
