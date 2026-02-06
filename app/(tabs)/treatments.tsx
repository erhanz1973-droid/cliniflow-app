// app/treatments.tsx
// ✅ Hasta treatments ekranı - Read-only görünüm
// - FDI Dental Chart gösterimi
// - Diş numaralarına tıklayınca o dişe ait treatments listesi
// - Read-only notice

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";
import { useLanguage } from "../../lib/language-context";

/* ================= TYPES ================= */
type Procedure = {
  id: string;
  type: string;
  status: string;
  createdAt?: number;
  scheduledAt?: number;
  notes?: string;
  unit_price?: number;
  quantity?: number;
  total_price?: number;
  currency?: string;
};

type Tooth = {
  toothId: string; // "11".."48"
  procedures: Procedure[];
};

type TreatmentEvent = {
  id: string;
  type: string;
  title: string;
  description?: string;
  date?: string;
  time?: string;
  startAt?: number;
  scheduledAt?: number;
  timestamp?: number;
  status?: string;
  source?: string;
  price?: number;
  currency?: string;
};

type TreatmentsPayload = {
  teeth: Tooth[];
  events?: TreatmentEvent[];
};

/* ================= CONSTANTS ================= */
const ALL_TEETH = [
  // Upper jaw (Üst Çene)
  "11", "12", "13", "14", "15", "16", "17", "18", // Upper right
  "21", "22", "23", "24", "25", "26", "27", "28", // Upper left
  // Lower jaw (Alt Çene)
  "31", "32", "33", "34", "35", "36", "37", "38", // Lower left
  "41", "42", "43", "44", "45", "46", "47", "48", // Lower right
];

/* ================= HELPERS ================= */
function toArr<T>(x: any): T[] {
  return Array.isArray(x) ? x : [];
}

function formatDate(ts?: number) {
  if (!ts) return "—";
  const date = new Date(ts);
  // Use local timezone to avoid date shift
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`; // YYYY-MM-DD format in local timezone
}

function formatDateTime(ts?: number) {
  if (!ts) return "—";
  const locale = "tr-TR";
  return new Date(ts).toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapTreatmentEvents(rawEvents: any[]): TreatmentEvent[] {
  return toArr<any>(rawEvents).map((event, index) => {
    const baseTitle = event?.title || event?.type || "TREATMENT";
    const startAt =
      Number(event?.startAt || event?.startDate || event?.scheduledAt || event?.timestamp) ||
      (event?.date
        ? new Date(`${event.date}T${event.time || "00:00"}`).getTime()
        : 0);

    return {
      id: String(event?.id || `evt_${index}_${startAt || Date.now()}`),
      type: String(event?.type || "TREATMENT"),
      title: String(baseTitle),
      description: event?.description ? String(event.description) : undefined,
      date: event?.date ? String(event.date) : undefined,
      time: event?.time ? String(event.time) : undefined,
      startAt: startAt || undefined,
      scheduledAt: Number(event?.scheduledAt) || undefined,
      timestamp: startAt || undefined,
      status: event?.status ? String(event.status) : undefined,
      source: event?.source ? String(event.source) : undefined,
        price: event?.price != null ? Number(event.price) : undefined,
        currency: event?.currency ? String(event.currency) : undefined,
    };
  });
}

function groupTeeth(teeth: Tooth[]) {
  const map = new Map<string, Procedure[]>();
  console.log("[TREATMENTS] groupTeeth - Input teeth:", teeth.map(t => ({
    toothId: t.toothId,
    toothIdType: typeof t.toothId,
    proceduresCount: t.procedures?.length || 0
  })));
  teeth.forEach((t) => {
    const key = String(t.toothId);
    const procedures = toArr<Procedure>(t.procedures);
    console.log(`[TREATMENTS] groupTeeth - Setting key "${key}" with ${procedures.length} procedures`);
    map.set(key, procedures);
  });
  console.log("[TREATMENTS] groupTeeth - Map keys:", Array.from(map.keys()));
  return map;
}

async function fetchJson<T>(
  url: string,
  signal?: AbortSignal,
  headers?: Record<string, string>
): Promise<T> {
  const r = await fetch(url, { signal, headers });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(`HTTP ${r.status} ${r.statusText}${text ? ` • ${text}` : ""}`);
  }
  return (await r.json()) as T;
}

/* ================= SCREEN ================= */
export default function TreatmentsScreen() {
  const router = useRouter();
  const { user, isAuthReady } = useAuth();
  const { t } = useLanguage();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [patientInfo, setPatientInfo] = useState<{ patientId?: string; updatedAt?: number }>({});
  const [treatments, setTreatments] = useState<TreatmentsPayload>({ teeth: [], events: [] });
  const [selectedToothId, setSelectedToothId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentSummary, setPaymentSummary] = useState<{
    total_agreed_amount?: number;
    total_paid_amount?: number;
    remaining_amount?: number;
    currency?: string;
  } | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const allTreatmentsSectionRef = useRef<View>(null);
  const [treatmentsListY, setTreatmentsListY] = useState(0);

  // Fetch treatments function
  const fetchTreatments = useCallback(async (patientId: string, token: string, signal?: AbortSignal) => {
    try {
      const t = await fetchJson<any>(
        `${API_BASE}/api/patient/${encodeURIComponent(patientId)}/treatments`,
        signal,
        { Authorization: `Bearer ${token}` }
      );

      // Backend returns { teeth: [...], events: [...], updatedAt: ..., patientId: ... }
      console.log("[TREATMENTS] Raw backend response:", JSON.stringify(t, null, 2));
      const teeth = toArr<Tooth>(t?.teeth || []);
      const events = mapTreatmentEvents(t?.events || []);
      console.log("[TREATMENTS] Parsed teeth array:", {
        teethCount: teeth.length,
        totalProcedures: teeth.reduce((sum, t) => sum + (t.procedures?.length || 0), 0),
        eventsCount: events.length,
        teeth: teeth.map(t => ({
          toothId: t.toothId,
          proceduresCount: t.procedures?.length || 0,
          procedures: t.procedures?.map(p => ({ 
            id: p.id, 
            type: p.type, 
            status: p.status,
            scheduledAt: p.scheduledAt,
            createdAt: p.createdAt
          })) || []
        }))
      });
      setTreatments({ teeth, events });
      
      // If treatments has updatedAt, use it for patient info
      if (t?.updatedAt) {
        setPatientInfo(prev => ({ ...prev, updatedAt: t.updatedAt }));
      }
      
      return true;
    } catch (e: any) {
      console.error("[TREATMENTS] Error fetching treatments:", e);
      
        // Network error - check if server is running
        if (e?.message?.includes("Network request failed") || e?.message?.includes("Failed to fetch")) {
          setErr(`Cannot connect to server. Please make sure the server is running: ${API_BASE}`);
      } else {
        setErr(e?.message || t("treatment.couldNotLoad"));
      }
      return false;
    }
  }, []);

  const fetchTreatmentEvents = useCallback(async (patientId: string, token: string, signal?: AbortSignal) => {
    try {
      const r = await fetchJson<any>(
        `${API_BASE}/api/patient/${encodeURIComponent(patientId)}/treatment-events`,
        signal,
        { Authorization: `Bearer ${token}` }
      );
      const events = mapTreatmentEvents(r?.events || []);
      setTreatments((prev) => ({ ...prev, events }));
      return true;
    } catch (e) {
      console.warn("[TREATMENTS] Treatment events fetch failed (non-blocking):", e);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    let alive = true;
    const ac = new AbortController();

    (async () => {
      setLoading(true);
      setErr(null);

      // Check authentication
      if (!user?.token) {
        if (!alive) return;
        setLoading(false);
        setTimeout(() => {
          router.push("/login");
        }, 100);
        return;
      }

      const token = user.token;

      // Debug: Log API_BASE
      console.log("[TREATMENTS] API_BASE:", API_BASE);
      console.log("[TREATMENTS] Token exists:", !!token);

      // 1) Get patient info
      let patientId = "";
      let patientStatus = "";
      try {
        const meUrl = `${API_BASE}/api/patient/me`;
        console.log("[TREATMENTS] Fetching patient info from:", meUrl);
        const me = await fetchJson<any>(
          meUrl,
          ac.signal,
          { Authorization: `Bearer ${token}` }
        );
        patientId = me?.patientId || "";
        patientStatus = me?.status || "PENDING";
        const updatedAt = me?.updatedAt;
        
        if (!patientId) throw new Error(t("treatment.patientNotFound"));
        
        setPatientInfo({
          patientId,
          updatedAt: updatedAt ? new Date(updatedAt).getTime() : undefined,
        });
        
        // Check if patient is approved
        if (patientStatus !== "APPROVED") {
          if (!alive) return;
          setLoading(false);
          router.replace("/waiting-approval");
          return;
        }
      } catch (e: any) {
        if (!alive) return;
        console.error("[TREATMENTS] Error fetching patient info:", e);
        
        // Network error - check if server is running
        if (e?.message?.includes("Network request failed") || e?.message?.includes("Failed to fetch")) {
          setErr(`Cannot connect to server. Please make sure the server is running: ${API_BASE}`);
          setLoading(false);
          return;
        }
        
        // If 403 or patient_not_approved error, redirect to waiting approval
        if (e?.message?.includes("403") || e?.message?.includes("patient_not_approved")) {
          setLoading(false);
          router.replace("/waiting-approval");
          return;
        }
        
        setErr(e?.message || t("treatment.couldNotLoad"));
        setLoading(false);
        // Don't redirect on error, just show error message
        return;
      }

      // 2) Fetch treatments
      if (!alive) return;
      const success = await fetchTreatments(patientId, token, ac.signal);
      await fetchTreatmentEvents(patientId, token, ac.signal);
      if (!alive) return;
      setLoading(false);
    })();

    return () => {
      alive = false;
      ac.abort();
    };
  }, [router, user, isAuthReady, fetchTreatments, fetchTreatmentEvents]);

  // Refresh when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (!isAuthReady || !user?.token || !patientInfo.patientId) return;
      
      console.log("[TREATMENTS] Screen focused, refreshing treatments...");
      setRefreshing(true);
      fetchTreatments(patientInfo.patientId, user.token)
        .then(() => fetchTreatmentEvents(patientInfo.patientId as string, user.token))
        .then(() => {
          setRefreshing(false);
        })
        .catch(() => {
          setRefreshing(false);
        });
    }, [isAuthReady, user?.token, patientInfo.patientId, fetchTreatments, fetchTreatmentEvents])
  );

  const onRefresh = useCallback(async () => {
    if (!user?.token || !patientInfo.patientId) return;
    setRefreshing(true);
    await fetchTreatments(patientInfo.patientId, user.token);
    await fetchTreatmentEvents(patientInfo.patientId, user.token);
    setRefreshing(false);
  }, [user?.token, patientInfo.patientId, fetchTreatments, fetchTreatmentEvents]);

  const toothMap = useMemo(() => groupTeeth(treatments.teeth), [treatments.teeth]);

  // Get procedures for selected tooth
  const selectedProcedures = useMemo(() => {
    if (!selectedToothId) return [];
    const procedures = toothMap.get(selectedToothId) || [];
    console.log("[TREATMENTS] Selected tooth procedures:", {
      selectedToothId,
      proceduresCount: procedures.length,
      procedures: procedures.map(p => ({ id: p.id, type: p.type, status: p.status }))
    });
    return procedures;
  }, [selectedToothId, toothMap]);

  // Get all procedures with tooth info, sorted by selected tooth first
  type ProcedureWithTooth = Procedure & { toothId: string };
  const allProcedures = useMemo(() => {
    const all: ProcedureWithTooth[] = [];
    toothMap.forEach((procedures, toothId) => {
      procedures.forEach(proc => {
        all.push({ ...proc, toothId });
      });
    });
    
    // Sort: selected tooth procedures first, then by createdAt (newest first)
    return all.sort((a, b) => {
      // If selected tooth, prioritize it
      if (selectedToothId) {
        const aIsSelected = a.toothId === selectedToothId;
        const bIsSelected = b.toothId === selectedToothId;
        if (aIsSelected && !bIsSelected) return -1;
        if (!aIsSelected && bIsSelected) return 1;
        // If both are from selected tooth or neither, sort by date
      }
      // Sort by createdAt (newest first)
      const aTime = a.createdAt || 0;
      const bTime = b.createdAt || 0;
      return bTime - aTime;
    });
  }, [toothMap, selectedToothId]);

  if (!isAuthReady || loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        </View>
      </View>
    );
  }

  if (err) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>⚠️ {t("common.error")}</Text>
          <Text style={styles.errorText}>{err}</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView 
      ref={scrollViewRef}
      style={styles.container} 
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <Text style={styles.title}>{t("treatment.title")}</Text>

      {/* Read-Only Notice */}
      <View style={styles.readOnlyNotice}>
        <Text style={styles.readOnlyText}>
          {t("treatment.readOnlyNotice")}
        </Text>
      </View>

      {/* FDI Dental Chart */}
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>{t("treatment.chartTitle")}</Text>
        <Image
          source={require("../../assets/images/teeth-fdi.jpeg")}
          style={styles.chartImage}
          resizeMode="contain"
        />
      </View>

      {/* Upper Jaw (Üst Çene) */}
      <View style={styles.jawSection}>
        <Text style={styles.jawTitle}>{t("treatment.upperJaw")}</Text>
        {/* İlk satır: 11-18 */}
        <View style={styles.toothGrid}>
          {ALL_TEETH.slice(0, 8).map((toothId) => {
            const procedures = toothMap.get(toothId) || [];
            const count = procedures.length;
            const isSelected = selectedToothId === toothId;
            
            // Debug log for tooth 12
            if (toothId === "12") {
              console.log(`[TREATMENTS] Rendering tooth 12:`, {
                toothId,
                proceduresFromMap: procedures,
                count,
                mapHasKey: toothMap.has(toothId),
                allMapKeys: Array.from(toothMap.keys())
              });
            }
            
            return (
              <TouchableOpacity
                key={toothId}
                style={[
                  styles.toothButton,
                  count > 0 && styles.toothButtonHasProcedures,
                  isSelected && styles.toothButtonSelected,
                ]}
                onPress={() => {
                  const newSelected = isSelected ? null : toothId;
                  setSelectedToothId(newSelected);
                  // Scroll to treatments list when a tooth is selected
                  if (newSelected && treatmentsListY > 0) {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollTo({ y: treatmentsListY - 20, animated: true });
                    }, 300);
                  }
                }}
              >
                <Text style={[
                  styles.toothButtonText,
                  isSelected && styles.toothButtonTextSelected,
                ]}>
                  {toothId}
                </Text>
                {count > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        {/* İkinci satır: 21-28 */}
        <View style={styles.toothGrid}>
          {ALL_TEETH.slice(8, 16).map((toothId) => {
            const procedures = toothMap.get(toothId) || [];
            const count = procedures.length;
            const isSelected = selectedToothId === toothId;
            
            return (
              <TouchableOpacity
                key={toothId}
                style={[
                  styles.toothButton,
                  count > 0 && styles.toothButtonHasProcedures,
                  isSelected && styles.toothButtonSelected,
                ]}
                onPress={() => {
                  const newSelected = isSelected ? null : toothId;
                  setSelectedToothId(newSelected);
                  // Scroll to treatments list when a tooth is selected
                  if (newSelected && treatmentsListY > 0) {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollTo({ y: treatmentsListY - 20, animated: true });
                    }, 300);
                  }
                }}
              >
                <Text style={[
                  styles.toothButtonText,
                  isSelected && styles.toothButtonTextSelected,
                ]}>
                  {toothId}
                </Text>
                {count > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Lower Jaw (Alt Çene) */}
      <View style={styles.jawSection}>
        <Text style={styles.jawTitle}>{t("treatment.lowerJaw")}</Text>
        {/* İlk satır: 31-38 */}
        <View style={styles.toothGrid}>
          {ALL_TEETH.slice(16, 24).map((toothId) => {
            const procedures = toothMap.get(toothId) || [];
            const count = procedures.length;
            const isSelected = selectedToothId === toothId;
            
            return (
              <TouchableOpacity
                key={toothId}
                style={[
                  styles.toothButton,
                  count > 0 && styles.toothButtonHasProcedures,
                  isSelected && styles.toothButtonSelected,
                ]}
                onPress={() => {
                  const newSelected = isSelected ? null : toothId;
                  setSelectedToothId(newSelected);
                  // Scroll to treatments list when a tooth is selected
                  if (newSelected && treatmentsListY > 0) {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollTo({ y: treatmentsListY - 20, animated: true });
                    }, 300);
                  }
                }}
              >
                <Text style={[
                  styles.toothButtonText,
                  isSelected && styles.toothButtonTextSelected,
                ]}>
                  {toothId}
                </Text>
                {count > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        {/* İkinci satır: 41-48 */}
        <View style={styles.toothGrid}>
          {ALL_TEETH.slice(24, 32).map((toothId) => {
            const procedures = toothMap.get(toothId) || [];
            const count = procedures.length;
            const isSelected = selectedToothId === toothId;
            
            return (
              <TouchableOpacity
                key={toothId}
                style={[
                  styles.toothButton,
                  count > 0 && styles.toothButtonHasProcedures,
                  isSelected && styles.toothButtonSelected,
                ]}
                onPress={() => {
                  const newSelected = isSelected ? null : toothId;
                  setSelectedToothId(newSelected);
                  // Scroll to treatments list when a tooth is selected
                  if (newSelected && treatmentsListY > 0) {
                    setTimeout(() => {
                      scrollViewRef.current?.scrollTo({ y: treatmentsListY - 20, animated: true });
                    }, 300);
                  }
                }}
              >
                <Text style={[
                  styles.toothButtonText,
                  isSelected && styles.toothButtonTextSelected,
                ]}>
                  {toothId}
                </Text>
                {count > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Selected Tooth Procedures List */}
      {selectedToothId && (
        <View style={styles.proceduresContainer}>
          <Text style={styles.proceduresTitle}>
            {t("treatment.toothTreatments", { toothId: selectedToothId })}
          </Text>
          {selectedProcedures.length === 0 ? (
            <View style={styles.emptyProcedures}>
              <Text style={styles.emptyProceduresText}>
                {t("treatment.noTreatmentRecords")}
              </Text>
            </View>
          ) : (
            selectedProcedures.map((proc, index) => (
              <View
                key={`${selectedToothId}-${proc.id || "noid"}-${proc.createdAt || "nocreated"}-${proc.scheduledAt || "noscheduled"}-${index}`}
                style={styles.procedureCard}
              >
                <View style={styles.procedureHeader}>
                  <Text style={styles.procedureType}>
                    {proc.type ? (t(`treatment.type.${proc.type}`) || proc.type) : "—"}
                  </Text>
                  <View style={[
                    styles.statusBadge,
                    proc.status === "COMPLETED" && styles.statusBadgeCompleted,
                    proc.status === "SCHEDULED" && styles.statusBadgeScheduled,
                    proc.status === "PENDING" && styles.statusBadgePending,
                    proc.status === "ACTIVE" && styles.statusBadgeScheduled,
                  ]}>
                    <Text style={styles.statusBadgeText}>
                      {proc.status === "COMPLETED" ? t("treatment.status.completed") :
                       proc.status === "SCHEDULED" ? t("treatment.status.scheduled") :
                       proc.status === "ACTIVE" ? t("treatment.status.active") :
                       proc.status === "PLANNED" ? t("treatment.status.planned") :
                       t("treatment.status.pending")}
                    </Text>
                  </View>
                </View>
                {proc.scheduledAt && (
                  <Text style={styles.procedureDetail}>
                    {t("treatment.scheduled")}: {formatDateTime(proc.scheduledAt)}
                  </Text>
                )}
                {proc.notes && (
                  <Text style={styles.procedureDetail}>
                    📝 {t("treatment.notes")}: {proc.notes}
                  </Text>
                )}
              </View>
            ))
          )}
        </View>
      )}

      {/* Treatment Events List (from travel/admin) */}
      {treatments.events && treatments.events.length > 0 && (
        <View style={styles.eventsContainer}>
          {treatments.events
            .slice()
            .sort((a, b) => {
              const ta = a.timestamp || a.startAt || a.scheduledAt || (a.date ? new Date(`${a.date}T${a.time || "00:00"}`).getTime() : 0);
              const tb = b.timestamp || b.startAt || b.scheduledAt || (b.date ? new Date(`${b.date}T${b.time || "00:00"}`).getTime() : 0);
              return ta - tb;
            })
            .map((event) => {
              const dateTimeStr = event.date 
                ? `${event.date}${event.time ? ` ${event.time}` : ""}`.trim()
                : (event.timestamp ? formatDateTime(event.timestamp) : (event.startAt ? formatDateTime(event.startAt) : "—"));
              
              return (
                <View key={event.id || `${event.type}-${event.date}-${event.time}`} style={styles.eventCard}>
                  <View style={styles.eventHeader}>
                    <Text style={styles.eventTitle}>{event.title || event.type}</Text>
                    {event.type && (
                      <View style={styles.eventTypeBadge}>
                        <Text style={styles.eventTypeText}>
                          {event.type === "TREATMENT" ? t("treatment.eventType.treatment") :
                           event.type === "CONSULT" ? t("treatment.eventType.consult") :
                           event.type === "FOLLOWUP" ? t("treatment.eventType.followup") :
                           event.type === "LAB" ? t("treatment.eventType.lab") :
                           event.type}
                        </Text>
                      </View>
                    )}
                  </View>
                  {event.description && (
                    <Text style={styles.eventDescription}>{event.description}</Text>
                  )}
                  {event.price != null && (
                    <Text style={styles.eventPrice}>
                      💰 {Number(event.price).toLocaleString()} {event.currency || ""}
                    </Text>
                  )}
                  <Text style={styles.eventDateTime}>📅 {dateTimeStr}</Text>
                </View>
              );
            })}
        </View>
      )}

      {/* All Treatments List */}
      {allProcedures.length > 0 && (
        <View 
          ref={allTreatmentsSectionRef}
          style={styles.allTreatmentsContainer}
          onLayout={(event) => {
            const { y } = event.nativeEvent.layout;
            setTreatmentsListY(y);
          }}
        >
          <Text style={styles.allTreatmentsTitle}>
            {selectedToothId 
              ? t("treatment.allTreatmentsWithPriority", { toothId: selectedToothId })
              : t("treatment.allTreatments")}
          </Text>
          {allProcedures.map((proc, index) => {
            const isSelectedTooth = selectedToothId === proc.toothId;
            return (
              <View
                key={`all-${proc.toothId}-${proc.id || "noid"}-${proc.createdAt || "nocreated"}-${index}`}
                style={[
                  styles.procedureCard,
                  isSelectedTooth && styles.procedureCardSelected
                ]}
              >
                <View style={styles.procedureHeader}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                      <Text style={styles.toothLabel}>{t("treatment.toothLabel", { toothId: proc.toothId })}</Text>
                      {isSelectedTooth && (
                        <View style={styles.selectedIndicator}>
                          <Text style={styles.selectedIndicatorText}>✓</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.procedureType}>
                      {proc.type ? (t(`treatment.type.${proc.type}`) || proc.type) : "—"}
                    </Text>
                  </View>
                  <View style={[
                    styles.statusBadge,
                    proc.status === "COMPLETED" && styles.statusBadgeCompleted,
                    proc.status === "SCHEDULED" && styles.statusBadgeScheduled,
                    proc.status === "PENDING" && styles.statusBadgePending,
                    proc.status === "ACTIVE" && styles.statusBadgeScheduled,
                  ]}>
                    <Text style={styles.statusBadgeText}>
                      {proc.status === "COMPLETED" ? t("treatment.status.completed") :
                       proc.status === "SCHEDULED" ? t("treatment.status.scheduled") :
                       proc.status === "ACTIVE" ? t("treatment.status.active") :
                       proc.status === "PLANNED" ? t("treatment.status.planned") :
                       t("treatment.status.pending")}
                    </Text>
                  </View>
                </View>
                {proc.scheduledAt && (
                  <Text style={styles.procedureDetail}>
                    {t("treatment.scheduled")}: {formatDateTime(proc.scheduledAt)}
                  </Text>
                )}
                {proc.notes && (
                  <Text style={styles.procedureDetail}>
                    📝 {t("treatment.notes")}: {proc.notes}
                  </Text>
                )}
                {(proc.total_price || proc.unit_price) && (
                  <View style={styles.priceContainer}>
                    <View style={styles.priceRow}>
                      <Text style={styles.priceIcon}>💰</Text>
                      <Text style={styles.priceLabel}>
                        {t("treatment.estimatedCost")}: {proc.total_price 
                          ? `${proc.total_price.toFixed(2)} ${proc.currency || "EUR"}`
                          : proc.unit_price 
                          ? `${(proc.unit_price * (proc.quantity || 1)).toFixed(2)} ${proc.currency || "EUR"}`
                          : ""}
                      </Text>
                    </View>
                    <Text style={styles.priceNote}>
                      {t("treatment.informationalOnly")}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

/* ================= STYLES ================= */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
  },
  contentContainer: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 60,
  },
  loadingText: {
    marginTop: 10,
    color: "#6B7280",
    fontSize: 14,
  },
  errorContainer: {
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#991B1B",
    marginBottom: 8,
  },
  errorText: {
    color: "#991B1B",
    fontSize: 14,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#111827",
    marginBottom: 16,
    textAlign: "center",
  },
  eventsContainer: {
    marginBottom: 20,
  },
  eventCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  eventTypeBadge: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  eventTypeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1E40AF",
    textTransform: "uppercase",
  },
  eventDescription: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 6,
    lineHeight: 18,
  },
  eventPrice: {
    fontSize: 13,
    color: "#111827",
    marginBottom: 6,
    fontWeight: "600",
  },
  eventDateTime: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  readOnlyNotice: {
    backgroundColor: "#E5E7EB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  readOnlyText: {
    color: "#374151",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  patientInfo: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  patientInfoText: {
    fontSize: 13,
    color: "#6B7280",
    marginBottom: 4,
  },
  patientInfoValue: {
    fontWeight: "700",
    color: "#111827",
  },
  chartContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  chartImage: {
    width: "100%",
    height: 450, // 1.5x büyütüldü (300 * 1.5 = 450)
  },
  jawSection: {
    marginBottom: 24,
  },
  jawTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  toothGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginBottom: 8,
    justifyContent: "space-between",
  },
  toothButton: {
    width: "12%",
    minWidth: 35,
    maxWidth: 42,
    aspectRatio: 1,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  toothButtonHasProcedures: {
    backgroundColor: "#DBEAFE",
    borderColor: "#3B82F6",
  },
  toothButtonSelected: {
    backgroundColor: "#2563EB",
    borderColor: "#1D4ED8",
  },
  toothButtonText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  toothButtonTextSelected: {
    color: "#FFFFFF",
  },
  badge: {
    position: "absolute",
    top: -3,
    right: -3,
    backgroundColor: "#111827",
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 3,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
  },
  proceduresContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  proceduresTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 12,
  },
  emptyProcedures: {
    padding: 20,
    alignItems: "center",
  },
  emptyProceduresText: {
    color: "#6B7280",
    fontSize: 14,
    textAlign: "center",
  },
  allTreatmentsContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  allTreatmentsTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  toothLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2563EB",
    marginRight: 8,
  },
  selectedIndicator: {
    backgroundColor: "#10B981",
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  selectedIndicatorText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  procedureCard: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  procedureCardSelected: {
    backgroundColor: "#EFF6FF",
    borderColor: "#2563EB",
    borderWidth: 2,
  },
  procedureHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  procedureType: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  statusBadge: {
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeCompleted: {
    backgroundColor: "#D1FAE5",
  },
  statusBadgeScheduled: {
    backgroundColor: "#DBEAFE",
  },
  statusBadgePending: {
    backgroundColor: "#FEF3C7",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#111827",
    textTransform: "uppercase",
  },
  procedureDetail: {
    fontSize: 13,
    color: "#6B7280",
    marginTop: 4,
    lineHeight: 18,
  },
  priceContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  priceIcon: {
    fontSize: 12,
    marginRight: 6,
  },
  priceLabel: {
    fontSize: 12,
    fontWeight: "400",
    color: "#6B7280",
    flex: 1,
  },
  priceNote: {
    fontSize: 10,
    fontWeight: "400",
    color: "#9CA3AF",
    fontStyle: "italic",
    marginTop: 2,
  },
  paymentSummaryContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  paymentSummaryTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  paymentRowRemaining: {
    borderBottomWidth: 0,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: "#2563EB",
  },
  paymentLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  paymentValue: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  paymentValuePaid: {
    color: "#10B981",
  },
  paymentValueRemaining: {
    color: "#2563EB",
    fontSize: 18,
  },
});
