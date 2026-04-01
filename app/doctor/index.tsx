// app/doctor/index.tsx — canonical doctor dashboard (route: /doctor)
import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, TouchableOpacity, Alert, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';

export default function DoctorDashboard() {
  const router = useRouter();
  const { user, isAuthReady, isInitialized, signOut } = useAuth();
  const [selectedLanguage, setSelectedLanguage] = useState('tr');

  useEffect(() => {
    if (!isInitialized || !isAuthReady) return;
    if (!user?.token) { router.replace('/'); return; }
    if (user.type !== 'doctor') { router.replace('/'); return; }
    console.log('[Doctor Dashboard] Access granted:', user.doctorId);
  }, [user, isAuthReady, isInitialized, router]);

  if (!isInitialized || !isAuthReady || !user) {
    return (
      <SafeAreaView style={styles.center}>
        <Text>Yükleniyor...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>👨‍⚕️ Doktor Paneli</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.langBtn}
            onPress={() =>
              Alert.alert('Dil Seçimi', 'Uygulama dilini seçin:', [
                { text: 'Türkçe', onPress: () => setSelectedLanguage('tr') },
                { text: 'English', onPress: () => setSelectedLanguage('en') },
                { text: 'İptal', style: 'cancel' },
              ])
            }
          >
            <Text style={styles.langBtnText}>{selectedLanguage === 'tr' ? '🇹🇷 TR' : '🇬🇧 EN'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={() =>
              Alert.alert('Çıkış Yap', 'Çıkış yapmak istediğinizden emin misiniz?', [
                { text: 'İptal', style: 'cancel' },
                { text: 'Çıkış Yap', onPress: () => { signOut(); router.replace('/'); } },
              ])
            }
          >
            <Text style={styles.logoutBtnText}>🚪 Çıkış</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Body */}
      <View style={styles.body}>
        <Text style={{ color: '#16a34a', fontWeight: '700', marginBottom: 8 }}>✅ REAL DOCTOR DASHBOARD</Text>
        <Text style={styles.title}>Ana Sayfa</Text>
        <Text style={styles.subtitle}>
          Hoş geldin{user.name ? `, Dr. ${user.name}` : ''}
        </Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>--</Text>
            <Text style={styles.statLabel}>Aktif Hasta</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNum}>--</Text>
            <Text style={styles.statLabel}>Bugünkü Randevu</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Hızlı İşlemler</Text>

        <Pressable style={styles.actionCard} onPress={() => router.push('/doctor/patients')}>
          <Text style={styles.actionIcon}>👥</Text>
          <Text style={styles.actionText}>Hastalar</Text>
        </Pressable>

        <Pressable style={styles.actionCard} onPress={() => router.push('/treatment')}>
          <Text style={styles.actionIcon}>🦷</Text>
          <Text style={styles.actionText}>Tedavi Planlama</Text>
        </Pressable>
      </View>

      {/* Bottom Nav */}
      <View style={styles.bottomNav}>
        <Pressable style={[styles.navItem, styles.navItemActive]}>
          <Text style={styles.navIcon}>🏠</Text>
          <Text style={[styles.navLabel, styles.navLabelActive]}>Ana Sayfa</Text>
        </Pressable>
        <Pressable style={styles.navItem} onPress={() => router.push('/doctor/patients')}>
          <Text style={styles.navIcon}>👥</Text>
          <Text style={styles.navLabel}>Hastalar</Text>
        </Pressable>
        <Pressable style={styles.navItem} onPress={() => router.push('/doctor/profile')}>
          <Text style={styles.navIcon}>👤</Text>
          <Text style={styles.navLabel}>Profil</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  headerRight: { flexDirection: 'row', gap: 8 },
  langBtn: { backgroundColor: '#2563EB', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  langBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  logoutBtn: { backgroundColor: '#DC2626', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  logoutBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  body: { flex: 1, padding: 20 },
  title: { fontSize: 24, fontWeight: '700', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#6B7280', marginBottom: 24 },

  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 12, padding: 16,
    alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB',
  },
  statNum: { fontSize: 22, fontWeight: '700', color: '#2563EB', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#6B7280', textAlign: 'center' },

  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 12 },
  actionCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  actionIcon: { fontSize: 20, marginRight: 12 },
  actionText: { fontSize: 15, fontWeight: '500', color: '#111827' },

  bottomNav: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
    paddingBottom: 8, paddingTop: 8,
  },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  navItemActive: {},
  navIcon: { fontSize: 22, marginBottom: 2 },
  navLabel: { fontSize: 11, color: '#6B7280' },
  navLabelActive: { color: '#2563EB', fontWeight: '600' },
});
