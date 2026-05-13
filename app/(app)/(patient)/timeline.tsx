import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  SectionList,
  TouchableOpacity,
  Linking,
} from "react-native";
import { useAuth } from "../../../lib/auth";
import { API_BASE } from "../../../lib/api";
import { useLanguage } from "../../../lib/language-context";
import { useDateLocale } from "../../../lib/date-locale";

export type TimelineType = "appointment" | "flight" | "hotel" | "transfer";

export type TimelineItem = {
  id: string;
  patient_id: string;
  type: TimelineType;
  title: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  metadata: any;
  created_at: string;
};

type ApiResponse = {
  ok: boolean;
  items: TimelineItem[];
};

type Section = { title: string; dateKey: string; data: TimelineItem[] };

function formatDateTime(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateOnly(value: string | null | undefined, locale: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getDateKey(item: TimelineItem): string {
  const raw = item.start_date || item.created_at;
  if (!raw) return "";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
}

const ICON: Record<TimelineType, string> = {
  appointment: "🦷",
  flight: "✈️",
  hotel: "🏨",
  transfer: "🚗",
};

const ACCENT: Record<TimelineType, string> = {
  appointment: "#2563eb",
  flight: "#0ea5e9",
  hotel: "#0891b2",
  transfer: "#16a34a",
};

function statusColor(s: string): string {
  switch (String(s || "").toUpperCase()) {
    case "COMPLETED":
    case "DONE":
      return "#16a34a";
    case "IN_PROGRESS":
    case "ACTIVE":
      return "#2563eb";
    case "PLANNED":
    case "SCHEDULED":
      return "#f59e0b";
    case "CANCELLED":
      return "#dc2626";
    default:
      return "#6b7280";
  }
}

function getStatusLabel(status: string | undefined, t: (k: string) => string): string {
  switch (String(status || "").toUpperCase()) {
    case "COMPLETED":
    case "DONE":
      return t("treatment.status.completed");
    case "IN_PROGRESS":
    case "ACTIVE":
      return t("treatment.status.inProgress");
    case "PLANNED":
      return t("treatment.status.planned");
    case "SCHEDULED":
      return t("treatment.status.planned");
    case "CANCELLED":
      return t("treatment.status.cancelled") || "Cancelled";
    default:
      return status || "—";
  }
}

export default function PatientTimelineScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const locale = useDateLocale();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<TimelineItem[]>([]);

  const patientId = String(user?.patientId || user?.id || "").trim();

  const fetchTimeline = useCallback(async () => {
    if (!user?.token || !patientId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/patient/${encodeURIComponent(patientId)}/timeline`,
        {
          headers: {
            Authorization: `Bearer ${user.token}`,
            Accept: "application/json",
          },
        }
      );
      const json: ApiResponse = await res.json().catch(() => ({ ok: false, items: [] }));
      const timeline = Array.isArray(json.items) ? json.items : [];
      const sorted = [...timeline].sort((a, b) => {
        const aTime = a.start_date ? new Date(a.start_date).getTime() : 0;
        const bTime = b.start_date ? new Date(b.start_date).getTime() : 0;
        if (aTime !== bTime) return aTime - bTime;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      setItems(sorted);
    } catch (err) {
      console.warn("[PATIENT TIMELINE] fetch error", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.token, patientId]);

  useEffect(() => {
    fetchTimeline();
  }, [fetchTimeline]);

  const now = useMemo(() => new Date(), []);
  const todayKey = useMemo(() => now.toISOString().split("T")[0], [now]);
  const tomorrow = useMemo(() => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }, [now]);

  const nextEvent = useMemo((): TimelineItem | null => {
    for (const item of items) {
      const key = item.start_date ? new Date(item.start_date).toISOString().split("T")[0] : null;
      const ts = item.start_date ? new Date(item.start_date).getTime() : 0;
      if (key && ts >= now.getTime()) return item;
    }
    return null;
  }, [items, now]);

  const sections = useMemo((): Section[] => {
    const byDate = new Map<string, TimelineItem[]>();
    for (const item of items) {
      const key = getDateKey(item);
      const list = byDate.get(key) || [];
      list.push(item);
      byDate.set(key, list);
    }
    const keys = Array.from(byDate.keys()).filter(Boolean).sort();
    const out: Section[] = [];
    for (const key of keys) {
      let title: string;
      if (key === todayKey) title = t("timeline.today");
      else if (key === tomorrow) title = t("timeline.tomorrow");
      else {
        const d = new Date(key + "T12:00:00");
        title = formatDateOnly(d.toISOString(), locale);
      }
      out.push({ title, dateKey: key, data: byDate.get(key)! });
    }
    return out;
  }, [items, todayKey, tomorrow, locale, t]);

  const renderItem = ({ item }: { item: TimelineItem }) => (
    <TimelineCard item={item} t={t} locale={locale} />
  );

  const renderSectionHeader = ({ section }: { section: Section }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{section.title}</Text>
    </View>
  );

  const keyExtractor = (item: TimelineItem, index: number) => item.id ? `${item.id}-${index}` : `item-${index}`;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <SectionList
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      sections={sections}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      stickySectionHeadersEnabled={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            fetchTimeline();
          }}
          tintColor="#2563eb"
        />
      }
      ListHeaderComponent={
        <>
          <View style={styles.header}>
            <Text style={styles.title}>{t("timeline.pageTitle")}</Text>
            <Text style={styles.subtitle}>{t("timeline.pageSubtitle")}</Text>
          </View>
          {nextEvent ? (
            <View style={styles.nextEventSection}>
              <Text style={styles.nextEventLabel}>{t("timeline.nextEvent")}</Text>
              <TimelineCard item={nextEvent} t={t} locale={locale} prominent />
            </View>
          ) : null}
        </>
      }
      ListEmptyComponent={
        nextEvent ? null : (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📅</Text>
            <Text style={styles.emptyTitle}>{t("timeline.emptyTitle")}</Text>
            <Text style={styles.emptySubtitle}>{t("timeline.emptySubtitle")}</Text>
          </View>
        )
      }
    />
  );
}

function TimelineCard({
  item,
  t,
  locale,
  prominent,
}: {
  item: TimelineItem;
  t: (k: string) => string;
  locale: string;
  prominent?: boolean;
}) {
  const icon = ICON[item.type] || "•";
  const accent = ACCENT[item.type] || "#6b7280";
  const meta = item.metadata || {};
  const title =
    item.type === "appointment"
      ? (meta.procedureName || item.title || fallbackTitle(item, t))
      : (item.title || fallbackTitle(item, t));
  const when = formatDateTime(item.start_date || item.created_at, locale);
  const apptSub =
    item.type === "appointment"
      ? [meta.doctorName, meta.chairNumber ? `${t("common.chair")} ${meta.chairNumber}` : null]
          .filter(Boolean)
          .join(" · ")
      : null;

  return (
    <View style={[styles.card, { borderLeftColor: accent }, prominent && styles.cardProminent]}>
      <View style={styles.cardHeader}>
        <Text style={styles.icon}>{icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, prominent && styles.cardTitleProminent]}>{title}</Text>
          {apptSub ? <Text style={styles.cardMetaLine}>👨‍⚕️ {apptSub}</Text> : null}
          <Text style={styles.cardSubtitle}>{when}</Text>
        </View>
      </View>
      {renderBody(item, t, locale)}
    </View>
  );
}

function fallbackTitle(item: TimelineItem, t: (k: string) => string): string {
  switch (item.type) {
    case "appointment":
      return t("timeline.typeAppointment");
    case "flight":
      return t("timeline.typeFlight");
    case "hotel":
      return t("timeline.typeHotel");
    case "transfer":
      return t("timeline.typeTransfer");
    default:
      return t("timeline.typeEvent");
  }
}

function renderBody(item: TimelineItem, t: (k: string) => string, locale: string) {
  const meta = item.metadata || {};

  if (item.type === "appointment") {
    const app = meta;
    const status = app.status ? statusColor(app.status) : null;
    return (
      <View style={styles.body}>
        {app.clinicName ? <Text style={styles.bodyRow}>🏥 {app.clinicName}</Text> : null}
        {app.toothNumber ? <Text style={styles.bodyRow}>🦷 {t("common.tooth")} {app.toothNumber}</Text> : null}
        {app.description ? <Text style={styles.bodyRow}>📝 {app.description}</Text> : null}
        {app.status ? (
          <View style={[styles.badge, { backgroundColor: (status || "#6b7280") + "22" }]}>
            <Text style={[styles.badgeText, { color: status || "#6b7280" }]}>
              {getStatusLabel(app.status, t)}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  if (item.type === "flight") {
    const flight = meta.flight || meta;
    return (
      <View style={styles.body}>
        <Text style={styles.bodyRow}>
          {flight.from || "—"} → {flight.to || "—"}
        </Text>
        {(flight.flightNo || flight.flight_no) ? (
          <Text style={styles.bodyRow}>✈️ {flight.flightNo || flight.flight_no}</Text>
        ) : null}
        {flight.pnr ? <Text style={styles.bodyRow}>🎫 {flight.pnr}</Text> : null}
        {flight.airline ? <Text style={styles.bodyRow}>🛫 {flight.airline}</Text> : null}
        {flight.time ? <Text style={styles.bodyRow}>🕒 {flight.time}</Text> : null}
        {(flight.notes || flight.note) ? (
          <Text style={styles.bodyRow}>📝 {flight.notes || flight.note}</Text>
        ) : null}
      </View>
    );
  }

  if (item.type === "hotel") {
    const hotel = meta.hotel || meta;
    const link = hotel.googleMapLink || hotel.googleMapsUrl;
    return (
      <View style={styles.body}>
        {hotel.name ? <Text style={styles.bodyRow}>🏨 {hotel.name}</Text> : null}
        {hotel.address ? <Text style={styles.bodyRow}>📍 {hotel.address}</Text> : null}
        {hotel.phone ? (
          <Text style={styles.bodyRow}>📞 {hotel.phone}</Text>
        ) : null}
        {(hotel.checkIn || hotel.checkOut) ? (
          <Text style={styles.bodyRow}>
            📅 {formatDateOnly(hotel.checkIn, locale)}
            {hotel.checkOut ? ` – ${formatDateOnly(hotel.checkOut, locale)}` : ""}
          </Text>
        ) : null}
        {hotel.notes ? <Text style={styles.bodyRow}>📝 {hotel.notes}</Text> : null}
        {link ? (
          <TouchableOpacity onPress={() => link && Linking.openURL(link)}>
            <Text style={styles.linkText}>📍 {t("timeline.viewOnMap")}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (item.type === "transfer") {
    const pickup = meta.airportPickup || meta;
    const phone = pickup.phone ? String(pickup.phone).replace(/\D/g, "") : "";
    const whatsAppUrl = phone ? `https://wa.me/${phone}` : null;
    return (
      <View style={styles.body}>
        {pickup.name ? <Text style={styles.bodyRow}>🚗 {pickup.name}</Text> : null}
        {pickup.vehicle ? <Text style={styles.bodyRow}>🚘 {pickup.vehicle}</Text> : null}
        {pickup.phone ? <Text style={styles.bodyRow}>📞 {pickup.phone}</Text> : null}
        {pickup.notes ? <Text style={styles.bodyRow}>📝 {pickup.notes}</Text> : null}
        {whatsAppUrl ? (
          <TouchableOpacity onPress={() => Linking.openURL(whatsAppUrl)}>
            <Text style={styles.linkText}>💬 WhatsApp</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f3f4f6",
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#6b7280",
  },
  nextEventSection: {
    marginBottom: 24,
  },
  nextEventLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  sectionHeader: {
    paddingVertical: 8,
    paddingTop: 16,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardProminent: {
    padding: 16,
    borderLeftWidth: 5,
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  icon: {
    fontSize: 20,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  cardTitleProminent: {
    fontSize: 16,
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#6b7280",
  },
  cardMetaLine: {
    fontSize: 12,
    color: "#374151",
    marginTop: 2,
    fontWeight: "600",
  },
  body: {
    marginTop: 6,
  },
  bodyRow: {
    fontSize: 12,
    color: "#4b5563",
    marginTop: 2,
  },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  linkText: {
    fontSize: 12,
    color: "#2563eb",
    marginTop: 6,
    fontWeight: "600",
  },
  empty: {
    paddingVertical: 48,
    alignItems: "center",
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
    paddingHorizontal: 24,
  },
});
