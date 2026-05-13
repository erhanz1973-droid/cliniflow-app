import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "../../lib/auth"; // @ts-ignore
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
};

export default function AdminDoctorApplicationsScreen() {
  const router = useRouter();
  const { user, isAuthLoading: authLoading } = useAuth();

  const [applications, setApplications] = useState<DoctorApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);

  // 🔐 ADMIN GUARD
  useEffect(() => {
    if (authLoading) return;

    if (!user || user.role !== "ADMIN") {
      router.replace("/login");
      return;
    }

    loadApplications();
  }, [user, authLoading]);

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

      // 🧹 Frontend güvenlik filtresi
      const pendingDoctors = data.doctors.filter(
        (d: DoctorApplication) =>
          d.role === "DOCTOR" && d.status === "PENDING"
      );

      setApplications(pendingDoctors);
    } catch (error) {
      console.error("Load applications error:", error);
      Alert.alert("Hata", "Doktor başvuruları yüklenemedi");
    } finally {
      setLoading(false);
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

  const renderApplication = ({ item }: { item: DoctorApplication }) => (
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
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "bold",
              color: "#ffffff",
            }}
          >
            {item.name}
          </Text>

          <Text style={{ color: "#a7b2c8", marginTop: 4 }}>
            📱 {item.phone}
          </Text>

          {item.email && (
            <Text style={{ color: "#a7b2c8", marginTop: 2 }}>
              📧 {item.email}
            </Text>
          )}

          <Text style={{ color: "#a7b2c8", marginTop: 2 }}>
            🏥 Klinik: {item.clinic_code}
          </Text>

          <Text style={{ color: "#f59e0b", marginTop: 4, fontSize: 12 }}>
            📅{" "}
            {new Date(item.created_at).toLocaleDateString("tr-TR")}
          </Text>
        </View>

        <View style={{ alignItems: "center" }}>
          <View
            style={{
              backgroundColor: "#f59e0b",
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 20,
              marginBottom: 8,
            }}
          >
            <Text
              style={{
                color: "white",
                fontWeight: "bold",
                fontSize: 12,
              }}
            >
              BEKLEMEDE
            </Text>
          </View>

          <TouchableOpacity
            style={{
              backgroundColor: "#16a34a",
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 8,
            }}
            onPress={() => approveDoctor(item.id || item.doctor_id)}
            disabled={approving === (item.id || item.doctor_id)}
          >
            {approving === (item.id || item.doctor_id) ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text
                style={{ color: "white", fontWeight: "bold" }}
              >
                ONAYLA
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (loading || authLoading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color="#2563eb" />
        <Text style={{ marginTop: 16, color: "#a7b2c8" }}>
          Yükleniyor...
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#111827" }}>
      <View
        style={{
          padding: 20,
          borderBottomWidth: 1,
          borderBottomColor: "#374151",
        }}
      >
        <Text
          style={{
            fontSize: 24,
            fontWeight: "bold",
            color: "#ffffff",
          }}
        >
          Doktor Başvuruları
        </Text>

        <Text style={{ color: "#a7b2c8", marginTop: 4 }}>
          Onay bekleyen doktorlar
        </Text>
      </View>

      <FlatList
        data={applications}
        renderItem={renderApplication}
        keyExtractor={(item) => item.patient_id}
        contentContainerStyle={{ paddingVertical: 8 }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", padding: 40 }}>
            <Text style={{ color: "#a7b2c8" }}>
              Onay bekleyen başvuru yok
            </Text>
          </View>
        }
      />
    </View>
  );
}
