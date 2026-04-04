// app/quote-request.tsx
// "Tell us about your treatment" — submitted after multi-clinic selection.
// Flow: form → loading (per-clinic) → success → My Requests
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, KeyboardAvoidingView,
  Platform, ScrollView, Alert, Image, Modal, Pressable,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/language-context';
import { API_BASE } from '../lib/api';

// Guided intraoral photo steps (same as messages.tsx and offer-chat.tsx)
const PHOTO_STEP_KEYS = [
  { key: 'upper', icon: '⬆️' },
  { key: 'lower', icon: '⬇️' },
  { key: 'front', icon: '😁' },
  { key: 'left',  icon: '◀️' },
  { key: 'right', icon: '▶️' },
];

type Clinic = {
  id: string;
  clinic_code: string;
  name: string;
  city: string | null;
  address: string | null;
};

type Phase = 'form' | 'loading' | 'success';

type Attachment = {
  uri: string;       // local URI for preview
  url: string;       // uploaded public URL
  type: 'image' | 'document';
  name: string;
};

export default function QuoteRequestScreen() {
  const router  = useRouter();
  const { user } = useAuth();
  const { t }   = useLanguage();
  const params  = useLocalSearchParams<{ clinics?: string }>();

  // Guard: if t() returns the key itself (stale bundle bug), use fallback instead
  const safeT = (key: string, fallback: string, p?: Record<string, string | number>) => {
    const raw = t(key, p);
    if (!raw || raw === key) return fallback;
    return raw;
  };

  const selectedClinics: Clinic[] = (() => {
    try { return JSON.parse(decodeURIComponent(params.clinics || '[]')); }
    catch { return []; }
  })();

  const [phase, setPhase]             = useState<Phase>('form');
  const [description, setDescription] = useState('');
  const [sentIds, setSentIds]         = useState<string[]>([]);

  // Attachment state (single file or guided intraoral set)
  const [attachment, setAttachment]   = useState<Attachment | null>(null);
  const [uploading, setUploading]     = useState(false);
  const [attachMenu, setAttachMenu]   = useState(false);

  // Guided intraoral state
  const [intraoralVisible, setIntraoralVisible] = useState(false);
  const [intraoralStep, setIntraoralStep]       = useState(0);
  const [intraoralPhotos, setIntraoralPhotos]   = useState<Record<string, any>>({});
  // Uploaded URLs from guided intraoral (may be multiple)
  const [intraoralUrls, setIntraoralUrls]       = useState<string[]>([]);

  const cliniCount = selectedClinics.length;

  // ── Upload helper ──────────────────────────────────────────────────────────
  const uploadFile = async (uri: string, mimeType: string, fileName: string): Promise<string> => {
    const formData = new FormData();
    formData.append('file', { uri, type: mimeType, name: fileName } as any);

    const res = await fetch(`${API_BASE}/api/patient/treatment-requests/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user!.token}` },
      body: formData,
    });
    const data = await res.json();
    if (!data?.ok) throw new Error(data?.error || 'upload_failed');
    return data.url as string;
  };

  // ── Pick from gallery ──────────────────────────────────────────────────────
  const pickPhoto = async () => {
    setAttachMenu(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(safeT('common.error', 'Error'), 'Photo library permission required');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    await doUpload(asset.uri, asset.mimeType || 'image/jpeg', asset.fileName || `photo_${Date.now()}.jpg`, 'image');
  };

  // ── Open guided intraoral modal ───────────────────────────────────────────
  const takePhoto = () => {
    setAttachMenu(false);
    setIntraoralStep(0);
    setIntraoralPhotos({});
    setIntraoralVisible(true);
  };

  // ── Capture one step inside guided modal ──────────────────────────────────
  const captureIntraoralStep = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(safeT('common.error', 'Error'), 'Camera permission required');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets?.length) return;
    const key = PHOTO_STEP_KEYS[intraoralStep].key;
    setIntraoralPhotos(prev => ({ ...prev, [key]: result.assets[0] }));
  };

  // ── Submit guided intraoral — upload all photos, attach to form ───────────
  const submitIntraoralPhotos = async () => {
    const entries = Object.entries(intraoralPhotos);
    if (entries.length === 0) {
      Alert.alert(safeT('common.error', 'Error'), 'Please capture at least one photo.');
      return;
    }
    setIntraoralVisible(false);
    setUploading(true);
    // Clear previous single attachment
    setAttachment(null);
    try {
      const urls: string[] = [];
      for (const [key, asset] of entries) {
        const uri  = (asset as any).uri;
        const mime = (asset as any).mimeType || 'image/jpeg';
        const name = `intraoral_${key}_${Date.now()}.jpg`;
        const url  = await uploadFile(uri, mime, name);
        urls.push(url);
      }
      setIntraoralUrls(urls);
      // Use first photo as visual preview
      const firstAsset = Object.values(intraoralPhotos)[0] as any;
      setAttachment({
        uri:  firstAsset.uri,
        url:  urls[0],
        type: 'image',
        name: `${entries.length} intraoral photos`,
      });
    } catch (e: any) {
      Alert.alert(safeT('common.error', 'Error'), e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ── Pick document / x-ray ─────────────────────────────────────────────────
  const pickFile = async () => {
    setAttachMenu(false);
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    const mime  = asset.mimeType || 'application/octet-stream';
    const type: 'image' | 'document' = mime.startsWith('image/') ? 'image' : 'document';
    await doUpload(asset.uri, mime, asset.name || `file_${Date.now()}`, type);
  };

  // ── Common upload + state setter ───────────────────────────────────────────
  const doUpload = async (uri: string, mime: string, name: string, type: 'image' | 'document') => {
    if (!user?.token) return;
    setUploading(true);
    try {
      const url = await uploadFile(uri, mime, name);
      setAttachment({ uri, url, type, name });
    } catch (e: any) {
      Alert.alert(safeT('common.error', 'Error'), e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const trimmed = description.trim();
    if (!trimmed) {
      Alert.alert(
        safeT('quoteRequest.descRequired', 'Description required'),
        safeT('quoteRequest.descRequiredMsg', 'Please tell us a bit about your treatment.'),
      );
      return;
    }
    if (!user?.token) {
      router.replace('/(patient)' as any);
      return;
    }

    setPhase('loading');
    const confirmed: string[] = [];

    for (const clinic of selectedClinics) {
      try {
        const res = await fetch(`${API_BASE}/api/patient/treatment-requests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({
            description: trimmed,
            target_clinic_id: clinic.id,
            // intraoralUrls already contains all guided photos; attachment.url may overlap with first
            photos: intraoralUrls.length > 0
              ? intraoralUrls
              : attachment?.url ? [attachment.url] : [],
          }),
        });
        const data = await res.json();
        if (data?.ok) {
          confirmed.push(clinic.id);
          setSentIds(prev => [...prev, clinic.id]);
        }
      } catch {
        // continue even if one fails
      }
    }

    await new Promise(r => setTimeout(r, 400));
    setPhase('success');
  };

  // ── Form screen ───────────────────────────────────────────────────────────
  if (phase === 'form') {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">

            {/* Header */}
            <View style={styles.formHeader}>
              <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                <Text style={styles.backBtnText}>‹  {safeT('common.back', 'Back')}</Text>
              </TouchableOpacity>
              <Text style={styles.formTitle}>
                {safeT('quoteRequest.title', 'Tell us about your treatment')}
              </Text>
              <Text style={styles.formSubtitle}>
                {safeT('quoteRequest.subtitle', `Your request will be sent to ${cliniCount} clinic(s).`, { count: cliniCount })}
              </Text>
            </View>

            {/* Selected clinic chips */}
            <View style={styles.chipRow}>
              {selectedClinics.map(c => (
                <View key={c.id} style={styles.chip}>
                  <Text style={styles.chipText} numberOfLines={1}>{c.name}</Text>
                </View>
              ))}
            </View>

            {/* Description */}
            <View style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>
                {safeT('quoteRequest.descLabel', 'Describe your treatment needs')}
                <Text style={styles.required}> *</Text>
              </Text>
              <TextInput
                style={styles.textarea}
                placeholder={safeT('quoteRequest.descPlaceholder', 'e.g. I need a dental implant on my upper left molar. I had an X-ray last month...')}
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                value={description}
                onChangeText={setDescription}
                maxLength={2000}
              />
              <Text style={styles.charCount}>{description.length} / 2000</Text>
            </View>

            {/* Photo / File attachment */}
            <View style={styles.fieldCard}>
              <Text style={styles.fieldLabel}>
                {safeT('quoteRequest.photoLabel', 'Attach a photo')}
                <Text style={styles.optional}>  ({safeT('quoteRequest.optional', 'optional')})</Text>
              </Text>

              {attachment ? (
                /* Preview of uploaded file(s) */
                <View style={styles.previewBox}>
                  {/* Guided intraoral: thumbnail grid */}
                  {intraoralUrls.length > 0 ? (
                    <View style={styles.intraoralPreviewGrid}>
                      {Object.values(intraoralPhotos).slice(0, 5).map((asset: any, i) => (
                        <Image
                          key={i}
                          source={{ uri: asset.uri }}
                          style={styles.intraoralThumb}
                          resizeMode="cover"
                        />
                      ))}
                    </View>
                  ) : attachment.type === 'image' ? (
                    <Image source={{ uri: attachment.uri }} style={styles.previewImage} resizeMode="cover" />
                  ) : (
                    <View style={styles.previewDoc}>
                      <Text style={styles.previewDocIcon}>📄</Text>
                      <Text style={styles.previewDocName} numberOfLines={2}>{attachment.name}</Text>
                    </View>
                  )}
                  {/* Label for guided intraoral */}
                  {intraoralUrls.length > 0 && (
                    <View style={styles.intraoralBadge}>
                      <Text style={styles.intraoralBadgeText}>
                        📸 {intraoralUrls.length} {safeT('quoteRequest.intraoralCount', 'intraoral photos')}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.removeBtn} onPress={() => { setAttachment(null); setIntraoralUrls([]); setIntraoralPhotos({}); }}>
                    <Text style={styles.removeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : uploading ? (
                <View style={styles.uploadingBox}>
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text style={styles.uploadingText}>
                    {safeT('quoteRequest.uploading', 'Uploading...')}
                  </Text>
                </View>
              ) : (
                /* Attach button */
                <TouchableOpacity
                  style={styles.attachBtn}
                  activeOpacity={0.7}
                  onPress={() => setAttachMenu(true)}
                >
                  <Text style={styles.attachBtnIcon}>📎</Text>
                  <Text style={styles.attachBtnText}>
                    {safeT('quoteRequest.photoHint', 'Tap to add a photo (X-ray, intraoral, etc.)')}
                  </Text>
                  <Text style={styles.attachBtnArrow}>›</Text>
                </TouchableOpacity>
              )}
            </View>

          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.submitBtn, uploading && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={uploading}
            >
              <Text style={styles.submitBtnText}>
                {safeT('quoteRequest.sendBtn', `Send Request to ${cliniCount} Clinics`, { count: cliniCount })}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        {/* ── Attach action sheet ── */}
        <Modal
          visible={attachMenu}
          transparent
          animationType="slide"
          onRequestClose={() => setAttachMenu(false)}
        >
          <Pressable style={styles.sheetOverlay} onPress={() => setAttachMenu(false)}>
            <Pressable style={styles.sheet} onPress={e => e.stopPropagation()}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>
                {safeT('quoteRequest.photoLabel', 'Add a photo or file')}
              </Text>

              <TouchableOpacity style={styles.sheetRow} onPress={pickPhoto}>
                <Text style={styles.sheetRowIcon}>🖼️</Text>
                <View style={styles.sheetRowInfo}>
                  <Text style={styles.sheetRowLabel}>
                    {safeT('quoteRequest.pickPhoto', 'Select Photo')}
                  </Text>
                  <Text style={styles.sheetRowSub}>
                    {safeT('quoteRequest.pickPhotoSub', 'Choose from your gallery')}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetRow} onPress={pickFile}>
                <Text style={styles.sheetRowIcon}>📁</Text>
                <View style={styles.sheetRowInfo}>
                  <Text style={styles.sheetRowLabel}>
                    {safeT('quoteRequest.pickFile', 'Select File / X-ray')}
                  </Text>
                  <Text style={styles.sheetRowSub}>
                    {safeT('quoteRequest.pickFileSub', 'PDF or image from files')}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetRow} onPress={takePhoto}>
                <Text style={styles.sheetRowIcon}>📸</Text>
                <View style={styles.sheetRowInfo}>
                  <Text style={styles.sheetRowLabel}>
                    {safeT('quoteRequest.takePhoto', 'Take Intraoral Photo')}
                  </Text>
                  <Text style={styles.sheetRowSub}>
                    {safeT('quoteRequest.takePhotoSub', 'Open camera')}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity style={styles.sheetCancel} onPress={() => setAttachMenu(false)}>
                <Text style={styles.sheetCancelText}>
                  {safeT('common.cancel', 'Cancel')}
                </Text>
              </TouchableOpacity>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── Guided Intraoral Modal ── */}
        <IntraoralModal
          visible={intraoralVisible}
          step={intraoralStep}
          photos={intraoralPhotos}
          onClose={() => setIntraoralVisible(false)}
          onCapture={captureIntraoralStep}
          onNext={() => setIntraoralStep(p => Math.min(p + 1, PHOTO_STEP_KEYS.length - 1))}
          onPrev={() => setIntraoralStep(p => Math.max(p - 1, 0))}
          onSubmit={submitIntraoralPhotos}
          t={safeT}
        />
      </SafeAreaView>
    );
  }

  // ── Loading screen ────────────────────────────────────────────────────────
  if (phase === 'loading') {
    return (
      <SafeAreaView style={[styles.safe, styles.centerSafe]}>
        <ActivityIndicator size="large" color="#2563EB" style={{ marginBottom: 24 }} />
        <Text style={styles.loadingTitle}>
          {safeT('quoteRequest.sending', 'Sending to clinics...')}
        </Text>
        <View style={styles.clinicTickList}>
          {selectedClinics.map(c => {
            const done = sentIds.includes(c.id);
            return (
              <View key={c.id} style={styles.clinicTickRow}>
                <Text style={[styles.clinicTick, done && styles.clinicTickDone]}>
                  {done ? '✔' : '○'}
                </Text>
                <Text style={[styles.clinicTickName, done && styles.clinicTickNameDone]}>
                  {c.name}
                </Text>
              </View>
            );
          })}
        </View>
      </SafeAreaView>
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={[styles.safe, styles.centerSafe]}>
      <Text style={styles.successEmoji}>🎉</Text>
      <Text style={styles.successTitle}>
        {safeT('quoteRequest.successTitle', 'Your request has been sent')}
      </Text>
      <Text style={styles.successSub}>
        {safeT('quoteRequest.successSub', 'You will receive offers shortly')}
      </Text>

      <View style={styles.confirmList}>
        {selectedClinics.map(c => (
          <View key={c.id} style={styles.confirmRow}>
            <Text style={styles.confirmTick}>✔</Text>
            <Text style={styles.confirmName}>{c.name}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity
        style={styles.goBtn}
        onPress={() => router.replace('/my-requests' as any)}
        activeOpacity={0.85}
      >
        <Text style={styles.goBtnText}>
          {safeT('quoteRequest.goToRequests', 'Go to My Requests')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.homeLink}
        onPress={() => router.replace('/(patient)' as any)}
      >
        <Text style={styles.homeLinkText}>
          {safeT('quoteRequest.backToHome', 'Back to Home')}
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  centerSafe: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },

  // ── Form ──
  formScroll: { paddingBottom: 20 },
  formHeader: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  backBtn: { marginBottom: 14 },
  backBtnText: { fontSize: 15, color: '#2563EB', fontWeight: '600' },
  formTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 5 },
  formSubtitle: { fontSize: 13, color: '#6B7280', lineHeight: 18 },

  chipRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 20, paddingBottom: 14,
  },
  chip: {
    backgroundColor: '#EFF6FF', borderRadius: 20, borderWidth: 1,
    borderColor: '#BFDBFE', paddingHorizontal: 12, paddingVertical: 5, maxWidth: 160,
  },
  chipText: { fontSize: 12, color: '#2563EB', fontWeight: '600' },

  fieldCard: {
    backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 16, marginBottom: 12,
    padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 10 },
  required: { color: '#EF4444' },
  optional: { fontWeight: '400', color: '#9CA3AF' },

  textarea: {
    minHeight: 120, fontSize: 14, color: '#111827', lineHeight: 21,
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 5 },

  // Attach button (no attachment)
  attachBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: '#D1D5DB', borderStyle: 'dashed', borderRadius: 12,
    paddingVertical: 16, paddingHorizontal: 14, backgroundColor: '#F9FAFB',
  },
  attachBtnIcon: { fontSize: 22 },
  attachBtnText: { flex: 1, fontSize: 13, color: '#6B7280' },
  attachBtnArrow: { fontSize: 18, color: '#9CA3AF' },

  // Uploading indicator
  uploadingBox: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 18, justifyContent: 'center',
  },
  uploadingText: { fontSize: 14, color: '#6B7280' },

  // Attachment preview
  previewBox: {
    position: 'relative', borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  previewImage: { width: '100%', height: 180 },
  previewDoc: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 18, backgroundColor: '#F3F4F6',
  },
  previewDocIcon: { fontSize: 28 },
  previewDocName: { flex: 1, fontSize: 13, color: '#374151', fontWeight: '600' },
  removeBtn: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 14,
    width: 28, height: 28, alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Guided intraoral thumbnail grid
  intraoralPreviewGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 2,
  },
  intraoralThumb: {
    width: '33.2%', aspectRatio: 1,
  },
  intraoralBadge: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12, paddingVertical: 6,
  },
  intraoralBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },

  footer: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB',
    paddingVertical: 14, paddingHorizontal: 20,
  },
  submitBtn: {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center',
  },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },

  // ── Action sheet modal ──
  sheetOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20, paddingTop: 12,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB',
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 15, fontWeight: '700', color: '#111827',
    paddingHorizontal: 20, marginBottom: 8,
  },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  sheetRowIcon: { fontSize: 26, width: 36, textAlign: 'center' },
  sheetRowInfo: { flex: 1 },
  sheetRowLabel: { fontSize: 15, fontWeight: '600', color: '#111827' },
  sheetRowSub:   { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  sheetCancel: {
    marginTop: 8, marginHorizontal: 16, borderRadius: 12,
    backgroundColor: '#F3F4F6', paddingVertical: 14, alignItems: 'center',
  },
  sheetCancelText: { fontSize: 15, fontWeight: '700', color: '#374151' },

  // ── Loading ──
  loadingTitle: {
    fontSize: 18, fontWeight: '700', color: '#111827',
    marginBottom: 24, textAlign: 'center',
  },
  clinicTickList: { gap: 12, width: '100%', paddingHorizontal: 8 },
  clinicTickRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  clinicTick: { fontSize: 18, color: '#D1D5DB', width: 24, textAlign: 'center' },
  clinicTickDone: { color: '#16A34A' },
  clinicTickName: { fontSize: 15, color: '#6B7280', fontWeight: '600', flex: 1 },
  clinicTickNameDone: { color: '#111827' },

  // ── Success ──
  successEmoji: { fontSize: 56, marginBottom: 16, textAlign: 'center' },
  successTitle: {
    fontSize: 22, fontWeight: '800', color: '#111827',
    marginBottom: 8, textAlign: 'center',
  },
  successSub: {
    fontSize: 14, color: '#6B7280', lineHeight: 20,
    textAlign: 'center', marginBottom: 24,
  },
  confirmList: {
    width: '100%', gap: 10, marginBottom: 28,
    backgroundColor: '#F0FDF4', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#BBF7D0',
  },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  confirmTick: { fontSize: 16, color: '#16A34A', width: 22, textAlign: 'center' },
  confirmName: { fontSize: 14, fontWeight: '600', color: '#166534', flex: 1 },

  goBtn: {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center',
    width: '100%', marginBottom: 12,
  },
  goBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  homeLink: { paddingVertical: 8 },
  homeLinkText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
});

// ─── Guided Intraoral Modal ────────────────────────────────────────────────────

function IntraoralModal({ visible, step, photos, onClose, onCapture, onNext, onPrev, onSubmit, t }: {
  visible: boolean;
  step: number;
  photos: Record<string, any>;
  onClose: () => void;
  onCapture: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSubmit: () => void;
  t: (key: string, fallback: string, p?: Record<string, string | number>) => string;
}) {
  const currentKey = PHOTO_STEP_KEYS[step];
  const photo      = photos[currentKey?.key];
  const doneCount  = Object.keys(photos).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={im.container}>
        {/* Header */}
        <View style={im.header}>
          <TouchableOpacity onPress={onClose} style={im.closeBtn}>
            <Text style={im.closeText}>✕</Text>
          </TouchableOpacity>
          <Text style={im.title}>{t('messages.intraoral.title', 'Intraoral Photos')}</Text>
          <Text style={im.badge}>{doneCount}/{PHOTO_STEP_KEYS.length}</Text>
        </View>

        {/* Progress dots */}
        <View style={im.dots}>
          {PHOTO_STEP_KEYS.map((st, i) => (
            <View key={st.key} style={[im.dot, i === step && im.dotActive, photos[st.key] && im.dotDone]}>
              <Text style={[im.dotText, i === step && im.dotTextActive]}>
                {photos[st.key] ? '✓' : String(i + 1)}
              </Text>
            </View>
          ))}
        </View>

        <ScrollView contentContainerStyle={im.body} showsVerticalScrollIndicator={false}>
          <Text style={im.stepIcon}>{currentKey.icon}</Text>
          <Text style={im.stepLabel}>
            {t(`messages.intraoral.${currentKey.key}.label`, currentKey.key)}
          </Text>
          <Text style={im.stepInstruction}>
            {t(`messages.intraoral.${currentKey.key}.instruction`, '')}
          </Text>

          {photo ? (
            <Image source={{ uri: photo.uri }} style={im.preview} resizeMode="cover" />
          ) : (
            <View style={im.placeholder}>
              <Text style={im.placeholderIcon}>📷</Text>
              <Text style={im.placeholderText}>{t('messages.intraoral.noPhoto', 'No photo yet')}</Text>
            </View>
          )}

          <TouchableOpacity style={im.cameraBtn} onPress={onCapture} activeOpacity={0.85}>
            <Text style={im.cameraBtnText}>
              {photo
                ? t('messages.intraoral.retake', 'Retake')
                : t('messages.intraoral.capture', 'Take Photo')}
            </Text>
          </TouchableOpacity>

          <View style={im.navRow}>
            <TouchableOpacity
              style={[im.navBtn, step === 0 && im.navBtnOff]}
              onPress={onPrev}
              disabled={step === 0}
              activeOpacity={0.8}
            >
              <Text style={im.navBtnText}>{t('messages.intraoral.prev', 'Back')}</Text>
            </TouchableOpacity>

            {step < PHOTO_STEP_KEYS.length - 1 ? (
              <TouchableOpacity style={im.navBtn} onPress={onNext} activeOpacity={0.8}>
                <Text style={im.navBtnText}>{t('messages.intraoral.next', 'Next')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[im.navBtn, im.submitBtn, doneCount === 0 && im.navBtnOff]}
                onPress={onSubmit}
                disabled={doneCount === 0}
                activeOpacity={0.85}
              >
                <Text style={[im.navBtnText, im.submitBtnText]}>
                  {t('messages.intraoral.submit', 'Send {count} Photos').replace('{count}', String(doneCount))}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={im.hint}>{t('messages.intraoral.hint', '')}</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const im = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  closeBtn:  { padding: 4 },
  closeText: { fontSize: 18, color: '#6B7280' },
  title:     { fontSize: 17, fontWeight: '800', color: '#111827' },
  badge:     { fontSize: 13, fontWeight: '700', color: '#2563EB' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, paddingVertical: 16 },
  dot: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3F4F6',
    borderWidth: 1.5, borderColor: '#E5E7EB',
    justifyContent: 'center', alignItems: 'center',
  },
  dotActive:     { backgroundColor: '#EFF6FF', borderColor: '#2563EB' },
  dotDone:       { backgroundColor: '#D1FAE5', borderColor: '#10B981' },
  dotText:       { fontSize: 12, fontWeight: '700', color: '#9CA3AF' },
  dotTextActive: { color: '#2563EB' },
  body:            { padding: 20, alignItems: 'center', gap: 14, paddingBottom: 40 },
  stepIcon:        { fontSize: 52 },
  stepLabel:       { fontSize: 22, fontWeight: '800', color: '#111827' },
  stepInstruction: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
  preview: { width: '100%', height: 230, borderRadius: 14, marginTop: 4 },
  placeholder: {
    width: '100%', height: 230, borderRadius: 14, backgroundColor: '#F8FAFC',
    borderWidth: 2, borderColor: '#E5E7EB', borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  placeholderIcon: { fontSize: 40 },
  placeholderText: { fontSize: 14, color: '#9CA3AF' },
  cameraBtn:     { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40 },
  cameraBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  navRow: { flexDirection: 'row', gap: 12, width: '100%' },
  navBtn: {
    flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center',
    backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB',
  },
  navBtnOff:     { opacity: 0.35 },
  navBtnText:    { fontSize: 14, fontWeight: '600', color: '#374151' },
  submitBtn:     { backgroundColor: '#065F46', borderColor: '#10B981' },
  submitBtnText: { color: '#fff' },
  hint: { fontSize: 11, color: '#9CA3AF', textAlign: 'center', lineHeight: 17 },
});
