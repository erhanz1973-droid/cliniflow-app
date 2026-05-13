import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";

type DoctorApplication = {
  id: string; // 🔥 ADD: UUID primary key
  doctor_id: string; // 🔥 ADD: Doctor ID
  patient_id: string; // 🔥 KEEP: For compatibility
  name: string;
  phone: string;
  email?: string;
  clinic_code: string;
  status: string;
  role: string;
  created_at: string;
  department?: string;
  specialties?: string;
  title?: string;
  experience_years?: number;
  languages?: string;
};

type AdminNote = {
  patientId: string;
  note: string;
  timestamp: string;
};

type AdminPermissions = {
  enableReferrals: boolean;
  enableInternationalPatients: boolean;
  requireICD10: boolean;
  enableDoctorPatientChat: boolean;
};

type PatientOverview = {
  totalPatients: number;
  activeTreatments: number;
  lastActivityDate: string;
};

type ICD10Compliance = {
  hasICD10Entries: boolean;
  mostUsedCodes: string[];
  lastEntryDate: string;
};

export default function AdminDoctorApplicationsScreen() {
  const router = useRouter();
  const { user, isAuthLoading } = useAuth();

  const [applications, setApplications] = useState<DoctorApplication[]>([]);
  const [allApplications, setAllApplications] = useState<DoctorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorApplication | null>(null);
  const [adminNotes, setAdminNotes] = useState<AdminNote[]>([]);
  const [adminNote, setAdminNote] = useState("");
  const [permissions, setPermissions] = useState<AdminPermissions>({
    enableReferrals: true,
    enableInternationalPatients: false,
    requireICD10: false,
    enableDoctorPatientChat: true,
  });
  const [patientOverview, setPatientOverview] = useState<PatientOverview>({
    totalPatients: 0,
    activeTreatments: 0,
    lastActivityDate: "",
  });
  const [icd10Compliance, setICD10Compliance] = useState<ICD10Compliance>({
    hasICD10Entries: false,
    mostUsedCodes: [],
    lastEntryDate: "",
  });

  // 🔐 ADMIN GUARD
  useEffect(() => {
    if (isAuthLoading) return;

    if (!user || user.role !== "ADMIN") {
      router.replace("/login");
      return;
    }

    loadApplications();
    loadAdminData();
  }, [user, isAuthLoading]);

  const loadApplications = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/admin/doctor-applications`,
        {
          headers: {
            Authorization: `Bearer ${user?.token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (!data?.ok || !Array.isArray(data.doctors)) {
        throw new Error("Invalid response");
      }

      // 🧹 Frontend güvenlik filtresi - kaldırıldı, tüm doctor'lar gösteriliyor
      setAllApplications(data.doctors);
      setApplications(data.doctors);
    } catch (error) {
      console.error("Load applications error:", error);
      Alert.alert("Hata", "Doktor başvuruları yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  const loadAdminData = async () => {
    try {
      // Load admin notes
      const notesResponse = await fetch(`${API_BASE}/api/admin/notes`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (notesResponse.ok) {
        const notesData = await notesResponse.json();
        if (notesData.ok) {
          setAdminNotes(notesData.notes || []);
        }
      }

      // Load permissions
      const permResponse = await fetch(`${API_BASE}/api/admin/permissions`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (permResponse.ok) {
        const permData = await permResponse.json();
        if (permData.ok) {
          setPermissions(permData.permissions);
        }
      }

      // Load patient overview
      const overviewResponse = await fetch(`${API_BASE}/api/admin/patient-overview`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (overviewResponse.ok) {
        const overviewData = await overviewResponse.json();
        if (overviewData.ok) {
          setPatientOverview(overviewData.overview);
        }
      }

      // Load ICD-10 compliance
      const icdResponse = await fetch(`${API_BASE}/api/admin/icd10-compliance`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      if (icdResponse.ok) {
        const icdData = await icdResponse.json();
        if (icdData.ok) {
          setICD10Compliance(icdData.compliance);
        }
      }
    } catch (error) {
      console.error("Load admin data error:", error);
    }
  };

  const approveDoctor = async (doctorId: string) => {
    setApproving(doctorId);
    try {
      const response = await fetch(
        `${API_BASE}/api/admin/approve-doctor`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user?.token}`,
          },
          body: JSON.stringify({ doctorId }), // 🔥 FIX: Send doctorId not patientId
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (data.ok) {
        Alert.alert("Başarılı", "Doktor onaylandı");
        loadApplications();
        loadAdminData();
      } else {
        Alert.alert("Hata", data.error || "Onay başarısız");
      }
    } catch (error) {
      console.error("Approve error:", error);
      Alert.alert("Hata", "Doktor onaylanamadı");
    } finally {
      setApproving(null);
    }
  };

  const saveAdminNote = async () => {
    if (!selectedDoctor || !adminNote.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/api/admin/notes`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({
          patientId: selectedDoctor.patient_id,
          note: adminNote.trim(),
        }),
      });

      if (response.ok) {
        Alert.alert("Başarılı", "Not kaydedildi");
        setAdminNote("");
        loadAdminData();
      } else {
        Alert.alert("Hata", "Not kaydedilemedi");
      }
    } catch (error) {
      console.error("Save note error:", error);
      Alert.alert("Hata", "Not kaydedilemedi");
    }
  };

  const updatePermission = async (key: keyof AdminPermissions, value: boolean) => {
    try {
      const response = await fetch(`${API_BASE}/api/admin/permissions`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user?.token}`,
        },
        body: JSON.stringify({ [key]: value }),
      });

      if (response.ok) {
        setPermissions(prev => ({ ...prev, [key]: value }));
        Alert.alert("Başarılı", "İzin güncellendi");
      } else {
        Alert.alert("Hata", "İzin güncellenemedi");
      }
    } catch (error) {
      console.error("Update permission error:", error);
      Alert.alert("Hata", "İzin güncellenemedi");
    }
  };

  const renderDoctorSummary = ({ item }: { item: DoctorApplication }) => (
    <View
      style={{
        backgroundColor: "#1f2937",
        padding: 20,
        marginVertical: 8,
        marginHorizontal: 16,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: "#374151",
      }}
    >
      {/* Doctor Summary Card */}
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: "bold", color: "#ffffff", marginBottom: 8 }}>
          {item.name}
        </Text>
        
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ color: "#a7b2c8", fontSize: 14 }}>
            📱 {item.phone}
          </Text>
          <Text style={{ 
            color: item.status === "ACTIVE" ? "#4ade80" : "#f59e0b", 
            fontSize: 12,
            fontWeight: "bold",
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 6,
            backgroundColor: item.status === "ACTIVE" ? "#064e3b" : "#991b1b"
          }}>
            {item.status}
          </Text>
        </View>

        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
          <Text style={{ color: "#a7b2c8", fontSize: 14 }}>
            🏥 {item.clinic_code || "Belirtilmemiş"}
          </Text>
          <Text style={{ color: "#a7b2c8", fontSize: 14 }}>
            📅 {new Date(item.created_at).toLocaleDateString("tr-TR")}
          </Text>
        </View>

        {item.department && (
          <Text style={{ color: "#a7b2c8", fontSize: 14, marginBottom: 2 }}>
            🏥️ {item.department}
          </Text>
        )}

        {item.specialties && (
          <Text style={{ color: "#a7b2c8", fontSize: 14, marginBottom: 2 }}>
            🩺 {JSON.parse(item.specialties || "[]").join(", ")}
          </Text>
        )}

        {item.title && (
          <Text style={{ color: "#a7b2c8", fontSize: 14, marginBottom: 2 }}>
            👨‍⚕️ {item.title}
          </Text>
        )}

        {item.experience_years && (
          <Text style={{ color: "#a7b2c8", fontSize: 14, marginBottom: 2 }}>
            📊 {item.experience_years} yıl deneyim
          </Text>
        )}
      </View>

      {/* Action Buttons */}
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <TouchableOpacity
          style={{
            backgroundColor: "#4ade80",
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: 8,
            flex: 1,
            marginRight: 8,
          }}
          onPress={() => setSelectedDoctor(item)}
        >
          <Text style={{ color: "#ffffff", fontWeight: "bold", textAlign: "center" }}>
            👁️ Detaylar
          </Text>
        </TouchableOpacity>

        {item.status === "PENDING" && (
          <TouchableOpacity
            style={{
              backgroundColor: "#f59e0b",
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 8,
              flex: 1,
              marginLeft: 8,
            }}
            onPress={() => approveDoctor(item.id || item.doctor_id)}
            disabled={approving === (item.id || item.doctor_id)}
          >
            <Text style={{ color: "#ffffff", fontWeight: "bold", textAlign: "center" }}>
              {approving === (item.id || item.doctor_id) ? "⏳ İşleniyor..." : "✅ Onayla"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderAdminControls = () => (
    <ScrollView style={{ flex: 1, backgroundColor: "#1a1a1a" }}>
      {/* Admin Permissions */}
      <View style={{ padding: 20, marginBottom: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "#ffffff", marginBottom: 16 }}>
          🛡️ Admin İzinleri
        </Text>
        
        {Object.entries(permissions).map(([key, value]) => (
          <TouchableOpacity
            key={key}
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 12,
              paddingHorizontal: 16,
              backgroundColor: "#2d2d2d",
              borderRadius: 8,
              marginBottom: 8,
            }}
            onPress={() => updatePermission(key as keyof AdminPermissions, !value)}
          >
            <Text style={{ color: "#ffffff", fontSize: 16 }}>
              {key === "enableReferrals" && "👥 Referanslar"}
              {key === "enableInternationalPatients" && "🌍 Uluslararası Hastalar"}
              {key === "requireICD10" && "📋 ICD-10 Zorunlu"}
              {key === "enableDoctorPatientChat" && "💬 Doktor-Hasta Sohbeti"}
            </Text>
            <Text style={{ 
              color: value ? "#4ade80" : "#ef4444", 
              fontSize: 14,
              fontWeight: "bold"
            }}>
              {value ? "✅ Aktif" : "❌ Pasif"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Patient Overview */}
      <View style={{ padding: 20, marginBottom: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "#ffffff", marginBottom: 16 }}>
          📊 Hasta Genel Bakış
        </Text>
        
        <View style={{ backgroundColor: "#2d2d2d", borderRadius: 8, padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ color: "#a7b2c8", fontSize: 14 }}>Toplam Hasta:</Text>
            <Text style={{ color: "#ffffff", fontSize: 16, fontWeight: "bold" }}>
              {patientOverview.totalPatients}
            </Text>
          </View>
          
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ color: "#a7b2c8", fontSize: 14 }}>Aktif Tedavi:</Text>
            <Text style={{ color: "#4ade80", fontSize: 16, fontWeight: "bold" }}>
              {patientOverview.activeTreatments}
            </Text>
          </View>
          
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: "#a7b2c8", fontSize: 14 }}>Son Aktivite:</Text>
            <Text style={{ color: "#ffffff", fontSize: 14 }}>
              {patientOverview.lastActivityDate || "Bilinmiyor"}
            </Text>
          </View>
        </View>
      </View>

      {/* ICD-10 Compliance */}
      <View style={{ padding: 20, marginBottom: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: "bold", color: "#ffffff", marginBottom: 16 }}>
          📋 ICD-10 Uyumluluğu
        </Text>
        
        <View style={{ backgroundColor: "#2d2d2d", borderRadius: 8, padding: 16 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
            <Text style={{ color: "#a7b2c8", fontSize: 14 }}>ICD-10 Girişi:</Text>
            <Text style={{ 
              color: icd10Compliance.hasICD10Entries ? "#4ade80" : "#ef4444", 
              fontSize: 16, 
              fontWeight: "bold" 
            }}>
              {icd10Compliance.hasICD10Entries ? "✅ Var" : "❌ Yok"}
            </Text>
          </View>
          
          {icd10Compliance.mostUsedCodes.length > 0 && (
            <View style={{ marginBottom: 8 }}>
              <Text style={{ color: "#a7b2c8", fontSize: 14, marginBottom: 4 }}>En Çok Kullanılan Kodlar:</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {icd10Compliance.mostUsedCodes.slice(0, 5).map((code, index) => (
                  <Text key={index} style={{ 
                    color: "#ffffff", 
                    fontSize: 12, 
                    marginRight: 8, 
                    marginBottom: 4,
                    backgroundColor: "#374151",
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4
                  }}>
                    {code}
                  </Text>
                ))}
              </View>
            </View>
          )}
          
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: "#a7b2c8", fontSize: 14 }}>Son Giriş:</Text>
            <Text style={{ color: "#ffffff", fontSize: 14 }}>
              {icd10Compliance.lastEntryDate || "Bilinmiyor"}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );

  const renderDoctorDetails = () => {
    if (!selectedDoctor) return null;

    return (
      <View style={{ flex: 1, backgroundColor: "#1a1a1a" }}>
        {/* Header */}
        <View style={{ 
          flexDirection: "row", 
          justifyContent: "space-between", 
          alignItems: "center", 
          padding: 20, 
          backgroundColor: "#2d2d2d" 
        }}>
          <Text style={{ fontSize: 18, fontWeight: "bold", color: "#ffffff" }}>
            📋 Doktor Detayları
          </Text>
          <TouchableOpacity
            style={{ padding: 8 }}
            onPress={() => setSelectedDoctor(null)}
          >
            <Text style={{ color: "#ef4444", fontSize: 16 }}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1, padding: 20 }}>
          {/* Doctor Summary Card */}
          {renderDoctorSummary({ item: selectedDoctor })}

          {/* Admin Note */}
          <View style={{ marginTop: 20, backgroundColor: "#2d2d2d", borderRadius: 8, padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "bold", color: "#ffffff", marginBottom: 12 }}>
              📝 Admin Notu
            </Text>
            
            <TextInput
              style={{
                backgroundColor: "#1a1a1a",
                color: "#ffffff",
                borderWidth: 1,
                borderColor: "#374151",
                borderRadius: 8,
                padding: 12,
                fontSize: 14,
                minHeight: 80,
                textAlignVertical: "top",
              }}
              placeholder="Admin notunu buraya yazın..."
              placeholderTextColor="#666"
              value={adminNote}
              onChangeText={setAdminNote}
              multiline
            />
            
            <TouchableOpacity
              style={{
                backgroundColor: "#4ade80",
                paddingVertical: 12,
                paddingHorizontal: 20,
                borderRadius: 8,
                marginTop: 12,
                alignSelf: "flex-end",
              }}
              onPress={saveAdminNote}
            >
              <Text style={{ color: "#ffffff", fontWeight: "bold" }}>
                💾 Kaydet
              </Text>
            </TouchableOpacity>
          </View>

          {/* Previous Notes */}
          {adminNotes
            .filter(note => note.patientId === selectedDoctor.patient_id)
            .map((note, index) => (
              <View key={index} style={{ 
                backgroundColor: "#374151", 
                borderRadius: 8, 
                padding: 12, 
                marginBottom: 8 
              }}>
                <Text style={{ color: "#a7b2c8", fontSize: 12, marginBottom: 4 }}>
                  {new Date(note.timestamp).toLocaleString("tr-TR")}
                </Text>
                <Text style={{ color: "#ffffff", fontSize: 14 }}>
                  {note.note}
                </Text>
              </View>
            ))}
        </ScrollView>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#1a1a1a" }}>
        <ActivityIndicator size="large" color="#4ade80" />
        <Text style={{ color: "#ffffff", marginTop: 16 }}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#1a1a1a" }}>
      {/* Header */}
      <View style={{ 
        flexDirection: "row", 
        justifyContent: "space-between", 
        alignItems: "center", 
        padding: 20, 
        backgroundColor: "#2d2d2d" 
      }}>
        <Text style={{ fontSize: 20, fontWeight: "bold", color: "#ffffff" }}>
          👨‍⚕️ Doktor Başvuruları
        </Text>
        
        <View style={{ flexDirection: "row" }}>
          <TouchableOpacity
            style={{
              backgroundColor: selectedDoctor ? "#374151" : "#4ade80",
              paddingVertical: 8,
              paddingHorizontal: 16,
              borderRadius: 8,
              marginRight: 8,
            }}
            onPress={() => setSelectedDoctor(selectedDoctor ? null : allApplications[0])}
          >
            <Text style={{ color: "#ffffff", fontSize: 14 }}>
              {selectedDoctor ? "📋 Listeye Dön" : "🛠️ Kontroller"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Content */}
      {selectedDoctor ? renderDoctorDetails() : (
        <FlatList
          data={applications}
          keyExtractor={(item) => item.patient_id}
          renderItem={({ item }) => renderDoctorSummary({ item })}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}
