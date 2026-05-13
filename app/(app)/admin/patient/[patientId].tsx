// app/admin/patient/[patientId].tsx
// Admin Patient Detail Page

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useAuth } from "../../../../lib/auth";
import { API_BASE } from "../../../../lib/api";

interface TreatmentGroup {
  id: string;
  group_name: string;
  description: string;
  status: string;
  created_at: string;
  treatment_group_doctors: Array<{
    doctor_id: string;
    is_primary: boolean;
    doctors: {
      id: string;
      name: string;
      email: string;
    };
  }>;
}

interface Patient {
  id: string;
  name: string;
  phone: string;
  email?: string;
  status: string;
  created_at: string;
  clinic_id: string;
  treatment_groups?: TreatmentGroup[];
}

export default function AdminPatientDetailScreen() {
  const router = useRouter();
  const { patientId, tab } = useLocalSearchParams();
  const { user, isAuthReady } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [treatmentGroups, setTreatmentGroups] = useState<TreatmentGroup[]>([]);
  const [activeTab, setActiveTab] = useState("overview");
  const [groupsLoading, setGroupsLoading] = useState(false);

  // Handle tab parameter
  useEffect(() => {
    if (tab === "groups") {
      setActiveTab("groups");
    }
  }, [tab]);

  // Load patient details
  useEffect(() => {
    if (isAuthReady && user && patientId) {
      loadPatientDetails();
    }
  }, [isAuthReady, user, patientId]);

  
  const loadPatientDetails = async () => {
    try {
      setLoading(true);
      
      const response = await fetch(`${API_BASE}/api/admin/patients/${patientId}`, {
        headers: {
          "Authorization": `Bearer ${user?.token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      
      if (response.ok && data.ok) {
        setPatient(data.patient);
        // Extract treatment groups from patient response
        setTreatmentGroups(data.patient?.treatment_groups || []);
      } else {
        throw new Error(data.error || "Hasta bilgileri yüklenemedi");
      }
    } catch (error) {
      console.error("Load patient error:", error);
      Alert.alert("Hata", "Hasta bilgileri yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  
  const formatDate = (dateString: string) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString('tr-TR');
  };

  const renderOverview = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Hasta Bilgileri</Text>
      <View style={styles.infoCard}>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ad Soyad:</Text>
          <Text style={styles.infoValue}>{patient?.name || "-"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Telefon:</Text>
          <Text style={styles.infoValue}>{patient?.phone || "-"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>E-posta:</Text>
          <Text style={styles.infoValue}>{patient?.email || "-"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Durum:</Text>
          <Text style={styles.infoValue}>{patient?.status || "-"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Kayıt Tarihi:</Text>
          <Text style={styles.infoValue}>{formatDate(patient?.created_at || "")}</Text>
        </View>
      </View>
    </View>
  );

  const renderTreatmentGroups = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Treatment Groups</Text>
        <TouchableOpacity 
          style={styles.createButton}
          onPress={() => router.push(`/admin/create-treatment-group?patientId=${patientId}`)}
        >
          <Text style={styles.createButtonText}>+ Yeni Grup</Text>
        </TouchableOpacity>
      </View>
      
      {groupsLoading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : treatmentGroups.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateTitle}>Treatment Group Yok</Text>
          <Text style={styles.emptyStateText}>Bu hasta için henüz treatment group oluşturulmadı.</Text>
        </View>
      ) : (
        treatmentGroups.map((group) => {
          // Find primary doctor and count assigned doctors using junction table
          const primary = group.treatment_group_doctors?.find(d => d.is_primary)?.doctors;
          const assigned = group.treatment_group_doctors || [];
          const assignedCount = assigned.length;
          
          return (
          <View key={group.id} style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupName}>{group.group_name || "İsimsiz Grup"}</Text>
              <Text style={[styles.groupStatus, { 
                backgroundColor: group.status === 'ACTIVE' ? '#34C759' : '#FF3B30' 
              }]}>{group.status}</Text>
            </View>
            <View style={styles.groupDetails}>
              <Text style={styles.groupDetail}>Primary Doctor: {primary ? primary.name : "-"}</Text>
              <Text style={styles.groupDetail}>Assigned Doctors: {assignedCount} doctor(s)</Text>
              <Text style={styles.groupDetail}>Created: {formatDate(group.created_at)}</Text>
              {group.description && (
                <Text style={styles.groupDescription}>{group.description}</Text>
              )}
            </View>
          </View>
          );
        })
      )}
    </View>
  );

  const renderTreatmentPlan = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Treatment Plan</Text>
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateTitle}>Treatment Plan</Text>
        <Text style={styles.emptyStateText}>Tedavi planı yükleniyor...</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Geri</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Hasta Detay</Text>
      </View>

      <ScrollView style={styles.content}>
        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          {["overview", "groups", "plan"].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[
                styles.tabButton,
                activeTab === tab && styles.activeTabButton
              ]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[
                styles.tabButtonText,
                activeTab === tab && styles.activeTabButtonText
              ]}>
                {tab === "overview" ? "Overview" : tab === "groups" ? "Treatment Groups" : "Treatment Plan"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        {activeTab === "overview" && renderOverview()}
        {activeTab === "groups" && renderTreatmentGroups()}
        {activeTab === "plan" && renderTreatmentPlan()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    marginRight: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginBottom: 16,
    padding: 4,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  activeTabButton: {
    backgroundColor: '#007AFF',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  activeTabButtonText: {
    color: '#FFFFFF',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: '#34C759',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  createButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '600',
  },
  groupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  groupName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    flex: 1,
  },
  groupStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  groupDetails: {
    gap: 4,
  },
  groupDetail: {
    fontSize: 14,
    color: '#6B7280',
  },
  groupDescription: {
    fontSize: 14,
    color: '#1F2937',
    marginTop: 8,
    fontStyle: 'italic',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1F2937',
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
  },
});
