import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Linking,
} from "react-native";
import { usePatient } from "../lib/patient";
import { API_BASE } from "../lib/api";

type TimelineEvent = {
  type: "HOTEL" | "TREATMENT";
  date?: string; // ISO string (opsiyonel)
  title: string;
  subtitle?: string;
  meta?: any;
};

function formatDate(d?: string) {
  if (!d) return "";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleString();
}

export default function TimelineScreen() {
  const { patient } = usePatient();
  const patientId = patient?.id || "p2";

  const [loading, setLoading] = useState(true);
  const [travel, setTravel] = useState<any>(null);
  const [treatments, setTreatments] = useState<any[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/api/patient/${patientId}/travel`).then((r) =>
        r.json()
      ),
      fetch(`${API_BASE}/api/patient/${patientId}/treatments`).then((r) =>
        r.json()
      ),
    ])
      .then(([travelJson, treatmentsJson]) => {
        setTravel(travelJson || null);
        setTreatments(
          Array.isArray(treatmentsJson?.teeth)
            ? treatmentsJson.teeth
            : []
        );
      })
      .finally(() => setLoading(false));
  }, [patientId]);

  const { scheduled, unscheduled } = useMemo(() => {
    const events: TimelineEvent[] = [];

    // 🏨 HOTEL (tarihsiz de olabilir)
    if (travel?.hotel?.name) {
      events.push({
        type: "HOTEL",
        title: `Hotel: ${travel.hotel.name}`,
        subtitle: travel.hotel.googleMapsUrl
          ? "Google Maps"
          : "Location not provided",
        meta: travel.hotel,
      });
    }

    // 🦷 TREATMENTS
    treatments.forEach((tooth) => {
      (tooth.procedures || []).forEach((p: any) => {
        const scheduledAt = p?.scheduledAt || p?.scheduled_on || p?.date; // olası isimler
        events.push({
          type: "TREATMENT",
          date: scheduledAt ? String(scheduledAt) : undefined,
          title: `Tooth ${tooth.toothId} • ${p?.type || "UNKNOWN"}`,
          subtitle: p?.status || "UNKNOWN",
          meta: { toothId: tooth.toothId, ...p },
        });
      });
    });

    const scheduled = events
      .filter((e) => !!e.date)
      .sort(
        (a, b) =>
          new Date(a.date!).getTime() - new Date(b.date!).getTime()
      );

    const unscheduled = events.filter((e) => !e.date);

    return { scheduled, unscheduled };
  }, [travel, treatments]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Loading timeline…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#F3F4F6" }}
      contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
    >
      <Text style={styles.title}>Timeline</Text>

      {/* ✅ Scheduled */}
      <Text style={styles.sectionTitle}>Scheduled</Text>
      {scheduled.length === 0 ? (
        <Text style={styles.emptyText}>No scheduled events yet.</Text>
      ) : (
        scheduled.map((e, idx) => (
          <View key={`s-${idx}`} style={styles.card}>
            <Text style={styles.cardTitle}>{e.title}</Text>
            {e.date ? <Text style={styles.date}>{formatDate(e.date)}</Text> : null}
            {e.subtitle ? <Text style={styles.subtitle}>{e.subtitle}</Text> : null}

            {e.type === "HOTEL" && e.meta?.googleMapsUrl ? (
              <Pressable onPress={() => Linking.openURL(e.meta.googleMapsUrl)}>
                <Text style={styles.link}>Open in Google Maps</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}

      {/* ✅ Unscheduled */}
      <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Unscheduled</Text>
      {unscheduled.length === 0 ? (
        <Text style={styles.emptyText}>No unscheduled items.</Text>
      ) : (
        unscheduled.map((e, idx) => (
          <View key={`u-${idx}`} style={styles.card}>
            <Text style={styles.cardTitle}>{e.title}</Text>
            <Text style={styles.unscheduledTag}>Date not set</Text>
            {e.subtitle ? <Text style={styles.subtitle}>{e.subtitle}</Text> : null}

            {e.type === "HOTEL" && e.meta?.googleMapsUrl ? (
              <Pressable onPress={() => Linking.openURL(e.meta.googleMapsUrl)}>
                <Text style={styles.link}>Open in Google Maps</Text>
              </Pressable>
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 22, fontWeight: "900", marginBottom: 10 },

  sectionTitle: { fontSize: 14, fontWeight: "900", opacity: 0.75, marginBottom: 8 },
  emptyText: { opacity: 0.6, marginBottom: 8 },

  card: {
    backgroundColor: "white",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  date: { marginTop: 4, fontWeight: "700" },
  subtitle: { marginTop: 4, opacity: 0.7 },

  unscheduledTag: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: "#F3F4F6",
    fontWeight: "800",
    opacity: 0.8,
  },

  link: { marginTop: 8, color: "#2563EB", fontWeight: "800" },
});
