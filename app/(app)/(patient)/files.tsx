import React, { useCallback, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Linking, Image,
  Modal, StatusBar, useWindowDimensions, ScrollView, Platform,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useAuth } from "../../../lib/auth";
import { API_BASE, resolvePublicAssetUrl } from "../../../lib/api";
import { useLanguage } from "../../../lib/language-context";
import { useDateLocale } from "../../../lib/date-locale";

// ─── Types ────────────────────────────────────────────────────────────────────

type FileType = "image" | "xray" | "pdf" | "file";

type FileItem = {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  fileType: FileType;
  subtype?: string | null;
  size?: number;
  createdAt: number;
  from: "PATIENT" | "CLINIC";
  source?: string;
};

type FilterKey = "all" | "image" | "xray" | "pdf";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(ts: number, locale: string) {
  return new Date(ts).toLocaleDateString(locale, {
    day: "numeric", month: "long", year: "numeric",
  });
}

function fmtSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(ft: FileType): string {
  if (ft === "image") return "🖼️";
  if (ft === "xray")  return "🩻";
  if (ft === "pdf")   return "📄";
  return "📁";
}

function isImageType(f: FileItem): boolean {
  return f.fileType === "image" || f.fileType === "xray" || f.mimeType?.startsWith("image/");
}

function fileDisplayUrl(f: FileItem): string {
  return resolvePublicAssetUrl(f.url);
}

// ─── Filter config ────────────────────────────────────────────────────────────

const FILTERS: { key: FilterKey; labelKey: string }[] = [
  { key: "all",   labelKey: "files.filterAll" },
  { key: "image", labelKey: "files.filterPhotos" },
  { key: "xray",  labelKey: "files.filterXray" },
  { key: "pdf",   labelKey: "files.filterDocs" },
];

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function FilesScreen() {
  const { user }  = useAuth();
  const { t }     = useLanguage();
  const locale    = useDateLocale();
  const { width } = useWindowDimensions();

  const [files, setFiles]         = useState<FileItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]       = useState<FilterKey>("all");
  const [preview, setPreview]     = useState<FileItem | null>(null);

  const patientId = String(user?.patientId || user?.id || "").trim();
  const token     = user?.token;

  const fetchFiles = useCallback(async (silent = false) => {
    if (!token || !patientId) { setLoading(false); setRefreshing(false); return; }
    if (!silent) setLoading(true);
    try {
      const url = `${API_BASE}/api/patient/${encodeURIComponent(patientId)}/files`;
      console.log("[FILES] Fetching:", url);
      const res  = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const json = await res.json().catch(() => ({}));
      console.log("[FILES] Response ok:", res.ok, "| count:", Array.isArray(json.files) ? json.files.length : "?", "| error:", json.error ?? "none");
      setFiles(Array.isArray(json.files) ? json.files : []);
    } catch (err: any) {
      console.error("[FILES] Fetch error:", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, patientId]);

  // Refetch every time the screen comes into focus (tab stays mounted between navigations)
  useFocusEffect(
    useCallback(() => {
      fetchFiles();
    }, [fetchFiles]),
  );

  const displayed = files.filter(f => {
    if (filter === "all")   return true;
    if (filter === "image") return f.fileType === "image";
    if (filter === "xray")  return f.fileType === "xray";
    if (filter === "pdf")   return f.fileType === "pdf" || f.mimeType === "application/pdf";
    return true;
  });

  const counts: Record<FilterKey, number> = {
    all:   files.length,
    image: files.filter(f => f.fileType === "image").length,
    xray:  files.filter(f => f.fileType === "xray").length,
    pdf:   files.filter(f => f.fileType === "pdf" || f.mimeType === "application/pdf").length,
  };

  // Split displayed into images (grid) and docs (list)
  const imageFiles = displayed.filter(f => isImageType(f));
  const docFiles   = displayed.filter(f => !isImageType(f));

  const COLS = 3;
  const imgSize = (width - 32 - (COLS - 1) * 4) / COLS;

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color="#2563eb" /></View>;
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.headerTitle}>{t("files.title")}</Text>
        <Text style={s.headerSub}>{t("files.subtitle")}</Text>
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterRow}
      >
        {FILTERS.map(f => {
          const cnt = counts[f.key];
          const active = filter === f.key;
          return (
            <TouchableOpacity
              key={f.key}
              style={[s.filterBtn, active && s.filterBtnActive]}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.8}
            >
              <Text style={[s.filterBtnText, active && s.filterBtnTextActive]}>
                {t(f.labelKey)}
                {cnt > 0 && <Text style={[s.filterCount, active && s.filterCountActive]}> {cnt}</Text>}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchFiles(false); }}
            tintColor="#2563eb"
          />
        }
      >
        {displayed.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyIcon}>📁</Text>
            <Text style={s.emptyTitle}>{t("files.empty")}</Text>
            <Text style={s.emptySub}>{t("files.emptySub")}</Text>
          </View>
        )}

        {/* Photo / X-Ray grid */}
        {imageFiles.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              {filter === "xray" ? t("files.filterXray") : t("files.filterPhotos")}
              {" "}
              <Text style={s.sectionCount}>{imageFiles.length}</Text>
            </Text>
            <View style={s.grid}>
              {imageFiles.map(f => (
                <TouchableOpacity
                  key={f.id}
                  style={[s.gridCell, { width: imgSize, height: imgSize }]}
                  onPress={() => setPreview(f)}
                  activeOpacity={0.85}
                >
                  <Image
                    source={{ uri: fileDisplayUrl(f) }}
                    style={s.gridImg}
                    resizeMode="cover"
                  />
                  {f.fileType === "xray" && (
                    <View style={s.xrayBadge}>
                      <Text style={s.xrayBadgeText}>🩻</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Document list */}
        {docFiles.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>
              {t("files.filterDocs")}
              {" "}
              <Text style={s.sectionCount}>{docFiles.length}</Text>
            </Text>
            {docFiles.map(f => (
              <FileCard key={f.id} file={f} locale={locale} onPress={() => Linking.openURL(fileDisplayUrl(f))} />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Full-screen image preview */}
      <ImagePreview file={preview} onClose={() => setPreview(null)} />
    </View>
  );
}

// ─── FileCard (documents) ─────────────────────────────────────────────────────

function FileCard({
  file, locale, onPress,
}: { file: FileItem; locale: string; onPress: () => void }) {
  const { t } = useLanguage();
  const sentBy = file.from === "PATIENT" ? t("files.sentByYou") : t("files.sentByClinic");
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.8}>
      <View style={s.cardIcon}>
        <Text style={s.cardIconText}>{fileIcon(file.fileType)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.cardName} numberOfLines={2}>{file.name}</Text>
        <Text style={s.cardMeta}>
          {fmtDate(file.createdAt, locale)}
          {file.size ? " · " + fmtSize(file.size) : ""}
          {"  ·  " + sentBy}
        </Text>
      </View>
      <Text style={s.cardArrow}>›</Text>
    </TouchableOpacity>
  );
}

// ─── ImagePreview (full-screen) ───────────────────────────────────────────────

function ImagePreview({ file, onClose }: { file: FileItem | null; onClose: () => void }) {
  const { t }     = useLanguage();
  const locale    = useDateLocale();
  const { width, height } = useWindowDimensions();
  if (!file) return null;

  return (
    <Modal visible animationType="fade" statusBarTranslucent transparent>
      <View style={[s.previewBg, { width, height }]}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />

        {/* Close */}
        <TouchableOpacity style={s.previewClose} onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={s.previewCloseText}>✕</Text>
        </TouchableOpacity>

        {/* Image */}
        <Image
          source={{ uri: fileDisplayUrl(file) }}
          style={{ width, height: height * 0.72 }}
          resizeMode="contain"
        />

        {/* Footer info */}
        <View style={s.previewFooter}>
          <Text style={s.previewFileName} numberOfLines={1}>{file.name}</Text>
          <Text style={s.previewMeta}>
            {fmtDate(file.createdAt, locale)}
            {file.size ? " · " + fmtSize(file.size) : ""}
          </Text>
          <TouchableOpacity
            style={s.previewDownload}
            onPress={() => Linking.openURL(fileDisplayUrl(file))}
            activeOpacity={0.8}
          >
            <Text style={s.previewDownloadText}>⬇  {t("files.download")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6" },
  center:    { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#f3f4f6" },

  header: {
    backgroundColor: "#fff",
    paddingHorizontal: 20, paddingTop: Platform.OS === "ios" ? 60 : 24, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: "#e5e7eb",
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#111827" },
  headerSub:   { fontSize: 12, color: "#6b7280", marginTop: 2 },

  filterScroll: { backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#f3f4f6", flexGrow: 0 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  filterBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "#e5e7eb",
  },
  filterBtnActive: { backgroundColor: "#eff6ff", borderColor: "#2563eb" },
  filterBtnText:   { fontSize: 13, fontWeight: "600", color: "#6b7280" },
  filterBtnTextActive: { color: "#2563eb" },
  filterCount:     { fontWeight: "400", color: "#9ca3af" },
  filterCountActive: { color: "#93c5fd" },

  section:      { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#374151", marginBottom: 10 },
  sectionCount: { fontWeight: "400", color: "#9ca3af" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  gridCell: { borderRadius: 8, overflow: "hidden", backgroundColor: "#e5e7eb" },
  gridImg:  { width: "100%", height: "100%" },
  xrayBadge: {
    position: "absolute", bottom: 4, right: 4,
    backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 6,
    paddingHorizontal: 4, paddingVertical: 2,
  },
  xrayBadgeText: { fontSize: 12 },

  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: "#fff", borderRadius: 12, padding: 12, marginBottom: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  cardIcon:     { width: 48, height: 48, borderRadius: 10, backgroundColor: "#f3f4f6", justifyContent: "center", alignItems: "center" },
  cardIconText: { fontSize: 26 },
  cardName:     { fontSize: 14, fontWeight: "600", color: "#111827", marginBottom: 3 },
  cardMeta:     { fontSize: 11, color: "#9ca3af" },
  cardArrow:    { fontSize: 20, color: "#2563eb", fontWeight: "700" },

  empty:      { alignItems: "center", paddingTop: 72 },
  emptyIcon:  { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#374151", marginBottom: 6 },
  emptySub:   { fontSize: 13, color: "#9ca3af", textAlign: "center", paddingHorizontal: 36, lineHeight: 20 },

  // Preview modal
  previewBg:       { backgroundColor: "#000", justifyContent: "center", alignItems: "center" },
  previewClose:    { position: "absolute", top: Platform.OS === "ios" ? 56 : 20, right: 20, zIndex: 10, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, width: 36, height: 36, justifyContent: "center", alignItems: "center" },
  previewCloseText:{ color: "#fff", fontSize: 18, fontWeight: "700" },
  previewFooter:   { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.75)", padding: 20, paddingBottom: Platform.OS === "ios" ? 40 : 20 },
  previewFileName: { color: "#fff", fontSize: 15, fontWeight: "700", marginBottom: 4 },
  previewMeta:     { color: "#9ca3af", fontSize: 12, marginBottom: 14 },
  previewDownload: { backgroundColor: "#2563eb", borderRadius: 10, paddingVertical: 12, alignItems: "center" },
  previewDownloadText: { color: "#fff", fontSize: 14, fontWeight: "700" },
});
