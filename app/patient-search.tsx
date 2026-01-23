import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { usePatient } from "../lib/patient";
import { PATIENTS, type PatientLite } from "../data/patients";

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

export default function PatientSearch() {
  const router = useRouter();
  const { setPatient } = usePatient();

  const [q, setQ] = useState("");
  const [patients, setPatients] = useState<PatientLite[]>([]);

  useEffect(() => {
    setPatients(PATIENTS);
  }, []);

  const list = useMemo(() => {
    const s = normalize(q.trim());
    if (!s) return patients;

    return patients.filter((p) => {
      const hay = normalize(`${p.fullName} ${p.id} ${p.phone ?? ""}`);
      return hay.includes(s);
    });
  }, [q, patients]);

  async function selectPatient(p: PatientLite) {
    // ✅ Patient context kalsın (home/diğer yerler için)
    await setPatient({
      id: p.id,
      fullName: p.fullName,
      updatedAt: Date.now(),
      teeth: [],
      phone: p.phone,
    });
  }

  const goTreatments = async (p: PatientLite) => {
    await selectPatient(p);
    // ✅ En kritik: seçilen patientId ile Treatments aç
    router.replace({ pathname: "/treatments", params: { patientId: p.id } });
  };

  const goChat = async (p: PatientLite) => {
    await selectPatient(p);
    router.replace({ pathname: "/chat", params: { patientId: p.id } });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Search Patient</Text>
      <Text style={styles.sub}>Offline mini DB (data/patients.ts)</Text>

      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Name / ID / phone..."
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {list.length === 0 ? (
          <Text style={{ opacity: 0.7, marginTop: 12 }}>No results</Text>
        ) : (
          list.map((p) => (
            <View key={p.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "900" }}>{p.fullName}</Text>
                <Text style={{ opacity: 0.7 }}>
                  ID: {p.id} {p.phone ? `• ${p.phone}` : ""}
                </Text>
              </View>

              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable style={[styles.smallBtn, styles.primary]} onPress={() => goTreatments(p)}>
                  <Text style={[styles.smallBtnText, styles.primaryText]}>Treatments</Text>
                </Pressable>

                <Pressable style={[styles.smallBtn, styles.ghost]} onPress={() => goChat(p)}>
                  <Text style={[styles.smallBtnText, styles.ghostText]}>Chat</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <Pressable style={[styles.btn, styles.ghostBig]} onPress={() => router.back()}>
        <Text style={[styles.btnText, styles.ghostBigText]}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: "900" },
  sub: { opacity: 0.7, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#ddd", borderRadius: 12, padding: 12, fontSize: 16 },

  row: {
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#eee",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    backgroundColor: "white",
  },

  btn: {
    backgroundColor: "#222",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  btnText: { color: "#fff", fontWeight: "900" },

  // küçük butonlar
  smallBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  smallBtnText: { fontWeight: "900", fontSize: 12 },

  primary: { backgroundColor: "#111827", borderColor: "#111827" },
  primaryText: { color: "white" },

  ghost: { backgroundColor: "#fff", borderColor: "#ddd" },
  ghostText: { color: "#111827" },

  // alttaki Back butonu
  ghostBig: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#ddd" },
  ghostBigText: { color: "#222" },
});
