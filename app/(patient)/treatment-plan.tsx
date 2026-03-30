import React, { useCallback, useEffect, useState, useRef } from "react";
import { useFocusEffect } from "expo-router";
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, Image, useWindowDimensions,
} from "react-native";
import { useAuth } from "../../lib/auth";
import { API_BASE } from "../../lib/api";
import { useLanguage } from "../../lib/language-context";
import { useDateLocale } from "../../lib/date-locale";
import { getIcd10Tr } from "../../lib/icd10-tr";
import { getIcd10Ru } from "../../lib/icd10-ru";
import { getIcd10Ka } from "../../lib/icd10-ka";

const TREATMENTS_POLL_INTERVAL_MS = 12000;

type Procedure = {
  id: string;
  title: string;
  rawType?: string;
  status: string;
  scheduled_date: string | null;
  completed_at: string | null;
  toothId?: string | null;
  chair?: string | null;
  doctorName?: string | null;
  /** Sunucudan gelen satır fiyatı (klinik katalog veya kayıtlı tutar) */
  price?: number | null;
  currency?: string | null;
};

type Diagnosis = {
  id: string;
  tooth_number?: string | number | null;
  icd10_code?: string | null;
  icd10_description?: string | null;
  notes?: string | null;
};

function pickNonEmptyStr(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

/**
 * Yalnızca "YYYY-MM-DD" gelince Date parse UTC gece yarısı oluyor; gösterim için öğlen yerel kullan.
 */
function normalizeIsoStringForParsing(raw: string): string {
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T12:00:00`;
  return s;
}

/** API date + time ayrı döndüğünde tek ISO (yerel) */
function mergeDateTimeFieldsToIso(
  dateRaw: unknown,
  timeRaw: unknown
): string | null {
  if (dateRaw == null || String(dateRaw).trim() === "") return null;
  const ds = String(dateRaw).trim();
  const datePart = ds.length >= 10 ? ds.slice(0, 10) : ds;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const t = Date.parse(ds);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  let hh = "12";
  let mm = "00";
  let ss = "00";
  if (timeRaw != null && String(timeRaw).trim() !== "") {
    const tm = String(timeRaw).trim();
    const m = tm.match(/(\d{1,2})[.:](\d{2})(?::(\d{2}))?/);
    if (m) {
      const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
      hh = String(h).padStart(2, "0");
      mm = m[2];
      if (m[3]) ss = m[3];
    }
  }
  const local = new Date(`${datePart}T${hh}:${mm}:${ss}`);
  if (!Number.isFinite(local.getTime())) return null;
  return local.toISOString();
}

function mergeProcedureDateTimeFromParts(proc: Record<string, unknown>): string | null {
  const d =
    proc.date ??
    proc.appointment_date ??
    proc.scheduled_date_only ??
    proc.scheduledDate ??
    proc.scheduled_day ??
    proc.scheduled_date;
  const t =
    proc.time ??
    proc.appointment_time ??
    proc.scheduled_time ??
    proc.time_slot ??
    proc.slot_time;
  return mergeDateTimeFieldsToIso(d, t);
}

function mergeCompletedDateTimeFromParts(proc: Record<string, unknown>): string | null {
  const d = proc.completed_date ?? proc.completedDate;
  const t = proc.completed_time ?? proc.completedTime;
  if (!d) return null;
  return mergeDateTimeFieldsToIso(d, t);
}

function strField(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function extractDoctorName(proc: Record<string, unknown>): string | null {
  const d = proc.doctor;
  const meta =
    proc.meta && typeof proc.meta === "object" ? (proc.meta as Record<string, unknown>) : null;
  const fromObj =
    d && typeof d === "object"
      ? pickNonEmptyStr(
          (d as Record<string, unknown>).full_name,
          (d as Record<string, unknown>).name,
          (d as Record<string, unknown>).display_name
        )
      : null;
  return (
    pickNonEmptyStr(
      strField(proc["doctorName"]),
      strField(proc["doctor_name"]),
      strField(proc["assigned_doctor_name"]),
      strField(proc["assignedDoctorName"]),
      strField(proc["AssignedDoctorName"]),
      strField(proc.doctor_display_name),
      strField(proc.primary_doctor_name),
      strField(proc.last_assigned_doctor_name),
      strField(meta?.doctor_name),
      strField(meta?.assigned_doctor_name),
      typeof d === "string" ? strField(d) : null
    ) || fromObj
  );
}

/** API + JSON’dan gelen düz isim; zaten ünvanlıysa tekrar ekleme */
function formatDoctorTitle(name: string | null | undefined, titlePrefix: string): string {
  const s = String(name || "").trim();
  if (!s) return "";
  if (/^(dr\.?|doç\.?|dç\.?|prof\.?|др\.?|დრ\.?)\s/i.test(s)) return s;
  const p = String(titlePrefix || "").trim();
  if (!p) return s;
  return p.endsWith(".") ? `${p} ${s}` : `${p}. ${s}`;
}

function extractChair(proc: Record<string, unknown>): string | null {
  const meta = proc.meta && typeof proc.meta === "object" ? (proc.meta as Record<string, unknown>) : null;
  return pickNonEmptyStr(
    proc.chair,
    proc.chair_number,
    proc.chair_no,
    proc.chairNumber,
    proc.chair_label,
    meta?.chair,
    meta?.chair_number,
    meta?.chairNo
  );
}

/** Tek ISO anından kartta gösterilecek tarih + saat (aynı an) */
function formatDateTimeParts(iso: string | null | undefined, locale: string) {
  if (!iso) return { dateStr: null as string | null, timeStr: null as string | null };
  const d = new Date(normalizeIsoStringForParsing(String(iso)));
  if (isNaN(d.getTime())) return { dateStr: null, timeStr: null };
  return {
    dateStr: d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" }),
    timeStr: d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
  };
}

function pickProcedureWhenIso(proc: Procedure): string | null {
  const st = String(proc.status || "").toUpperCase();
  const done = st === "COMPLETED" || st === "DONE";
  if (done) {
    return proc.completed_at || proc.scheduled_date || null;
  }
  return proc.scheduled_date || proc.completed_at || null;
}

type PriceEntry = { price: number; currency: string };

function formatMoney(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.length === 3 ? currency : "TRY",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
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
    case "IN_PROGRESS": case "ACTIVE": return "#ea580c";
    case "SCHEDULED": return "#2563eb";
    case "PLANNED": return "#6b7280";
    case "CANCELLED": return "#dc2626";
    default: return "#6b7280";
  }
}

function SectionHeader({ title, count, color }: { title: string; count: number; color: string }) {
  return (
    <View style={sectionHeaderStyles.row}>
      <View style={[sectionHeaderStyles.dot, { backgroundColor: color }]} />
      <Text style={sectionHeaderStyles.title}>{title}</Text>
      <View style={[sectionHeaderStyles.badge, { backgroundColor: color + "22" }]}>
        <Text style={[sectionHeaderStyles.badgeText, { color }]}>{count}</Text>
      </View>
    </View>
  );
}

const sectionHeaderStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", marginBottom: 10, marginTop: 20 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  title: { fontSize: 14, fontWeight: "700", color: "#374151", flex: 1, textTransform: "uppercase", letterSpacing: 0.5 },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: "700" },
});

function ProcedureCard({
  proc,
  priceByType,
  pricesVisible,
}: {
  proc: Procedure;
  priceByType: Record<string, PriceEntry>;
  pricesVisible: boolean;
}) {
  const { t, currentLanguage } = useLanguage();
  const locale = useDateLocale();
  const statusLabel = useStatusLabel();
  const color = statusColor(proc.status);
  const whenIso = pickProcedureWhenIso(proc);
  const { dateStr, timeStr } = formatDateTimeParts(whenIso || undefined, locale);
  const normalized = proc.rawType ? String(proc.rawType).trim().toUpperCase().replace(/\s+/g, "_") : null;
  const typeKey = normalized ? `treatment.type.${normalized}` : null;
  const typeLabel = typeKey ? t(typeKey) : null;
  const displayTitle = (typeLabel && typeLabel !== typeKey) ? typeLabel : (proc.title || proc.rawType || "—");

  const typeForPrice = proc.rawType ? String(proc.rawType).trim().toUpperCase() : "";
  const rawLine = proc.price ?? undefined;
  const lineNum = rawLine != null ? Number(rawLine) : NaN;
  const fromLine =
    Number.isFinite(lineNum) && lineNum > 0
      ? { price: lineNum, currency: String(proc.currency || "TRY").trim() || "TRY" }
      : null;
  const fromMap = typeForPrice && priceByType[typeForPrice] ? priceByType[typeForPrice] : null;
  const priceEntry = fromLine || fromMap;

  const L =
    currentLanguage === "tr"
      ? {
          procedure: "İşlem",
          estPrice: "Tahmini fiyat",
          toothNo: "Diş no",
          date: "Tarih",
          time: "Saat",
          chair: "Sandalye",
          doctor: "Hekim",
          approxHint: "(tahmini)",
        }
      : {
          procedure: "Procedure",
          estPrice: "Est. price (approx.)",
          toothNo: "Tooth",
          date: "Date",
          time: "Time",
          chair: "Chair",
          doctor: "Doctor",
          approxHint: "(approx.)",
        };

  const dash = "—";
  const doctorNotAssigned = t("treatment.doctorNotAssigned");
  const doctorDisplay =
    formatDoctorTitle(proc.doctorName, t("treatment.doctorTitlePrefix")) || doctorNotAssigned;

  return (
    <View style={[styles.card, { borderLeftColor: color, borderLeftWidth: 4 }]}>
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }} />
        <View style={[styles.badge, { backgroundColor: color + "22" }]}>
          <Text style={[styles.badgeText, { color }]}>{statusLabel(proc.status)}</Text>
        </View>
      </View>

      <View style={styles.cardDetails}>
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>{L.procedure}</Text>
          <Text style={styles.detailValue} numberOfLines={3}>{displayTitle || dash}</Text>
        </View>
        {pricesVisible && priceEntry ? (
          <View style={styles.detailBlock}>
            <Text style={styles.detailLabel}>{L.estPrice}</Text>
            <Text style={[styles.detailValue, styles.detailPrice]}>
              {formatMoney(priceEntry.price, priceEntry.currency)}{" "}
              <Text style={styles.detailHint}>{L.approxHint}</Text>
            </Text>
          </View>
        ) : null}
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>{L.toothNo}</Text>
          <Text style={styles.detailValue}>{proc.toothId ? String(proc.toothId) : dash}</Text>
        </View>
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>{L.date}</Text>
          <Text style={styles.detailValue}>{dateStr || dash}</Text>
        </View>
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>{L.time}</Text>
          <Text style={styles.detailValue}>{timeStr || dash}</Text>
        </View>
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>{L.chair}</Text>
          <Text style={styles.detailValue}>{proc.chair ? String(proc.chair) : dash}</Text>
        </View>
        <View style={styles.detailBlock}>
          <Text style={styles.detailLabel}>{L.doctor}</Text>
          <Text style={styles.detailValue}>{doctorDisplay}</Text>
        </View>
      </View>
    </View>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <View style={styles.emptyCard}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function DiagnosisSection({ diagnoses }: { diagnoses: Diagnosis[] }) {
  const { t, currentLanguage } = useLanguage();

  if (diagnoses.length === 0) return null;

  // Group by tooth_number
  const grouped = new Map<string, Diagnosis[]>();
  for (const d of diagnoses) {
    const key = d.tooth_number ? String(d.tooth_number) : "__general__";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(d);
  }

  return (
    <View style={diagStyles.section}>
      <View style={diagStyles.header}>
        <Text style={diagStyles.headerIcon}>🦷</Text>
        <Text style={diagStyles.headerTitle}>{t("treatment.diagnosesSection")}</Text>
        <View style={diagStyles.headerBadge}>
          <Text style={diagStyles.headerBadgeText}>{diagnoses.length}</Text>
        </View>
      </View>

      {Array.from(grouped.entries()).map(([tooth, items]) => (
        <View key={tooth} style={diagStyles.card}>
          {tooth !== "__general__" ? (
            <View style={diagStyles.toothRow}>
              <View style={diagStyles.toothBadge}>
                <Text style={diagStyles.toothBadgeText}>{t("treatment.toothLabel")} {tooth}</Text>
              </View>
            </View>
          ) : (
            <View style={diagStyles.toothRow}>
              <View style={diagStyles.toothBadge}>
                <Text style={diagStyles.toothBadgeText}>{t("treatment.generalDiagnoses")}</Text>
              </View>
            </View>
          )}
          {items.map((d, i) => (
            <View
              key={`${tooth}-d-${i}-${String(d.id || "")}-${String(d.icd10_code || "")}`}
              style={[diagStyles.diagRow, i > 0 && diagStyles.diagRowBorder]}
            >
              {d.icd10_code ? (
                <Text style={diagStyles.codeChip}>{d.icd10_code}</Text>
              ) : null}
              <Text style={diagStyles.desc} numberOfLines={2}>
                {currentLanguage === "tr"
                  ? getIcd10Tr(d.icd10_code, d.icd10_description)
                  : currentLanguage === "ru"
                  ? getIcd10Ru(d.icd10_code, d.icd10_description)
                  : currentLanguage === "ka"
                  ? getIcd10Ka(d.icd10_code, d.icd10_description)
                  : (d.icd10_description || d.notes || "—")}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const diagStyles = StyleSheet.create({
  section: { marginBottom: 8 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    marginTop: 20,
  },
  headerIcon: { fontSize: 16, marginRight: 6 },
  headerTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#374151",
    flex: 1,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  headerBadge: {
    backgroundColor: "#e0f2fe",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  headerBadgeText: { fontSize: 12, fontWeight: "700", color: "#0284c7" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#0284c7",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  toothRow: { marginBottom: 8 },
  toothBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#e0f2fe",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  toothBadgeText: { fontSize: 12, fontWeight: "700", color: "#0284c7" },
  diagRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 4 },
  diagRowBorder: { borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  codeChip: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6b7280",
    backgroundColor: "#f3f4f6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginTop: 2,
  },
  desc: { fontSize: 13, color: "#374151", flex: 1, lineHeight: 18 },
});

function ToothDiagram({ affectedTeeth }: { affectedTeeth: string[] }) {
  const { width } = useWindowDimensions();
  const { t } = useLanguage();
  const imgWidth = width - 32;
  const imgHeight = imgWidth * (950 / 760); // approximate aspect ratio of the image

  return (
    <View style={diagramStyles.container}>
      <Image
        source={require("../../assets/images/teeth-fdi.jpeg")}
        style={{ width: imgWidth, height: imgHeight, borderRadius: 12 }}
        resizeMode="contain"
      />
      {affectedTeeth.length > 0 && (
        <View style={diagramStyles.chipsRow}>
          <Text style={diagramStyles.chipsLabel}>{t("treatment.treatedTeeth")}</Text>
          <View style={diagramStyles.chips}>
            {affectedTeeth.map((t) => (
              <View key={t} style={diagramStyles.chip}>
                <Text style={diagramStyles.chipText}>{t}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const diagramStyles = StyleSheet.create({
  container: { marginBottom: 8 },
  chipsRow: { marginTop: 10 },
  chipsLabel: { fontSize: 12, color: "#6b7280", marginBottom: 6, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    backgroundColor: "#2563eb",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  chipText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});

export default function TreatmentPlanScreen() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [active, setActive] = useState<Procedure[]>([]);
  const [planned, setPlanned] = useState<Procedure[]>([]);
  const [completed, setCompleted] = useState<Procedure[]>([]);
  const [affectedTeeth, setAffectedTeeth] = useState<string[]>([]);
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [priceByType, setPriceByType] = useState<Record<string, PriceEntry>>({});
  const [pricesVisible, setPricesVisible] = useState(true);
  const skipFocusPlanReload = useRef(true);

  const patientId = String(user?.patientId || user?.id || "").trim();

  useEffect(() => {
    skipFocusPlanReload.current = true;
  }, [patientId]);

  const fetchData = useCallback(async () => {
    if (!user?.token || !patientId) {
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const [res, pres] = await Promise.all([
        fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/treatments`, {
          headers: { Authorization: `Bearer ${user.token}`, Accept: "application/json" },
        }),
        fetch(`${API_BASE}/api/patient/${encodeURIComponent(patientId)}/treatment-prices`, {
          headers: { Authorization: `Bearer ${user.token}`, Accept: "application/json" },
        }),
      ]);

      try {
        const pj = await pres.json().catch(() => ({}));
        if (pj.showPrices === false) {
          setPricesVisible(false);
          setPriceByType({});
        } else {
          setPricesVisible(true);
          const list = Array.isArray(pj.prices) ? pj.prices : [];
          const map: Record<string, PriceEntry> = {};
          for (const row of list) {
            const code = String(row?.type || "").trim().toUpperCase();
            const price = row?.price != null ? Number(row.price) : NaN;
            if (!code || Number.isNaN(price)) continue;
            map[code] = {
              price,
              currency: String(row?.currency || "TRY").trim() || "TRY",
            };
          }
          setPriceByType(map);
        }
      } catch {
        setPricesVisible(true);
        setPriceByType({});
      }

      const json = await res.json().catch(() => ({}));
      const teeth: any[] = Array.isArray(json.teeth) ? json.teeth : [];

      // Extract diagnoses from the same response
      const rawDiags: Diagnosis[] = Array.isArray(json.diagnoses) ? json.diagnoses : [];
      // Dedupe by icd10_code + tooth_number (same diagnosis may appear in multiple encounters)
      const diagSeen = new Set<string>();
      const dedupedDiags = rawDiags.filter((d) => {
        const code = String(d.icd10_code || "").trim().toUpperCase();
        const tooth = String(d.tooth_number ?? "").trim();
        const k = code ? `${tooth}-${code}` : String(d.id || "").trim();
        if (!k) return true;
        if (diagSeen.has(k)) return false;
        diagSeen.add(k);
        return true;
      });
      setDiagnoses(dedupedDiags);

      const all: Procedure[] = [];
      teeth.forEach((tooth: any) => {
        const toothId = tooth.toothId ? String(tooth.toothId) : null;
        (tooth.procedures || []).forEach((proc: any) => {
          const procRec = proc as Record<string, unknown>;
          const scheduledMs = proc.scheduledAt != null ? Number(proc.scheduledAt) : NaN;
          const scheduledFromMs = Number.isFinite(scheduledMs) ? new Date(scheduledMs).toISOString() : null;
          let scheduledIso =
            (typeof proc.scheduled_at === "string" && proc.scheduled_at.trim()
              ? proc.scheduled_at.trim()
              : null) ||
            (typeof proc.scheduledAt === "string" && proc.scheduledAt.trim()
              ? proc.scheduledAt.trim()
              : null) ||
            scheduledFromMs ||
            (typeof proc.scheduled_date === "string" && proc.scheduled_date.trim()
              ? proc.scheduled_date.trim()
              : null) ||
            null;
          if (!scheduledIso) {
            scheduledIso = mergeProcedureDateTimeFromParts(procRec);
          } else {
            const timeHint = pickNonEmptyStr(
              proc.time,
              proc.appointment_time,
              proc.scheduled_time,
              proc.time_slot,
              proc.slot_time
            );
            const s0 = String(scheduledIso).trim();
            const looksDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s0);
            const looksMidnight =
              /^(\d{4}-\d{2}-\d{2})T00:00:00(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/.test(s0);
            if (timeHint && (looksDateOnly || looksMidnight)) {
              const merged = mergeProcedureDateTimeFromParts(procRec);
              if (merged) scheduledIso = merged;
            }
          }
          let completedIso =
            (typeof proc.completed_at === "string" && proc.completed_at.trim()
              ? proc.completed_at.trim()
              : null) ||
            (typeof proc.completedAt === "string" && proc.completedAt.trim()
              ? proc.completedAt.trim()
              : null) ||
            (proc.completedAt != null && Number.isFinite(Number(proc.completedAt))
              ? new Date(Number(proc.completedAt)).toISOString()
              : null) ||
            null;
          if (!completedIso) {
            completedIso = mergeCompletedDateTimeFromParts(procRec);
          }
          const rawP = proc.price ?? proc.unit_price;
          const pNum = rawP != null ? Number(rawP) : NaN;
          const hasPrice = Number.isFinite(pNum) && pNum > 0;
          const chair = extractChair(procRec);
          const doctorName = extractDoctorName(procRec);
          all.push({
            id: proc.id || proc.procedureId,
            title: proc.title || proc.type || "",
            rawType: proc.type,
            status: proc.status || "PLANNED",
            scheduled_date: scheduledIso,
            completed_at: completedIso,
            toothId,
            chair,
            doctorName,
            price: hasPrice ? pNum : null,
            currency: proc.currency ? String(proc.currency) : null,
          });
        });
      });

      const sortAsc = (a: Procedure, b: Procedure) => {
        const da = new Date(a.scheduled_date || a.completed_at || 0).getTime();
        const db = new Date(b.scheduled_date || b.completed_at || 0).getTime();
        return da - db;
      };
      const sortDesc = (a: Procedure, b: Procedure) => {
        const da = new Date(a.completed_at || a.scheduled_date || 0).getTime();
        const db = new Date(b.completed_at || b.scheduled_date || 0).getTime();
        return db - da;
      };

      // Aynı id birden fazla dişte dönebilir; ilk kayıtta hekim boş kalırsa dolu olanı koru
      const byId = new Map<string, Procedure>();
      for (const p of all) {
        const key = String(p.id ?? "").trim();
        if (!key) continue;
        const prev = byId.get(key);
        if (!prev) {
          byId.set(key, p);
          continue;
        }
        byId.set(key, {
          ...prev,
          ...p,
          doctorName: pickNonEmptyStr(p.doctorName, prev.doctorName),
          chair: pickNonEmptyStr(p.chair, prev.chair),
          scheduled_date: pickNonEmptyStr(p.scheduled_date, prev.scheduled_date) || prev.scheduled_date,
          completed_at: pickNonEmptyStr(p.completed_at, prev.completed_at) || prev.completed_at,
          toothId: pickNonEmptyStr(p.toothId, prev.toothId) || prev.toothId,
          price: p.price ?? prev.price,
          currency: pickNonEmptyStr(p.currency, prev.currency) || prev.currency,
        });
      }
      const deduped = [...byId.values()];

      const ACTIVE_STATUSES   = ["IN_PROGRESS", "ACTIVE", "ONGOING"];
      const PLANNED_STATUSES  = ["PLANNED", "SCHEDULED", "PENDING", "WAITING", ""];
      const COMPLETED_STATUSES = ["COMPLETED", "DONE", "COMPLETE"];
      const CANCELLED_STATUSES = ["CANCELLED", "CANCELED"];

      setActive(
        deduped.filter(p => ACTIVE_STATUSES.includes(String(p.status ?? "").toUpperCase())).sort(sortAsc)
      );
      setPlanned(
        deduped.filter(p => {
          const s = String(p.status ?? "").toUpperCase();
          return PLANNED_STATUSES.includes(s) || (!ACTIVE_STATUSES.includes(s) && !COMPLETED_STATUSES.includes(s) && !CANCELLED_STATUSES.includes(s));
        }).sort(sortAsc)
      );
      setCompleted(
        deduped.filter(p => COMPLETED_STATUSES.includes(String(p.status ?? "").toUpperCase())).sort(sortDesc)
      );
      const uniqueTeeth = [...new Set(deduped.map(p => p.toothId).filter(Boolean) as string[])].sort((a, b) => Number(a) - Number(b));
      setAffectedTeeth(uniqueTeeth);
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.token, patientId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useFocusEffect(
    useCallback(() => {
      if (!user?.token || !patientId) return;
      if (skipFocusPlanReload.current) {
        skipFocusPlanReload.current = false;
        return;
      }
      void fetchData();
    }, [user?.token, patientId, fetchData])
  );

  useEffect(() => {
    if (!user?.token || !patientId) return;
    const id = setInterval(() => {
      void fetchData();
    }, TREATMENTS_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user?.token, patientId, fetchData]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  const totalCount = active.length + planned.length + completed.length;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); fetchData(); }}
          tintColor="#2563eb"
        />
      }
    >
      <Text style={styles.pageTitle}>{t("treatment.pageTitle")}</Text>

      <ToothDiagram affectedTeeth={affectedTeeth} />

      {/* DIAGNOSES — shown above treatments */}
      <DiagnosisSection diagnoses={diagnoses} />

      {totalCount === 0 ? (
        <View style={styles.fullEmptyContainer}>
          <Text style={styles.fullEmptyIcon}>🦷</Text>
          <Text style={styles.fullEmptyTitle}>{t("treatment.noPlansTitle")}</Text>
          <Text style={styles.fullEmptyText}>{t("treatment.noPlansMsg")}</Text>
        </View>
      ) : (
        <>
          {/* ACTIVE */}
          <SectionHeader title={t("treatment.activeSection")} count={active.length} color="#ea580c" />
          {active.length === 0 ? (
            <EmptyState message={t("treatment.noActive")} />
          ) : (
            active.map((p, i) => (
              <ProcedureCard
                key={`a-${p.id}-${i}`}
                proc={p}
                priceByType={priceByType}
                pricesVisible={pricesVisible}
              />
            ))
          )}

          {/* PLANNED */}
          <SectionHeader title={t("treatment.plannedSection")} count={planned.length} color="#2563eb" />
          {planned.length === 0 ? (
            <EmptyState message={t("treatment.noPlanned")} />
          ) : (
            planned.map((p, i) => (
              <ProcedureCard
                key={`pl-${p.id}-${i}`}
                proc={p}
                priceByType={priceByType}
                pricesVisible={pricesVisible}
              />
            ))
          )}

          {/* COMPLETED */}
          <SectionHeader title={t("treatment.completedSection")} count={completed.length} color="#16a34a" />
          {completed.length === 0 ? (
            <EmptyState message={t("treatment.noCompleted")} />
          ) : (
            completed.map((p, i) => (
              <ProcedureCard
                key={`co-${p.id}-${i}`}
                proc={p}
                priceByType={priceByType}
                pricesVisible={pricesVisible}
              />
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f3f4f6" },
  pageTitle: { fontSize: 24, fontWeight: "700", color: "#111827", marginBottom: 4 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: "700" },
  cardDetails: { gap: 10 },
  detailBlock: { minWidth: 0 },
  detailLabel: { fontSize: 12, fontWeight: "600", color: "#6b7280", marginBottom: 4 },
  detailValue: { fontSize: 15, color: "#111827", lineHeight: 22 },
  detailPrice: { fontWeight: "700", color: "#15803d" },
  detailHint: { fontSize: 12, fontWeight: "500", color: "#6b7280" },
  emptyCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 4,
  },
  emptyText: { color: "#9ca3af", fontSize: 13 },
  fullEmptyContainer: {
    marginTop: 60,
    alignItems: "center",
    paddingHorizontal: 24,
  },
  fullEmptyIcon: { fontSize: 48, marginBottom: 16 },
  fullEmptyTitle: { fontSize: 18, fontWeight: "700", color: "#374151", marginBottom: 8 },
  fullEmptyText: { fontSize: 14, color: "#9ca3af", textAlign: "center", lineHeight: 20 },
});
