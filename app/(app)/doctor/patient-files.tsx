// app/doctor/patient-files.tsx — Doctor views a patient's files
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Linking, Image,
  Modal, SafeAreaView, Platform, useWindowDimensions,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../lib/auth';
import { API_BASE, resolvePublicAssetUrl } from '../../../lib/api';

// ─── Types ────────────────────────────────────────────────────
type FileType = 'image' | 'xray' | 'pdf' | 'file';
type FilterKey = 'all' | 'image' | 'xray' | 'pdf';

interface FileItem {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  fileType: FileType;
  size?: number;
  createdAt: number;
  from: 'PATIENT' | 'CLINIC';
}

// ─── Helpers ──────────────────────────────────────────────────
function fileIcon(ft: FileType) {
  if (ft === 'image') return '🖼️';
  if (ft === 'xray')  return '🩻';
  if (ft === 'pdf')   return '📄';
  return '📁';
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleDateString('tr-TR', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all',   label: 'Tümü' },
  { key: 'image', label: 'Fotoğraf' },
  { key: 'xray',  label: 'X-Ray' },
  { key: 'pdf',   label: 'Belge' },
];

// ─── Screen ───────────────────────────────────────────────────
export default function DoctorPatientFilesScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const { patientId, patientName } = useLocalSearchParams<{
    patientId?: string;
    patientName?: string;
  }>();

  const displayName = patientName ? decodeURIComponent(patientName) : 'Hasta';

  const [files, setFiles]         = useState<FileItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter]       = useState<FilterKey>('all');
  const [preview, setPreview]     = useState<FileItem | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const fetchFiles = useCallback(async (silent = false) => {
    if (!user?.token || !patientId) { setLoading(false); setRefreshing(false); return; }
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/patient/${encodeURIComponent(patientId)}/files`,
        { headers: { Authorization: `Bearer ${user.token}`, Accept: 'application/json' } },
      );
      const json = await res.json().catch(() => ({}));
      setFiles(Array.isArray(json.files) ? json.files : []);
    } catch (err: any) {
      setError('Dosyalar yüklenemedi. Lütfen tekrar deneyin.');
      console.error('[DR FILES]', err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.token, patientId]);

  // Load on mount
  React.useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const displayed = files.filter(f => {
    if (filter === 'all')   return true;
    if (filter === 'image') return f.fileType === 'image';
    if (filter === 'xray')  return f.fileType === 'xray';
    if (filter === 'pdf')   return f.fileType === 'pdf' || f.mimeType === 'application/pdf';
    return true;
  });

  const counts: Record<FilterKey, number> = {
    all:   files.length,
    image: files.filter(f => f.fileType === 'image').length,
    xray:  files.filter(f => f.fileType === 'xray').length,
    pdf:   files.filter(f => f.fileType === 'pdf' || f.mimeType === 'application/pdf').length,
  };

  const handleOpen = (f: FileItem) => {
    const isImg = f.fileType === 'image' || f.fileType === 'xray' || f.mimeType?.startsWith('image/');
    if (isImg) { setPreview(f); return; }
    Linking.openURL(resolvePublicAssetUrl(f.url)).catch(() => {});
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerMid}>
          <Text style={styles.headerTitle}>Dosyalar</Text>
          <Text style={styles.headerSub} numberOfLines={1}>{displayName}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* Filter bar */}
      <View style={styles.filterRow}>
        {FILTERS.map(({ key, label }) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterBtn, filter === key && styles.filterBtnActive]}
            onPress={() => setFilter(key)}
          >
            <Text style={[styles.filterText, filter === key && styles.filterTextActive]}>
              {label}
              {counts[key] > 0 ? ` (${counts[key]})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} size="large" color="#2563EB" />
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchFiles()}>
            <Text style={styles.retryText}>Tekrar Dene</Text>
          </TouchableOpacity>
        </View>
      ) : displayed.length === 0 ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyIcon}>📂</Text>
          <Text style={styles.emptyTitle}>
            {filter === 'all' ? 'Henüz dosya yok' : 'Bu kategoride dosya yok'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={f => f.id}
          numColumns={2}
          contentContainerStyle={styles.grid}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchFiles(true); }} />}
          renderItem={({ item: f }) => {
            const isImg = f.fileType === 'image' || f.fileType === 'xray' || f.mimeType?.startsWith('image/');
            return (
              <TouchableOpacity style={[styles.fileCard, { width: (width - 36) / 2 }]} onPress={() => handleOpen(f)} activeOpacity={0.8}>
                {isImg ? (
                  <Image source={{ uri: f.url }} style={styles.fileThumb} resizeMode="cover" />
                ) : (
                  <View style={styles.fileIconBox}>
                    <Text style={styles.fileIconText}>{fileIcon(f.fileType)}</Text>
                  </View>
                )}
                <View style={styles.fileMeta}>
                  <Text style={styles.fileName} numberOfLines={1}>{f.name || 'Dosya'}</Text>
                  <Text style={styles.fileSub}>
                    {fmtDate(f.createdAt)}{f.size ? `  ·  ${fmtSize(f.size)}` : ''}
                  </Text>
                  <View style={[styles.fromBadge, f.from === 'CLINIC' ? styles.fromClinic : styles.fromPatient]}>
                    <Text style={styles.fromText}>{f.from === 'CLINIC' ? 'Klinik' : 'Hasta'}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Image preview modal */}
      {preview && (
        <Modal visible animationType="fade" transparent onRequestClose={() => setPreview(null)}>
          <View style={styles.previewOverlay}>
            <TouchableOpacity style={styles.previewClose} onPress={() => setPreview(null)}>
              <Text style={styles.previewCloseText}>✕</Text>
            </TouchableOpacity>
            <Image source={{ uri: resolvePublicAssetUrl(preview.url) }} style={styles.previewImage} resizeMode="contain" />
            <TouchableOpacity style={styles.previewDownload} onPress={() => Linking.openURL(resolvePublicAssetUrl(preview.url))}>
              <Text style={styles.previewDownloadText}>⬇ İndir / Aç</Text>
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F3F4F6' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn:    { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backText:   { fontSize: 22, color: '#111827' },
  headerMid:  { flex: 1, alignItems: 'center' },
  headerTitle:{ fontSize: 17, fontWeight: '700', color: '#111827' },
  headerSub:  { fontSize: 12, color: '#6B7280', marginTop: 1 },

  filterRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  filterBtn:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F3F4F6' },
  filterBtnActive: { backgroundColor: '#2563EB' },
  filterText:      { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  filterTextActive:{ color: '#fff' },

  grid: { padding: 10, gap: 8 },

  fileCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 4, marginHorizontal: 2,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
      android: { elevation: 2 },
    }),
  },
  fileThumb:   { width: '100%', height: 110 },
  fileIconBox: { height: 90, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' },
  fileIconText:{ fontSize: 40 },

  fileMeta: { padding: 8, gap: 3 },
  fileName: { fontSize: 12, fontWeight: '600', color: '#111827' },
  fileSub:  { fontSize: 10, color: '#9CA3AF' },
  fromBadge:    { alignSelf: 'flex-start', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginTop: 2 },
  fromClinic:   { backgroundColor: '#DBEAFE' },
  fromPatient:  { backgroundColor: '#D1FAE5' },
  fromText:     { fontSize: 10, fontWeight: '600', color: '#1E40AF' },

  centerBox:  { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  emptyIcon:  { fontSize: 52 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  errorText:  { fontSize: 14, color: '#EF4444', textAlign: 'center', paddingHorizontal: 24 },
  retryBtn:   { backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10 },
  retryText:  { color: '#fff', fontWeight: '700' },

  previewOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center', alignItems: 'center',
  },
  previewClose:      { position: 'absolute', top: 52, right: 20, zIndex: 10, padding: 8 },
  previewCloseText:  { color: '#fff', fontSize: 22, fontWeight: '700' },
  previewImage:      { width: '100%', height: '75%' },
  previewDownload:   { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  previewDownloadText:{ color: '#fff', fontWeight: '700', fontSize: 15 },
});
