import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, TextInput, Alert,
  Modal, KeyboardAvoidingView, Platform, Linking,
} from "react-native";
import { useAuth } from "../../../lib/auth";
import { API_BASE } from "../../../lib/api";
import { useLanguage } from "../../../lib/language-context";
import { useDateLocale } from "../../../lib/date-locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType = "flight_arrival" | "flight_departure" | "hotel" | "transfer" | "treatment";
type Policy = "ADMIN" | "PATIENT" | "BOTH";

type TimelineEvent = {
  type: EventType;
  dateKey: string;
  sortTs: number;
  title: string;
  rows: { label?: string; value: string; isLink?: boolean; linkLabel?: string }[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateKey(raw: string | number | null | undefined): string | null {
  if (!raw) return null;
  const d = typeof raw === "number" ? new Date(raw) : new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
}

function toSortTs(dateKey: string, time?: string): number {
  const base = new Date(dateKey + "T" + (time || "00:00") + ":00").getTime();
  return isNaN(base) ? new Date(dateKey).getTime() : base;
}

function formatDateHeader(dateKey: string, locale: string): string {
  const d = new Date(dateKey + "T12:00:00");
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

const ICON: Record<EventType, string> = {
  flight_arrival: "✈️", flight_departure: "✈️",
  hotel: "🏨", transfer: "🚗", treatment: "🦷",
};
const ACCENT: Record<EventType, string> = {
  flight_arrival: "#2563eb", flight_departure: "#7c3aed",
  hotel: "#0891b2", transfer: "#16a34a", treatment: "#dc2626",
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function TravelScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const locale = useDateLocale();
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [travel, setTravel]         = useState<any>(null);
  const [teeth, setTeeth]           = useState<any[]>([]);
  const [saving, setSaving]         = useState(false);

  // Edit modals
  const [flightModal, setFlightModal]   = useState(false);
  const [hotelModal, setHotelModal]     = useState(false);
  const [editingFlight, setEditingFlight] = useState<any>(null); // null = new

  const patientId = String(user?.patientId || user?.id || "").trim();
  const headers   = useCallback(() => ({
    Authorization: `Bearer ${user?.token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  }), [user?.token]);

  const fetchAll = useCallback(async () => {
    if (!user?.token || !patientId) { setLoading(false); setRefreshing(false); return; }
    try {
      const [travelRes, treatRes] = await Promise.all([
        fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/travel`, { headers: headers() }).catch(() => null),
        fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/treatments`, { headers: headers() }).catch(() => null),
      ]);
      const tj = travelRes ? await travelRes.json().catch(() => ({})) : {};
      const tt = treatRes  ? await treatRes.json().catch(() => ({}))  : {};
      setTravel(tj);
      setTeeth(Array.isArray(tt.teeth) ? tt.teeth : []);
    } catch { /* ignore */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [user?.token, patientId, headers]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const policy: Record<string, Policy> = useMemo(() => ({
    hotel:         travel?.editPolicy?.hotel         || "ADMIN",
    flights:       travel?.editPolicy?.flights       || "ADMIN",
    airportPickup: travel?.editPolicy?.airportPickup || "ADMIN",
    notes:         travel?.editPolicy?.notes         || "ADMIN",
  }), [travel]);

  const canEdit = (key: string) =>
    policy[key] === "PATIENT" || policy[key] === "BOTH";

  // ── Save travel ─────────────────────────────────────────────────────────────

  const saveTravel = async (patch: any) => {
    setSaving(true);
    try {
      const next = { ...travel, ...patch };
      const res = await fetch(
        `${API_BASE}/api/patient/${encodeURIComponent(patientId)}/travel`,
        { method: "POST", headers: headers(), body: JSON.stringify(next) }
      );
      if (!res.ok) throw new Error("save_failed");
      setTravel(next);
    } catch {
      Alert.alert("Hata", "Kaydedilemedi. Tekrar deneyin.");
    } finally { setSaving(false); }
  };

  // ── Timeline events ──────────────────────────────────────────────────────────

  const { grouped, noDate } = useMemo(() => {
    const events: TimelineEvent[] = [];
    const isArrival = (f: any) => f.type === "ARRIVAL" || f.type === "OUTBOUND";
    const arrival   = (travel?.flights || []).find(isArrival);

    // Show ALL flights (not just the first match)
    (travel?.flights || []).forEach((f: any) => {
      const arv = isArrival(f);
      const dk  = f.date ? toDateKey(f.date) : null;
      const pnrOrFlightNo = f.pnr || f.flightNo;
      events.push({
        type: arv ? "flight_arrival" : "flight_departure",
        dateKey: dk || "0000-00-00",
        sortTs: dk ? toSortTs(dk, f.time) : 0,
        title: `${arv ? t("travel.arrivalFlight") : t("travel.departureFlight")}${pnrOrFlightNo ? " · " + pnrOrFlightNo : ""}`,
        rows: [
          { label: t("travel.from"),    value: f.from    || "—" },
          { label: t("travel.to"),      value: f.to      || "—" },
          ...(f.airline   ? [{ label: t("travel.airline"),  value: f.airline  }] : []),
          ...(f.flightNo  ? [{ label: t("travel.flightNo"), value: f.flightNo }] : []),
          ...(f.pnr       ? [{ label: t("travel.pnr"),      value: f.pnr      }] : []),
          ...(f.time      ? [{ label: t("travel.time"),     value: f.time     }] : []),
          ...(f.note      ? [{ label: t("travel.noteLabel"), value: f.note    }] : []),
        ],
      });
    });

    const ap = travel?.airportPickup;
    if (ap?.name || ap?.vehicle) {
      const dk = arrival?.date ? toDateKey(arrival.date) : null;
      events.push({
        type: "transfer", dateKey: dk || "0000-00-00",
        sortTs: dk ? toSortTs(dk, arrival?.time) + 60_000 : 0,
        title: t("travel.airportTransfer"),
        rows: [
          ...(ap.name    ? [{ label: t("travel.driver"),  value: ap.name    }] : []),
          ...(ap.vehicle ? [{ label: t("travel.vehicle"), value: ap.vehicle }] : []),
          ...(ap.phone   ? [{ label: "📞 Tel", value: ap.phone }, { label: "WhatsApp", value: `https://wa.me/${ap.phone.replace(/[^0-9]/g, "")}`, isLink: true, linkLabel: t("travel.whatsappWrite") }] : []),
          ...(ap.notes   ? [{ label: t("travel.noteLabel"), value: ap.notes }] : []),
        ],
      });
    }

    if (travel?.hotel?.name) {
      const h = travel.hotel;
      const checkInDk  = toDateKey(h.checkIn)  || (arrival?.date ? toDateKey(arrival.date) : null);
      const checkOutDk = toDateKey(h.checkOut);

      // Check-in event
      events.push({
        type: "hotel", dateKey: checkInDk || "0000-00-00",
        sortTs: checkInDk ? toSortTs(checkInDk) + 120_000 : 0,
        title: t("travel.hotelCheckIn"),
        rows: [
          { value: h.name },
          ...(h.address       ? [{ label: t("travel.address"), value: h.address }] : []),
          ...(h.phone         ? [{ label: "📞 Tel", value: h.phone }] : []),
          ...((h.googleMapLink || h.googleMapsUrl) ? [{ label: "📍", value: h.googleMapLink || h.googleMapsUrl, isLink: true, linkLabel: t("travel.openMap") }] : []),
        ],
      });

      // Check-out event (only if date is set)
      if (checkOutDk) {
        events.push({
          type: "hotel", dateKey: checkOutDk,
          sortTs: toSortTs(checkOutDk) + 120_000,
          title: t("travel.hotelCheckOut"),
          rows: [{ value: h.name }],
        });
      }
    }

    teeth.forEach((tooth: any) => {
      (tooth.procedures || []).forEach((proc: any) => {
        const raw = proc.scheduledAt || proc.scheduled_at || proc.scheduled_date;
        const dk  = toDateKey(raw);
        const label = proc.title || (proc.type ? t(`treatment.type.${proc.type}`) : null) || proc.type || "—";
        const time  = raw && typeof raw === "number"
          ? new Date(raw).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
          : typeof raw === "string" && raw.includes("T")
            ? new Date(raw).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
            : null;
        events.push({
          type: "treatment", dateKey: dk || "0000-00-00",
          sortTs: dk ? toSortTs(dk, time || undefined) : 0,
          title: label,
          rows: [
            { label: t("common.tooth"), value: `${t("common.tooth")} ${tooth.toothId}` },
            ...(time        ? [{ label: t("travel.time"),        value: time }] : []),
            ...(proc.status ? [{ label: t("travel.statusLabel"), value: proc.status }] : []),
          ],
        });
      });
    });


    const sorted = [...events].sort((a, b) => a.sortTs - b.sortTs);
    const dated   = sorted.filter(e => e.dateKey !== "0000-00-00");
    const undated = sorted.filter(e => e.dateKey === "0000-00-00");

    const grouped = new Map<string, TimelineEvent[]>();
    dated.forEach(e => {
      const list = grouped.get(e.dateKey) || [];
      list.push(e);
      grouped.set(e.dateKey, list);
    });

    return { grouped, noDate: undated };
  }, [travel, teeth]);

  // ─── UI ─────────────────────────────────────────────────────────────────────

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  const hasAny = grouped.size > 0 || noDate.length > 0;
  const flights = travel?.flights || [];

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchAll(); }} tintColor="#2563eb" />}
      >
        {/* Header */}
        <View style={styles.pageHeader}>
          <Text style={styles.pageTitle}>{t("travel.pageTitle")}</Text>
          <Text style={styles.pageSub}>{t("travel.pageSub")}</Text>
        </View>

        {/* Edit section — only shown when patient has permission */}
        {(canEdit("flights") || canEdit("hotel")) && (
          <View style={styles.editSection}>
            <Text style={styles.editSectionTitle}>{t("travel.editSectionTitle")}</Text>
            <Text style={styles.editSectionSub}>{t("travel.editSectionSub")}</Text>
            <View style={styles.editButtons}>
              {canEdit("flights") && (
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => { setEditingFlight(null); setFlightModal(true); }}
                >
                  <Text style={styles.editBtnIcon}>✈️</Text>
                  <Text style={styles.editBtnLabel}>
                    {flights.length > 0 ? t("travel.editFlight") : t("travel.addFlight")}
                  </Text>
                </TouchableOpacity>
              )}
              {canEdit("hotel") && (
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => setHotelModal(true)}
                >
                  <Text style={styles.editBtnIcon}>🏨</Text>
                  <Text style={styles.editBtnLabel}>
                    {travel?.hotel?.name ? t("travel.editHotelLabel") : t("travel.addHotelLabel")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Existing flights list with edit */}
            {canEdit("flights") && flights.length > 0 && (
              <View style={{ marginTop: 12, gap: 8 }}>
                {flights.map((f: any, i: number) => (
                  <TouchableOpacity
                    key={f.id || i}
                    style={styles.existingItem}
                    onPress={() => { setEditingFlight(f); setFlightModal(true); }}
                  >
                    <Text style={styles.existingItemIcon}>✈️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.existingItemTitle}>
                        {(f.type === "ARRIVAL" || f.type === "OUTBOUND") ? t("travel.arrival") : t("travel.departure")} · {f.from} → {f.to}
                      </Text>
                      {f.date && <Text style={styles.existingItemSub}>{f.date}{f.time ? " " + f.time : ""}</Text>}
                    </View>
                    <Text style={styles.existingItemEdit}>{t("travel.editLabel")}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Hotel summary */}
            {canEdit("hotel") && travel?.hotel?.name && (
              <TouchableOpacity style={styles.existingItem} onPress={() => setHotelModal(true)}>
                <Text style={styles.existingItemIcon}>🏨</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.existingItemTitle}>{travel.hotel.name}</Text>
                  {travel.hotel.address && <Text style={styles.existingItemSub}>{travel.hotel.address}</Text>}
                </View>
                <Text style={styles.existingItemEdit}>{t("travel.editLabel")}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Timeline */}
        {!hasAny && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>✈️</Text>
            <Text style={styles.emptyTitle}>{t("travel.emptyTitle")}</Text>
            <Text style={styles.emptySub}>
              {canEdit("flights") || canEdit("hotel")
                ? t("travel.emptySubEdit")
                : t("travel.emptySub")}
            </Text>
          </View>
        )}

        {[...grouped.entries()].map(([dk, evs]) => (
          <View key={dk}>
            <View style={styles.dayHeader}>
              <View style={styles.dayLine} />
              <Text style={styles.dayLabel}>{formatDateHeader(dk, locale)}</Text>
              <View style={styles.dayLine} />
            </View>
            {evs.map((ev, i) => (
              <EventCard key={`${dk}-${i}`} event={ev} isLast={i === evs.length - 1} />
            ))}
          </View>
        ))}

        {noDate.length > 0 && (
          <View>
            <View style={styles.dayHeader}>
              <View style={styles.dayLine} />
              <Text style={[styles.dayLabel, { color: "#9ca3af" }]}>Tarihi Belirsiz</Text>
              <View style={styles.dayLine} />
            </View>
            {noDate.map((ev, i) => (
              <EventCard key={`nd-${i}`} event={ev} isLast={i === noDate.length - 1} />
            ))}
          </View>
        )}

        {!!travel?.notes && (
          <View style={styles.notesBox}>
            <Text style={styles.notesTitle}>📝 Notlar</Text>
            <Text style={styles.notesText}>{travel.notes}</Text>
          </View>
        )}
      </ScrollView>

      {/* Flight Modal */}
      <FlightModal
        visible={flightModal}
        flight={editingFlight}
        onClose={() => setFlightModal(false)}
        saving={saving}
        onSave={(f) => {
          const existing: any[] = travel?.flights || [];
          const updated = f.id
            ? existing.map((x: any) => x.id === f.id ? f : x)
            : [...existing, { ...f, id: String(Date.now()) }];
          saveTravel({ flights: updated });
          setFlightModal(false);
        }}
        onDelete={(fId) => {
          const updated = (travel?.flights || []).filter((x: any) => x.id !== fId);
          saveTravel({ flights: updated });
          setFlightModal(false);
        }}
      />

      {/* Hotel Modal */}
      <HotelModal
        visible={hotelModal}
        hotel={travel?.hotel}
        onClose={() => setHotelModal(false)}
        saving={saving}
        onSave={(h) => { saveTravel({ hotel: h }); setHotelModal(false); }}
      />
    </>
  );
}

// ─── EventCard ────────────────────────────────────────────────────────────────

function EventCard({ event, isLast }: { event: TimelineEvent; isLast: boolean }) {
  const accent = ACCENT[event.type];
  return (
    <View style={styles.eventRow}>
      <View style={styles.eventLeft}>
        <View style={[styles.eventDot, { backgroundColor: accent }]}>
          <Text style={styles.eventDotIcon}>{ICON[event.type]}</Text>
        </View>
        {!isLast && <View style={styles.eventLine} />}
      </View>
      <View style={[styles.eventCard, { borderLeftColor: accent }]}>
        <Text style={[styles.eventTitle, { color: accent }]}>{event.title}</Text>
        {event.rows.map((row, i) => (
          <View key={i} style={styles.eventDetailRow}>
            {row.label && <Text style={styles.eventLabel}>{row.label}:</Text>}
            {row.isLink ? (
              <TouchableOpacity onPress={() => Linking.openURL(row.value)}>
                <Text style={[styles.eventValue, { color: "#2563eb", textDecorationLine: "underline" }]}>
                  {row.linkLabel || "Haritada Aç"}
                </Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.eventValue}>{row.value}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── FlightModal ─────────────────────────────────────────────────────────────

function FlightModal({ visible, flight, onClose, saving, onSave, onDelete }: any) {
  const [type, setType]   = useState<"ARRIVAL" | "DEPARTURE">("ARRIVAL");
  const [from, setFrom]   = useState("");
  const [to, setTo]       = useState("");
  const [date, setDate]   = useState("");
  const [time, setTime]   = useState("");
  const [pnr, setPnr]     = useState("");
  const [note, setNote]   = useState("");

  useEffect(() => {
    if (flight) {
      setType(flight.type === "OUTBOUND" ? "ARRIVAL" : flight.type === "RETURN" ? "DEPARTURE" : (flight.type || "ARRIVAL"));
      setFrom(flight.from || "");
      setTo(flight.to || "");
      setDate(flight.date || "");
      setTime(flight.time || "");
      setPnr(flight.pnr || "");
      setNote(flight.note || "");
    } else {
      setType("ARRIVAL"); setFrom(""); setTo("");
      setDate(""); setTime(""); setPnr(""); setNote("");
    }
  }, [flight, visible]);

  const handleSave = () => {
    if (!from || !to) { Alert.alert("Hata", "Kalkış ve varış alanları zorunlu."); return; }
    onSave({ ...(flight || {}), type, from, to, date, time, pnr, note });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={modal.container}>
          <View style={modal.header}>
            <Text style={modal.title}>{flight ? "Uçuşu Düzenle" : "Uçuş Ekle"}</Text>
            <TouchableOpacity onPress={onClose}><Text style={modal.close}>✕</Text></TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 40 }}>
            <View style={modal.segRow}>
              {(["ARRIVAL", "DEPARTURE"] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[modal.seg, type === t && modal.segActive]}
                  onPress={() => setType(t)}
                >
                  <Text style={[modal.segText, type === t && modal.segTextActive]}>
                    {t === "ARRIVAL" ? "✈️ Geliş" : "✈️ Dönüş"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Field label="Kalkış (IATA kodu, örn: LHR)" value={from} onChangeText={setFrom} placeholder="LHR" autoCapitalize="characters" />
            <Field label="Varış (IATA kodu, örn: IST)" value={to} onChangeText={setTo} placeholder="IST" autoCapitalize="characters" />
            <Field label="Tarih (YYYY-AA-GG)" value={date} onChangeText={setDate} placeholder="2026-06-12" keyboardType="numeric" />
            <Field label="Saat (SS:DD)" value={time} onChangeText={setTime} placeholder="14:20" keyboardType="numeric" />
            <Field label="PNR / Rezervasyon Kodu" value={pnr} onChangeText={setPnr} placeholder="ABC123" autoCapitalize="characters" />
            <Field label="Not (opsiyonel)" value={note} onChangeText={setNote} placeholder="Terminal 1, iç hatlar..." multiline />

            <TouchableOpacity style={[modal.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              <Text style={modal.saveBtnText}>{saving ? "Kaydediliyor..." : "Kaydet"}</Text>
            </TouchableOpacity>

            {flight && (
              <TouchableOpacity
                style={modal.deleteBtn}
                onPress={() => Alert.alert("Sil", "Bu uçuşu silmek istiyor musunuz?", [
                  { text: "İptal", style: "cancel" },
                  { text: "Sil", style: "destructive", onPress: () => onDelete(flight.id) },
                ])}
              >
                <Text style={modal.deleteBtnText}>Uçuşu Sil</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── HotelModal ───────────────────────────────────────────────────────────────

function HotelModal({ visible, hotel, onClose, saving, onSave }: any) {
  const [name, setName]       = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    setName(hotel?.name || "");
    setAddress(hotel?.address || "");
  }, [hotel, visible]);

  const handleSave = () => {
    if (!name.trim()) { Alert.alert("Hata", "Otel adı zorunlu."); return; }
    onSave({ ...(hotel || {}), name: name.trim(), address: address.trim() || undefined });
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={modal.container}>
          <View style={modal.header}>
            <Text style={modal.title}>{hotel?.name ? "Oteli Düzenle" : "Otel Bilgisi Ekle"}</Text>
            <TouchableOpacity onPress={onClose}><Text style={modal.close}>✕</Text></TouchableOpacity>
          </View>
          <View style={{ gap: 14, paddingBottom: 40 }}>
            <Field label="Otel Adı" value={name} onChangeText={setName} placeholder="Radisson Blu, Hilton..." />
            <Field label="Adres (opsiyonel)" value={address} onChangeText={setAddress} placeholder="Otel adresi veya Google Maps linki" multiline />
            <TouchableOpacity style={[modal.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
              <Text style={modal.saveBtnText}>{saving ? "Kaydediliyor..." : "Kaydet"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, ...props }: any) {
  return (
    <View>
      <Text style={modal.label}>{label}</Text>
      <TextInput style={[modal.input, props.multiline && { height: 80, textAlignVertical: "top" }]} {...props} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  center:    { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f3f4f6" },

  pageHeader: {
    backgroundColor: "#fff", borderRadius: 14, padding: 20,
    marginBottom: 16, alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  pageTitle: { fontSize: 20, fontWeight: "800", color: "#111827" },
  pageSub:   { fontSize: 13, color: "#6b7280", marginTop: 4 },

  editSection: {
    backgroundColor: "#fff", borderRadius: 14, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: "#e0f2fe",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  editSectionTitle: { fontSize: 15, fontWeight: "700", color: "#111827", marginBottom: 4 },
  editSectionSub:   { fontSize: 12, color: "#6b7280", marginBottom: 12 },
  editButtons:      { flexDirection: "row", gap: 10 },
  editBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe",
    borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14,
  },
  editBtnIcon:  { fontSize: 20 },
  editBtnLabel: { fontSize: 13, fontWeight: "600", color: "#1d4ed8", flex: 1 },

  existingItem: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: "#f8fafc", borderRadius: 8, borderWidth: 1, borderColor: "#e5e7eb",
    padding: 10,
  },
  existingItemIcon:  { fontSize: 20 },
  existingItemTitle: { fontSize: 13, fontWeight: "600", color: "#111827" },
  existingItemSub:   { fontSize: 11, color: "#6b7280", marginTop: 1 },
  existingItemEdit:  { fontSize: 12, color: "#2563eb", fontWeight: "600" },

  emptyBox: {
    backgroundColor: "#fff", borderRadius: 14, padding: 32, alignItems: "center", marginTop: 8,
  },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#374151", marginBottom: 6 },
  emptySub:   { fontSize: 13, color: "#9ca3af", textAlign: "center", lineHeight: 20 },

  dayHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 14 },
  dayLine:   { flex: 1, height: 1, backgroundColor: "#e5e7eb" },
  dayLabel:  { fontSize: 13, fontWeight: "700", color: "#374151", flexShrink: 0 },

  eventRow:  { flexDirection: "row", gap: 12, marginBottom: 4 },
  eventLeft: { alignItems: "center", width: 44 },
  eventDot:  {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: "center", alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
  },
  eventDotIcon:  { fontSize: 20 },
  eventLine:     { flex: 1, width: 2, backgroundColor: "#e5e7eb", marginTop: 4, minHeight: 16 },
  eventCard: {
    flex: 1, backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 10,
    borderLeftWidth: 3,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  eventTitle:     { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  eventDetailRow: { flexDirection: "row", gap: 6, marginTop: 2 },
  eventLabel:     { fontSize: 12, color: "#9ca3af", minWidth: 56 },
  eventValue:     { fontSize: 12, color: "#374151", flex: 1 },

  notesBox: {
    backgroundColor: "#fefce8", borderWidth: 1, borderColor: "#fde68a",
    borderRadius: 12, padding: 14, marginTop: 8,
  },
  notesTitle: { fontSize: 13, fontWeight: "700", color: "#92400e", marginBottom: 6 },
  notesText:  { fontSize: 13, color: "#78350f", lineHeight: 20 },
});

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20, paddingTop: 24 },
  header:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 },
  title:     { fontSize: 18, fontWeight: "800", color: "#111827" },
  close:     { fontSize: 20, color: "#6b7280", padding: 4 },

  segRow:        { flexDirection: "row", gap: 10 },
  seg:           { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: "#f3f4f6", alignItems: "center", borderWidth: 1, borderColor: "#e5e7eb" },
  segActive:     { backgroundColor: "#eff6ff", borderColor: "#2563eb" },
  segText:       { fontSize: 13, fontWeight: "600", color: "#6b7280" },
  segTextActive: { color: "#2563eb" },

  label:   { fontSize: 13, fontWeight: "600", color: "#374151", marginBottom: 6 },
  input: {
    backgroundColor: "#f9fafb", borderWidth: 1, borderColor: "#e5e7eb",
    borderRadius: 10, padding: 12, fontSize: 14, color: "#111827",
  },
  saveBtn:     { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  saveBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  deleteBtn:     { borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: "#fecaca" },
  deleteBtnText: { color: "#dc2626", fontSize: 14, fontWeight: "600" },
});
