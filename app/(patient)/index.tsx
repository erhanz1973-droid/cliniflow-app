import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";
import { useLanguage } from "../../lib/language-context";
import { useDateLocale } from "../../lib/date-locale";
import {
  shouldShowDentalScanReminder,
  clearDentalScanReminder,
} from "../../lib/patientOnboardingStorage";
import { translateProcedureDisplay } from "../../lib/procedureLabels";
import { PrimaryCard } from "../../components/home/PrimaryCard";
import { SecondaryCard } from "../../components/home/SecondaryCard";
import { track } from "../../lib/analytics";

function formatShortDate(v: string | null | undefined, locale: string) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale, { day: "numeric", month: "long" });
}

function formatDate(v: string | null | undefined, locale: string) {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

/** API’de scheduled_at string / scheduledAt ms / scheduled_date — hepsi (treatment-plan ile aynı mantık) */
function resolveProcedureScheduledIso(proc: Record<string, unknown> | null | undefined): string | null {
  if (!proc || typeof proc !== "object") return null;
  const scheduledMs = proc.scheduledAt != null ? Number(proc.scheduledAt) : NaN;
  const scheduledFromMs = Number.isFinite(scheduledMs) ? new Date(scheduledMs).toISOString() : null;
  const sa = proc.scheduled_at;
  const sAt = proc.scheduledAt;
  const sd = proc.scheduled_date;
  return (
    (typeof sa === "string" && sa.trim() ? sa.trim() : null) ||
    (typeof sAt === "string" && sAt.trim() ? sAt.trim() : null) ||
    scheduledFromMs ||
    (typeof sd === "string" && sd.trim() ? sd.trim() : null) ||
    null
  );
}

function formatDateTimeParts(iso: string | null | undefined, locale: string) {
  if (!iso) return { dateStr: null as string | null, timeStr: null as string | null };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { dateStr: null, timeStr: null };
  return {
    dateStr: d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }),
    timeStr: d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
  };
}

function pickNextFromEvents(events: unknown[], nowMs: number): Record<string, unknown> | null {
  if (!Array.isArray(events) || events.length === 0) return null;
  let bestTs = Infinity;
  let best: Record<string, unknown> | null = null;
  for (const raw of events) {
    if (!raw || typeof raw !== "object") continue;
    const ev = raw as Record<string, unknown>;
    let iso =
      (typeof ev.start_at === "string" && ev.start_at.trim() ? ev.start_at.trim() : null) ||
      (typeof ev.startAt === "string" && ev.startAt.trim() ? ev.startAt.trim() : null) ||
      null;
    let ts = iso ? new Date(iso).getTime() : NaN;
    if (!Number.isFinite(ts) && ev.date) {
      const tm = (ev.time as string) || "12:00";
      const ds = String(ev.date).slice(0, 10);
      const m = String(tm).match(/^(\d{1,2}):(\d{2})/);
      const hh = m ? String(m[1]).padStart(2, "0") : "12";
      const mm = m ? m[2] : "00";
      ts = new Date(`${ds}T${hh}:${mm}:00`).getTime();
      if (Number.isFinite(ts)) iso = new Date(ts).toISOString();
    }
    if (!Number.isFinite(ts) || ts < nowMs - 60_000) continue;
    if (ts >= bestTs) continue;
    bestTs = ts;
    const title =
      (ev.title as string) ||
      (ev.procedure as string) ||
      (ev.label as string) ||
      (ev.type as string) ||
      "Randevu";
    best = {
      title,
      type: (ev.type as string) || (ev.procedure as string) || "",
      scheduled_date: iso || new Date(ts).toISOString(),
      status: "SCHEDULED",
      toothId: ev.tooth_number ?? ev.tooth ?? null,
    };
  }
  return best;
}

function useTreatmentTypeLabel() {
  const { t } = useLanguage();
  return (type: string | undefined, fallback: string) =>
    translateProcedureDisplay(t, type, fallback);
}

function useGreeting() {
  const { t } = useLanguage();
  const h = new Date().getHours();
  if (h < 12) return t("home.greetingMorning");
  if (h < 18) return t("home.greetingDay");
  return t("home.greetingEvening");
}

function useStatusLabel() {
  const { t } = useLanguage();
  return (s: string) => {
    switch (String(s || "").toUpperCase()) {
      case "COMPLETED": case "DONE": return t("treatment.status.completed");
      case "IN_PROGRESS": case "ACTIVE": return t("treatment.status.inProgress");
      case "PLANNED": return t("treatment.status.planned");
      case "SCHEDULED": return t("treatment.status.scheduled");
      case "CANCELLED": return t("treatment.status.cancelled");
      default: return s || "—";
    }
  };
}

function statusColor(s: string) {
  switch (String(s || "").toUpperCase()) {
    case "COMPLETED": case "DONE": return "#16a34a";
    case "IN_PROGRESS": return "#2563eb";
    case "PLANNED": return "#f59e0b";
    case "CANCELLED": return "#dc2626";
    default: return "#6b7280";
  }
}

export default function PatientDashboard() {
  const { user, signOut } = useAuth();
  const { t } = useLanguage();
  const locale = useDateLocale();
  const greeting = useGreeting();
  const statusLabel = useStatusLabel();
  const treatmentTypeLabel = useTreatmentTypeLabel();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [treatmentsStale, setTreatmentsStale] = useState(true);
  const snapshotRef = useRef<{
    patientId: string;
    summary: { total: number; done: number; active: number };
    nextAppointment: any;
    recentProcedures: any[];
    healthFormFilled: boolean;
  } | null>(null);
  const [summary, setSummary] = useState({ total: 0, done: 0, active: 0 });
  const [nextAppointment, setNextAppointment] = useState<any>(null);
  const [recentProcedures, setRecentProcedures] = useState<any[]>([]);
  const [healthFormFilled, setHealthFormFilled] = useState(true);
  const [travel, setTravel] = useState<any>(null);
  const [hasClinicMessage, setHasClinicMessage] = useState(false);
  const [inboxSummary, setInboxSummary] = useState({ new_offers: 0, doctor_messages: 0 });
  const [fileCounts, setFileCounts] = useState({ total: 0, xray: 0, image: 0, pdf: 0 });
  const [showDentalReminder, setShowDentalReminder] = useState(false);
  const [isCameraBusy, setIsCameraBusy] = useState(false);

  const [fetchError, setFetchError] = useState(false);
  const patientId = String(user?.patientId || user?.id || "").trim();
  const patientName = String(user?.name || "").trim();
  // Once the patient is attached to a clinic, marketplace features (offers, clinic search) are hidden
  // Check both clinicId (UUID) and clinicCode as either may be set
  const hasClinic = !!(
    String((user as any)?.clinicId || "").trim() ||
    String((user as any)?.clinicCode || "").trim()
  );

  const fetchData = useCallback(async () => {
    if (!user?.token || !patientId) {
      setRefreshing(false);
      setTreatmentsStale(false);
      return;
    }
    const headers = { Authorization: `Bearer ${user.token}`, Accept: "application/json" };

    const snap = snapshotRef.current;
    if (snap?.patientId === patientId) {
      setSummary(snap.summary);
      setNextAppointment(snap.nextAppointment);
      setRecentProcedures(snap.recentProcedures);
      setHealthFormFilled(snap.healthFormFilled);
      setTreatmentsStale(false);
    }

    try {
      // ── Critical data: treatments + health form (show UI as soon as these arrive) ──
      const [treatRes, healthRes] = await Promise.all([
        fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/treatments`, { headers }),
        fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/health`, { headers }).catch(() => null),
      ]);

      const healthJson = healthRes ? await healthRes.json().catch(() => ({})) : {};
      setHealthFormFilled(!!healthJson.isComplete);

      const json = await treatRes.json().catch(() => ({}));
      const teeth: any[] = Array.isArray(json.teeth) ? json.teeth : [];

      let total = 0, done = 0, active = 0;
      const allProcs: any[] = [];
      const now = Date.now();
      let next: any = null;
      let nextTs = Infinity;

      teeth.forEach((tooth: any) => {
        (tooth.procedures || []).forEach((proc: any) => {
          const scheduledIso = resolveProcedureScheduledIso(proc);
          const enriched = {
            ...proc,
            title: proc.title || proc.type || "",
            scheduled_date: scheduledIso,
            type: proc.type,
            toothId: tooth.toothId ? String(tooth.toothId) : null,
          };
          total++;
          const s = String(proc.status || "").toUpperCase();
          if (s === "COMPLETED" || s === "DONE") done++;
          else active++;
          allProcs.push(enriched);
          const terminal = s === "COMPLETED" || s === "DONE" || s === "CANCELLED";
          if (!terminal && scheduledIso) {
            const ts = new Date(scheduledIso).getTime();
            if (Number.isFinite(ts) && ts >= now - 60_000 && ts < nextTs) {
              nextTs = ts;
              next = enriched;
            }
          }
        });
      });

      if (!next) {
        const fromEv = pickNextFromEvents(Array.isArray(json.events) ? json.events : [], now);
        if (fromEv) next = fromEv;
      }

      setSummary({ total, done, active });
      setNextAppointment(next);
      const recentSlice = allProcs
        .filter((p) => p.completed_at || p.scheduled_date)
        .sort((a, b) => new Date(b.completed_at || b.scheduled_date).getTime() - new Date(a.completed_at || a.scheduled_date).getTime())
        .slice(0, 4);
      setRecentProcedures(recentSlice);
      snapshotRef.current = {
        patientId,
        summary: { total, done, active },
        nextAppointment: next,
        recentProcedures: recentSlice,
        healthFormFilled: !!healthJson.isComplete,
      };

      setTreatmentsStale(false);
      setRefreshing(false);

      // ── Secondary data: timeline + files + messages + inbox summary (parallel) ──
      const [timelineRes, filesRes, msgRes, inboxRes] = await Promise.all([
        fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/timeline`, { headers }).catch(() => null),
        fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/files`, { headers }).catch(() => null),
        fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/messages`, { headers }).catch(() => null),
        fetch(`${API_BASE}/api/patient/inbox-summary`, { headers }).catch(() => null),
      ]);

      const timelineJson = timelineRes ? await timelineRes.json().catch(() => ({})) : {};
      const timelineItems: any[] = Array.isArray(timelineJson.items) ? timelineJson.items : [];
      const flights = timelineItems
        .filter((it) => it?.type === "flight")
        .map((it) => it?.metadata?.flight || it?.metadata || {})
        .filter(Boolean);
      const hotelItem    = timelineItems.find((it) => it?.type === "hotel");
      const transferItem = timelineItems.find((it) => it?.type === "transfer");
      setTravel({
        flights,
        hotel:         hotelItem?.metadata?.hotel    || hotelItem?.metadata    || null,
        airportPickup: transferItem?.metadata?.airportPickup || transferItem?.metadata || null,
      });

      const filesJson = filesRes ? await filesRes.json().catch(() => ({})) : {};
      const allFiles: any[] = Array.isArray(filesJson.files) ? filesJson.files : [];
      const imgCount = allFiles.filter((f: any) => f.fileType === "image").length;
      setFileCounts({
        total: allFiles.length,
        xray:  allFiles.filter((f: any) => f.fileType === "xray").length,
        image: imgCount,
        pdf:   allFiles.filter((f: any) => f.fileType === "pdf" || f.mimeType === "application/pdf").length,
      });
      if (imgCount > 0 && patientId) {
        await clearDentalScanReminder(patientId);
        setShowDentalReminder(false);
      }

      const msgJson = msgRes ? await msgRes.json().catch(() => ({})) : {};
      const msgs = Array.isArray(msgJson.messages) ? msgJson.messages : [];
      setHasClinicMessage(msgs.some((m: any) => m.from === "CLINIC"));

      const inboxJson = inboxRes ? await inboxRes.json().catch(() => ({})) : {};
      setInboxSummary({
        new_offers:      inboxJson.new_offers      || 0,
        doctor_messages: inboxJson.doctor_messages || 0,
      });

    } catch {
      setTreatmentsStale(false);
      setFetchError(true);
    } finally {
      setRefreshing(false);
    }
  }, [user?.token, patientId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Re-fetch only the inbox badge when screen comes back into focus
  // (e.g. patient returns from my-requests after viewing offers)
  const refreshInbox = useCallback(async () => {
    if (!user?.token || !patientId) return;
    const headers = { Authorization: `Bearer ${user.token}`, Accept: "application/json" };
    try {
      const inboxRes = await fetch(`${API_BASE}/api/patient/inbox-summary`, { headers }).catch(() => null);
      const inboxJson = inboxRes ? await inboxRes.json().catch(() => ({})) : {};
      setInboxSummary({
        new_offers:      inboxJson.new_offers      || 0,
        doctor_messages: inboxJson.doctor_messages || 0,
      });
    } catch {}
  }, [user?.token, patientId]);

  const goToJoinClinic = useCallback(() => {
    track("home_join_clinic_click");
    router.push({
      pathname: "/(patient)/profile" as const,
      params: { openJoinModal: "1" },
    } as any);
  }, [router]);

  const goToClinicSearch = useCallback(() => {
    track("home_clinic_search_click");
    router.push("/clinic-onboarding" as any);
  }, [router]);

  const goToCamera = useCallback(() => {
    setIsCameraBusy(true);
    track("home_camera_click");
    router.push({ pathname: "/(patient)/dental-camera" as const } as any);
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      setIsCameraBusy(false);
      refreshInbox();
    }, [refreshInbox])
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!patientId) {
        setShowDentalReminder(false);
        return;
      }
      const show = await shouldShowDentalScanReminder(patientId);
      if (!cancelled) setShowDentalReminder(show);
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const progress = useMemo(
    () => (summary.total > 0 ? summary.done / summary.total : 0),
    [summary.total, summary.done]
  );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setFetchError(false); setRefreshing(true); fetchData(); }} tintColor="#2563eb" />}
    >
      {/* FETCH ERROR BANNER */}
      {fetchError && !refreshing && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>⚠️ {t("home.fetchError")}</Text>
        </View>
      )}

      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}</Text>
          <Text style={styles.name}>{patientName}</Text>
        </View>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{(patientName || "?").charAt(0).toUpperCase()}</Text>
        </View>
      </View>

      {/* HEALTH FORM REMINDER */}
      {!healthFormFilled && (
        <TouchableOpacity
          style={styles.healthBanner}
          onPress={() => router.push("/(patient)/medical-form" as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.healthBannerIcon}>📋</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.healthBannerTitle}>{t("home.healthFormTitle")}</Text>
            <Text style={styles.healthBannerSub}>{t("home.healthFormMsg")}</Text>
          </View>
          <Text style={styles.healthBannerArrow}>›</Text>
        </TouchableOpacity>
      )}

      {showDentalReminder && fileCounts.image === 0 && (
        <TouchableOpacity
          style={styles.dentalBanner}
          onPress={() => router.push("/(patient)/files" as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.dentalBannerIcon}>📸</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.dentalBannerTitle}>{t("home.dentalScanReminderTitle")}</Text>
            <Text style={styles.dentalBannerSub}>{t("home.dentalScanReminderSub")}</Text>
          </View>
          <Text style={styles.dentalBannerArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* CLINIC MESSAGE SHORTCUT */}
      {hasClinicMessage && (
        <TouchableOpacity
          style={styles.msgBanner}
          onPress={() => router.push("/(patient)/messages" as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.msgBannerIcon}>💬</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.msgBannerTitle}>{t("home.clinicMessage")}</Text>
            <Text style={styles.msgBannerSub}>{t("home.clinicMessageSub")}</Text>
          </View>
          <Text style={styles.msgBannerArrow}>›</Text>
        </TouchableOpacity>
      )}

      {/* NEW DOCTOR OFFER BANNER — hidden once patient has joined a clinic */}
      {!hasClinic && inboxSummary.new_offers > 0 && (
        <TouchableOpacity
          style={styles.offerBanner}
          onPress={() => router.push("/my-requests" as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.offerBannerIcon}>🦷</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.offerBannerTitle}>
              {inboxSummary.new_offers === 1
                ? t("home.newOfferSingle")
                : (t("home.newOfferMultiple") || "").replace("{n}", String(inboxSummary.new_offers))}
            </Text>
            <Text style={styles.offerBannerSub}>{t("home.tapToViewOffers")}</Text>
          </View>
          <View style={styles.offerBannerBadge}>
            <Text style={styles.offerBannerBadgeText}>{inboxSummary.new_offers}</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* NEW DOCTOR MESSAGE BANNER — hidden once patient has joined a clinic */}
      {!hasClinic && inboxSummary.new_offers === 0 && inboxSummary.doctor_messages > 0 && (
        <TouchableOpacity
          style={styles.docMsgBanner}
          onPress={() => router.push("/my-requests" as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.docMsgBannerIcon}>💬</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.docMsgBannerTitle}>{t("home.doctorReplied")}</Text>
            <Text style={styles.docMsgBannerSub}>{t("home.tapToViewMessages")}</Text>
          </View>
          <View style={styles.docMsgBannerDot} />
        </TouchableOpacity>
      )}

      {/* Primary CTA: foto + klinik (banner’ların altında, quick icon grid üstünde) */}
      <View style={styles.ctaSection}>
        <PrimaryCard
          title={t("home.ctaDentalPhoto")}
          subtitle={t("home.ctaDentalPhotoSub")}
          icon="camera"
          accentColor="#2563EB"
          disabled={isCameraBusy}
          loading={isCameraBusy}
          onPress={goToCamera}
        />
        <View style={styles.ctaSecondaryRow}>
          <SecondaryCard
            title={t("home.ctaFindClinic")}
            icon="search"
            accentColor="#2563EB"
            onPress={goToClinicSearch}
          />
          <SecondaryCard
            title={t("home.ctaJoinWithCode")}
            icon="key"
            accentColor="#2563EB"
            onPress={goToJoinClinic}
          />
        </View>
      </View>

      {/* QUICK ACCESS CARDS */}
      <View style={styles.quickRow}>
        <TouchableOpacity style={styles.quickCard} onPress={() => router.push("/(patient)/treatment-plan" as any)} activeOpacity={0.8}>
          <Text style={styles.quickIcon}>🦷</Text>
          <Text style={styles.quickLabel}>{t("nav.treatment")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickCard} onPress={() => router.push("/(patient)/messages" as any)} activeOpacity={0.8}>
          <Text style={styles.quickIcon}>💬</Text>
          <Text style={styles.quickLabel}>{t("nav.messages")}</Text>
        </TouchableOpacity>
        {/* Offers quick card — hidden after patient joins a clinic */}
        {!hasClinic && (
          <TouchableOpacity
            style={[styles.quickCard, (inboxSummary.new_offers > 0 || inboxSummary.doctor_messages > 0) && styles.quickCardAlert]}
            onPress={() => router.push("/my-requests" as any)}
            activeOpacity={0.8}
          >
            {(inboxSummary.new_offers > 0 || inboxSummary.doctor_messages > 0) && (
              <View style={styles.quickBadge}>
                <Text style={styles.quickBadgeText}>
                  {inboxSummary.new_offers || inboxSummary.doctor_messages}
                </Text>
              </View>
            )}
            <Text style={styles.quickIcon}>📩</Text>
            <Text style={styles.quickLabel}>{t("home.quickOffers")}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.quickCard} onPress={() => router.push("/(patient)/timeline" as any)} activeOpacity={0.8}>
          <Text style={styles.quickIcon}>✈️</Text>
          <Text style={styles.quickLabel}>{t("nav.journey")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickCard} onPress={() => router.push("/(patient)/medical-form" as any)} activeOpacity={0.8}>
          <Text style={styles.quickIcon}>📋</Text>
          <Text style={styles.quickLabel}>{t("nav.health")}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickCard} onPress={() => router.push("/(patient)/files" as any)} activeOpacity={0.8}>
          <Text style={styles.quickIcon}>📁</Text>
          <Text style={styles.quickLabel}>{t("nav.files")}</Text>
        </TouchableOpacity>
      </View>

      {/* FILES CARD */}
      {fileCounts.total > 0 && (
        <TouchableOpacity
          style={styles.section}
          onPress={() => router.push("/(patient)/files" as any)}
          activeOpacity={0.85}
        >
          <Text style={styles.sectionTitle}>{t("files.title")}</Text>
          <View style={[styles.card, { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }]}>
            <View style={styles.fileTypeItem}>
              <Text style={styles.fileTypeIcon}>🩻</Text>
              <Text style={styles.fileTypeNum}>{fileCounts.xray}</Text>
              <Text style={styles.fileTypeLabel}>{t("files.filterXray")}</Text>
            </View>
            <View style={styles.fileDivider} />
            <View style={styles.fileTypeItem}>
              <Text style={styles.fileTypeIcon}>🖼️</Text>
              <Text style={styles.fileTypeNum}>{fileCounts.image}</Text>
              <Text style={styles.fileTypeLabel}>{t("files.filterPhotos")}</Text>
            </View>
            <View style={styles.fileDivider} />
            <View style={styles.fileTypeItem}>
              <Text style={styles.fileTypeIcon}>📄</Text>
              <Text style={styles.fileTypeNum}>{fileCounts.pdf}</Text>
              <Text style={styles.fileTypeLabel}>{t("files.filterDocs")}</Text>
            </View>
            <Text style={[styles.cardArrow, { marginLeft: 8 }]}>›</Text>
          </View>
        </TouchableOpacity>
      )}

      {/* NEXT APPOINTMENT */}
      {nextAppointment ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("home.nextAppointment")}</Text>
          <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: "#2563eb" }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
              <Text style={styles.apptTitle}>
                {treatmentTypeLabel(nextAppointment.type || nextAppointment.rawType, nextAppointment.title)}
              </Text>
              <View style={[styles.badge, { backgroundColor: statusColor(nextAppointment.status) + "22" }]}>
                <Text style={[styles.badgeText, { color: statusColor(nextAppointment.status) }]}>
                  {statusLabel(nextAppointment.status)}
                </Text>
              </View>
            </View>
            {(() => {
              const iso = nextAppointment.scheduled_date;
              const { dateStr, timeStr } = formatDateTimeParts(iso, locale);
              return (
                <>
                  <Text style={styles.apptDate}>
                    📅 {dateStr || formatDate(iso, locale)}
                  </Text>
                  {timeStr ? (
                    <Text style={styles.apptTime}>🕐 {timeStr}</Text>
                  ) : null}
                  {nextAppointment.toothId ? (
                    <Text style={styles.apptMeta}>🦷 {t("common.tooth")} {nextAppointment.toothId}</Text>
                  ) : null}
                </>
              );
            })()}
          </View>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("home.nextAppointment")}</Text>
          <View style={styles.card}>
            <Text style={styles.emptyText}>{t("home.noAppointment")}</Text>
          </View>
        </View>
      )}

      {/* MY VISIT WIDGET */}
      {(() => {
        const flights: any[] = Array.isArray(travel?.flights) ? travel.flights : [];
        const hotel = travel?.hotel?.name ? travel.hotel : null;
        const pickup = travel?.airportPickup?.name ? travel.airportPickup : null;
        const hasTravel = flights.length > 0 || !!hotel || !!pickup;
        if (!hasTravel) return null;

        const arrival = flights.find((f: any) => f.type === "ARRIVAL" || f.type === "OUTBOUND");
        const departure = flights.find((f: any) => f.type === "DEPARTURE" || f.type === "RETURN");

        return (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("home.myVisit")}</Text>
            <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: "#2563eb", gap: 10 }]}>
              {arrival && (
                <View style={styles.travelRow}>
                  <Text style={styles.travelIcon}>✈️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.travelLabel}>{t("home.arrivalFlight")}</Text>
                    <Text style={styles.travelValue}>{arrival.from} → {arrival.to}</Text>
                    {(arrival.date || arrival.time) && (
                      <Text style={styles.travelMeta}>
                        {formatShortDate(arrival.date, locale)}{arrival.time ? " — " + arrival.time : ""}
                      </Text>
                    )}
                  </View>
                </View>
              )}
              {departure && (
                <View style={styles.travelRow}>
                  <Text style={styles.travelIcon}>✈️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.travelLabel}>{t("home.departureFlight")}</Text>
                    <Text style={styles.travelValue}>{departure.from} → {departure.to}</Text>
                    {(departure.date || departure.time) && (
                      <Text style={styles.travelMeta}>
                        {formatShortDate(departure.date, locale)}{departure.time ? " — " + departure.time : ""}
                      </Text>
                    )}
                  </View>
                </View>
              )}
              {pickup && (
                <View style={styles.travelRow}>
                  <Text style={styles.travelIcon}>🚗</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.travelLabel}>{t("home.airportPickup")}</Text>
                    <Text style={styles.travelValue}>{t("home.driver")}: {pickup.name}</Text>
                    {pickup.vehicle && <Text style={styles.travelMeta}>{pickup.vehicle}</Text>}
                  </View>
                </View>
              )}
              {hotel && !arrival && !departure && !pickup && (
                <View style={styles.travelRow}>
                  <Text style={styles.travelIcon}>🏨</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.travelLabel}>{t("home.hotel")}</Text>
                    <Text style={styles.travelValue}>{hotel.name}</Text>
                    {(hotel.checkIn || hotel.checkOut) && (
                      <Text style={styles.travelMeta}>
                        {formatShortDate(hotel.checkIn, locale)}{hotel.checkOut ? " – " + formatShortDate(hotel.checkOut, locale) : ""}
                      </Text>
                    )}
                  </View>
                </View>
              )}
              <TouchableOpacity
                style={styles.travelDetailBtn}
                onPress={() => router.push("/(patient)/timeline" as any)}
                activeOpacity={0.8}
              >
                <Text style={styles.travelDetailBtnText}>{t("home.viewDetails")} →</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      {/* TREATMENT PROGRESS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t("home.treatmentProgress")}</Text>
        <View style={styles.card}>
          {treatmentsStale && (
            <View style={styles.inlineLoadRow}>
              <ActivityIndicator size="small" color="#2563eb" />
              <Text style={styles.inlineLoadText}>{t("common.loading")}</Text>
            </View>
          )}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: "#2563eb" }]}>{summary.total}</Text>
              <Text style={styles.statLabel}>{t("home.total")}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: "#ea580c" }]}>{summary.active}</Text>
              <Text style={styles.statLabel}>{t("home.activeStat")}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statNum, { color: "#16a34a" }]}>{summary.done}</Text>
              <Text style={styles.statLabel}>{t("home.completedStat")}</Text>
            </View>
          </View>
          {summary.total > 0 && (
            <View style={styles.progressSection}>
              <View style={styles.progressRow}>
                <Text style={styles.progressLabel}>{t("home.completionRate")}</Text>
                <Text style={styles.progressPct}>{Math.round(progress * 100)}%</Text>
              </View>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
            </View>
          )}
        </View>
      </View>

      {/* RECENT PROCEDURES */}
      {recentProcedures.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("home.recentProcedures")}</Text>
          <View style={styles.card}>
            {recentProcedures.map((proc, i) => (
              <View key={`rp-${proc.id}-${i}`} style={[styles.procRow, i < recentProcedures.length - 1 && styles.procBorder]}>
                <View style={[styles.procDot, { backgroundColor: statusColor(proc.status) }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.procTitle}>{treatmentTypeLabel(proc.type, proc.title)}</Text>
                  <Text style={styles.procMeta}>{formatDate(proc.completed_at || proc.scheduled_date, locale)}</Text>
                </View>
                <View style={[styles.badge, { backgroundColor: statusColor(proc.status) + "22" }]}>
                  <Text style={[styles.badgeText, { color: statusColor(proc.status) }]}>
                    {statusLabel(proc.status)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ctaSection: {
    padding: 16,
    paddingBottom: 8,
    backgroundColor: "#f3f4f6",
  },
  ctaSecondaryRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f3f4f6" },
  errorBanner: {
    backgroundColor: "#fef2f2", borderBottomWidth: 1, borderBottomColor: "#fecaca",
    paddingHorizontal: 16, paddingVertical: 10,
  },
  errorBannerText: { fontSize: 13, color: "#b91c1c", fontWeight: "600" },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#fff", paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
  },
  greeting: { fontSize: 13, color: "#6b7280" },
  name: { fontSize: 20, fontWeight: "700", color: "#111827", marginTop: 2 },
  avatar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: "#2563eb",
    justifyContent: "center", alignItems: "center",
  },
  avatarText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: "#374151", marginBottom: 8 },
  card: {
    backgroundColor: "#fff", borderRadius: 12, padding: 16,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  apptTitle: { fontSize: 15, fontWeight: "700", color: "#111827", flex: 1 },
  apptDate: { fontSize: 13, color: "#6b7280", marginTop: 8 },
  apptTime: { fontSize: 13, color: "#374151", fontWeight: "600", marginTop: 2 },
  apptMeta: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  emptyText: { color: "#9ca3af", fontSize: 13, textAlign: "center", paddingVertical: 8 },
  statsRow: { flexDirection: "row", justifyContent: "space-between" },
  statItem: { alignItems: "center", flex: 1 },
  statNum: { fontSize: 24, fontWeight: "800" },
  statLabel: { fontSize: 11, color: "#6b7280", marginTop: 2 },
  progressSection: { marginTop: 16 },
  progressRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  progressLabel: { fontSize: 12, color: "#6b7280" },
  progressPct: { fontSize: 12, fontWeight: "700", color: "#111827" },
  progressBar: { height: 8, backgroundColor: "#e5e7eb", borderRadius: 4, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: "#2563eb", borderRadius: 4 },
  inlineLoadRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 12,
    marginBottom: 4,
  },
  inlineLoadText: { fontSize: 13, color: "#6b7280" },
  procRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 10 },
  procBorder: { borderBottomWidth: 1, borderBottomColor: "#f3f4f6" },
  procDot: { width: 8, height: 8, borderRadius: 4 },
  procTitle: { fontSize: 13, fontWeight: "600", color: "#111827" },
  procMeta: { fontSize: 11, color: "#9ca3af", marginTop: 2 },
  healthBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fcd34d",
    borderRadius: 12, marginHorizontal: 16, marginTop: 16, padding: 14,
  },
  healthBannerIcon: { fontSize: 24 },
  healthBannerTitle: { fontSize: 14, fontWeight: "700", color: "#92400e", marginBottom: 2 },
  healthBannerSub: { fontSize: 12, color: "#b45309", lineHeight: 17 },
  healthBannerArrow: { fontSize: 22, color: "#d97706", fontWeight: "700" },

  dentalBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#6ee7b7",
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 14,
  },
  dentalBannerIcon: { fontSize: 24 },
  dentalBannerTitle: { fontSize: 14, fontWeight: "700", color: "#065f46", marginBottom: 2 },
  dentalBannerSub: { fontSize: 12, color: "#047857", lineHeight: 17 },
  dentalBannerArrow: { fontSize: 22, color: "#059669", fontWeight: "700" },

  travelRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  travelIcon: { fontSize: 20, width: 28, textAlign: "center", marginTop: 1 },
  travelLabel: { fontSize: 11, color: "#6b7280", fontWeight: "600", textTransform: "uppercase", marginBottom: 1 },
  travelValue: { fontSize: 14, fontWeight: "700", color: "#111827" },
  travelMeta:  { fontSize: 12, color: "#6b7280", marginTop: 1 },
  travelDetailBtn: {
    marginTop: 4, backgroundColor: "#2563eb", borderRadius: 8,
    paddingVertical: 10, alignItems: "center",
  },
  travelDetailBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  msgBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe",
    borderRadius: 12, marginHorizontal: 16, marginTop: 16, padding: 14,
  },
  msgBannerIcon:  { fontSize: 24 },
  msgBannerTitle: { fontSize: 14, fontWeight: "700", color: "#1d4ed8", marginBottom: 2 },
  msgBannerSub:   { fontSize: 12, color: "#3b82f6", lineHeight: 17 },
  msgBannerArrow: { fontSize: 22, color: "#3b82f6", fontWeight: "700" },

  quickRow: {
    flexDirection: "row", paddingHorizontal: 12, paddingVertical: 14,
    gap: 8, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6",
  },
  quickCard: {
    flex: 1, alignItems: "center", backgroundColor: "#f8faff",
    borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4,
    borderWidth: 1, borderColor: "#e5e7eb",
  },
  quickCardAlert: {
    backgroundColor: "#fff7ed", borderColor: "#fdba74",
  },
  quickIcon:  { fontSize: 22, marginBottom: 4 },
  quickLabel: { fontSize: 10, fontWeight: "600", color: "#374151", textAlign: "center" },
  quickBadge: {
    position: "absolute", top: 4, right: 6,
    backgroundColor: "#ef4444", borderRadius: 8,
    minWidth: 16, height: 16, alignItems: "center", justifyContent: "center",
    paddingHorizontal: 3,
  },
  quickBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },

  // Offer notification banner
  offerBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff7ed", borderWidth: 1, borderColor: "#fdba74",
    borderRadius: 12, marginHorizontal: 16, marginTop: 16, padding: 14,
  },
  offerBannerIcon:  { fontSize: 24 },
  offerBannerTitle: { fontSize: 14, fontWeight: "700", color: "#92400e", marginBottom: 2 },
  offerBannerSub:   { fontSize: 12, color: "#b45309", lineHeight: 17 },
  offerBannerBadge: {
    backgroundColor: "#ea580c", borderRadius: 12, minWidth: 24, height: 24,
    alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
  },
  offerBannerBadgeText: { color: "#fff", fontSize: 13, fontWeight: "800" },

  // Doctor message banner
  docMsgBanner: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#86efac",
    borderRadius: 12, marginHorizontal: 16, marginTop: 16, padding: 14,
  },
  docMsgBannerIcon:  { fontSize: 24 },
  docMsgBannerTitle: { fontSize: 14, fontWeight: "700", color: "#166534", marginBottom: 2 },
  docMsgBannerSub:   { fontSize: 12, color: "#15803d", lineHeight: 17 },
  docMsgBannerDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: "#16a34a",
  },

  cardArrow: { fontSize: 20, color: "#2563eb", fontWeight: "700" },

  fileTypeItem: { flex: 1, alignItems: "center", paddingVertical: 4 },
  fileTypeIcon: { fontSize: 24, marginBottom: 4 },
  fileTypeNum:  { fontSize: 20, fontWeight: "800", color: "#111827", lineHeight: 24 },
  fileTypeLabel: { fontSize: 10, color: "#6b7280", fontWeight: "600", marginTop: 2, textAlign: "center" },
  fileDivider:  { width: 1, height: 48, backgroundColor: "#f3f4f6" },
});
