// app/doctor/dashboard.tsx - Test doktor dashboard
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';

export default function DoctorDashboard() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>👨‍⚕️ Doktor Paneli</Text>
      <Text style={styles.subtitle}>Hoş geldin, Doktor</Text>
      
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
        <Text style={styles.buttonText}>🦷 Tanı</Text>
      </Pressable>
      
      <Pressable 
        style={styles.button} 
        onPress={() => router.push('/doctor/profile')}
      >
        <Text style={styles.buttonText}>👤 Profil</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#F9FAFB' },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 16, textAlign: 'center', marginBottom: 30, color: '#6B7280' },
  button: { backgroundColor: '#2563EB', padding: 20, borderRadius: 8, marginBottom: 15 },
  buttonText: { color: '#FFFFFF', fontSize: 18, fontWeight: '600' },
});
