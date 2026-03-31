import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/language-context';

const API_BASE: string =
  (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_API_BASE)
    ? String(process.env.EXPO_PUBLIC_API_BASE).replace(/\/+$/, '')
    : (typeof process !== 'undefined' && process.env.EXPO_PUBLIC_API_URL)
      ? String(process.env.EXPO_PUBLIC_API_URL).replace(/\/+$/, '')
      : 'https://cliniflow-backend-dg8a.onrender.com';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type PhotoStep = {
  id: number;
  instruction: string;
  countdown: number;
  guide: 'front' | 'right' | 'left' | 'upper' | 'lower';
};

const PHOTO_SEQUENCE: PhotoStep[] = [
  { id: 0, instruction: 'chat.intraoralCameraInstruction1', countdown: 3, guide: 'front' },
  { id: 1, instruction: 'chat.intraoralCameraInstruction2', countdown: 4, guide: 'right' },
  { id: 2, instruction: 'chat.intraoralCameraInstruction3', countdown: 4, guide: 'left' },
  { id: 3, instruction: 'chat.intraoralCameraInstruction4', countdown: 5, guide: 'upper' },
  { id: 4, instruction: 'chat.intraoralCameraInstruction5', countdown: 5, guide: 'lower' },
];

export default function IntraoralCameraScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const { t } = useLanguage();

  const patientId =
    (user as any)?.patientId ||
    (user as any)?.id ||
    (params.patientId as string) ||
    (params.patient_id as string);

  const [permission, requestPermission] = useCameraPermissions();
  const [currentStep, setCurrentStep] = useState(0);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [done, setDone] = useState(false);

  const cameraRef = useRef<CameraView>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stabilizeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const patientIdRef = useRef<string | null>(patientId);

  useEffect(() => {
    patientIdRef.current = patientId;
  }, [patientId]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (stabilizeTimerRef.current) clearTimeout(stabilizeTimerRef.current);
    };
  }, []);

  // ── Auto-start countdown whenever a new step becomes active ─────────────────
  // Triggers on: welcome dismissed, step advance, retake (previewUri → null)
  useEffect(() => {
    if (
      showWelcome ||
      previewUri !== null ||
      uploading ||
      done ||
      !permission?.granted
    ) return;

    // Small delay so camera sensor can stabilise after step change
    if (stabilizeTimerRef.current) clearTimeout(stabilizeTimerRef.current);
    stabilizeTimerRef.current = setTimeout(() => {
      beginCountdown(PHOTO_SEQUENCE[currentStep].countdown);
    }, 800);

    return () => {
      if (stabilizeTimerRef.current) clearTimeout(stabilizeTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWelcome, currentStep, previewUri, uploading, done, permission?.granted]);

  function beginCountdown(seconds: number) {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);

    setCountdown(seconds);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        return prev - 1;
      });
    }, 1000);
  }

  // Auto-capture when countdown hits 0
  useEffect(() => {
    if (countdown === 0 && !isCapturing && !previewUri) {
      capturePhoto();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  async function capturePhoto() {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.95, base64: false });
      if (photo?.uri) {
        setPreviewUri(photo.uri);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err: any) {
      console.error('[CAMERA] Capture error:', err);
      Alert.alert('Hata', 'Fotoğraf çekilemedi: ' + (err.message || 'Bilinmeyen hata'));
    } finally {
      setIsCapturing(false);
    }
  }

  const handleRetake = useCallback(() => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    setPreviewUri(null);
    setCountdown(null);
    // Auto-countdown will restart via the effect above
  }, []);

  const handleConfirm = useCallback(() => {
    const newPhotos = [...capturedPhotos, previewUri!];
    setCapturedPhotos(newPhotos);
    setPreviewUri(null);
    setCountdown(null);

    if (currentStep < PHOTO_SEQUENCE.length - 1) {
      setCurrentStep(currentStep + 1);
      // Auto-countdown fires via effect when previewUri becomes null + step changes
    } else {
      uploadPhotos(newPhotos);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturedPhotos, previewUri, currentStep]);

  async function uploadPhotos(photos: string[]) {
    const pid = patientIdRef.current || patientId;
    if (!pid || photos.length === 0) {
      Alert.alert('Hata', 'Hasta bilgisi veya fotoğraf bulunamadı.');
      return;
    }

    setUploading(true);

    try {
      let token: string | null = null;

      if ((user as any)?.token) {
        token = (user as any).token;
      } else {
        const authData = await AsyncStorage.getItem('cliniflow.auth.v1');
        if (authData) {
          try { const p = JSON.parse(authData); token = p.token || p.accessToken || p.user?.token || null; }
          catch { /* ignore */ }
        }
        if (!token) {
          const alt = await AsyncStorage.getItem('auth_data');
          if (alt) {
            try { const p = JSON.parse(alt); token = p.token || p.accessToken || null; }
            catch { /* ignore */ }
          }
        }
        if (!token) token = await AsyncStorage.getItem('auth_token');
      }

      if (!token) throw new Error('Authentication token not found');

      for (let i = 0; i < photos.length; i++) {
        const uri = photos[i];
        const shotType = PHOTO_SEQUENCE[i]?.guide ?? `shot_${i}`;
        const fileName = `intraoral_${shotType}_${Date.now()}.jpg`;

        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists) throw new Error(`File not found: ${uri}`);

        const formData = new FormData();
        formData.append('file', { uri, type: 'image/jpeg', name: fileName } as any);
        formData.append('patientId', pid);
        formData.append('shotType', shotType);

        console.log(`[CAMERA] Uploading ${i + 1}/${photos.length} shotType=${shotType}`);

        const res = await fetch(`${API_BASE}/api/patient/${pid}/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || err.message || `Upload failed: ${res.status}`);
        }
      }

      setDone(true);
    } catch (err: any) {
      console.error('[CAMERA] Upload error:', err);
      Alert.alert('Hata', 'Fotoğraflar yüklenemedi: ' + (err.message || 'Bilinmeyen hata'));
    } finally {
      setUploading(false);
    }
  }

  // ── Gate renders ─────────────────────────────────────────────────────────────

  if (!permission) {
    return (
      <View style={s.container}>
        <View style={s.center}><ActivityIndicator size="large" color="#2563EB" /></View>
      </View>
    );
  }

  if (!patientId) {
    return (
      <View style={s.container}>
        <View style={s.card}>
          <Text style={s.icon}>⚠️</Text>
          <Text style={s.title}>Hasta Bilgisi Bulunamadı</Text>
          <Text style={s.body}>Lütfen mesajlar sayfasından tekrar deneyin.</Text>
          <Pressable style={s.btn} onPress={() => router.back()}>
            <Text style={s.btnTxt}>Geri Dön</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={s.container}>
        <View style={s.card}>
          <Text style={s.icon}>📷</Text>
          <Text style={s.title}>Kamera İzni Gerekli</Text>
          <Text style={s.body}>İntraoral fotoğraf çekmek için kamera erişimine ihtiyacımız var.</Text>
          <Pressable style={s.btn} onPress={requestPermission}>
            <Text style={s.btnTxt}>İzin Ver</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Done screen ───────────────────────────────────────────────────────────────
  if (done) {
    return (
      <View style={s.container}>
        <View style={s.card}>
          <Text style={s.icon}>✅</Text>
          <Text style={s.title}>Analiz Tamamlandı</Text>
          <Text style={s.body}>
            {PHOTO_SEQUENCE.length} fotoğrafınız başarıyla gönderildi.{'\n\n'}
            Klinik ekibimiz görüntüleri inceleyecek ve sizinle iletişime geçecektir.{'\n\n'}
            Bu fotoğraflar yalnızca ön değerlendirme amaçlıdır. Nihai tanı klinik muayenesiyle yapılır.
          </Text>
          <Pressable style={s.btn} onPress={() => router.back()}>
            <Text style={s.btnTxt}>Mesajlara Dön</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Welcome screen ────────────────────────────────────────────────────────────
  if (showWelcome) {
    return (
      <View style={s.container}>
        <View style={s.card}>
          <Text style={s.icon}>📸</Text>
          <Text style={s.title}>{t('chat.intraoralPhotoGuideTitle')}</Text>
          <View style={s.guideList}>
            {[
              { bullet: '💧', key: 'chat.intraoralPhotoGuide1' },
              { bullet: '💡', key: 'chat.intraoralPhotoGuide2' },
              { bullet: '📋', key: 'chat.intraoralPhotoGuide3' },
            ].map((g) => (
              <View key={g.key} style={s.guideItem}>
                <Text style={s.bullet}>{g.bullet}</Text>
                <Text style={s.guideText}>{t(g.key)}</Text>
              </View>
            ))}
          </View>
          <Text style={s.autoNote}>Fotoğraflar otomatik çekilecektir — sadece hazır olun.</Text>
          <Pressable style={s.btn} onPress={() => setShowWelcome(false)}>
            <Text style={s.btnTxt}>{t('common.understood')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Preview screen ────────────────────────────────────────────────────────────
  if (previewUri) {
    const currentDate = new Date().toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
    return (
      <View style={s.container}>
        <View style={{ flex: 1 }}>
          <Image source={{ uri: previewUri }} style={s.previewImage} />
          <View style={s.watermark}>
            <Text style={s.watermarkTxt}>Clinifly</Text>
            <Text style={s.watermarkDate}>{currentDate}</Text>
          </View>
        </View>
        <View style={s.previewBar}>
          <Text style={s.stepLabel}>{currentStep + 1} / {PHOTO_SEQUENCE.length}</Text>
          <View style={s.previewBtns}>
            <Pressable style={[s.previewBtn, s.retakeBtn]} onPress={handleRetake}>
              <Text style={s.previewBtnTxt}>Tekrar Çek</Text>
            </Pressable>
            <Pressable style={[s.previewBtn, s.confirmBtn]} onPress={handleConfirm}>
              <Text style={s.previewBtnTxt}>Devam Et</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ── Camera screen ─────────────────────────────────────────────────────────────
  const step = PHOTO_SEQUENCE[currentStep];
  const guideLabel = {
    front: t('chat.intraoralCameraGuideFront'),
    right: t('chat.intraoralCameraGuideRight'),
    left:  t('chat.intraoralCameraGuideLeft'),
    upper: t('chat.intraoralCameraGuideUpper'),
    lower: t('chat.intraoralCameraGuideLower'),
  }[step.guide];

  return (
    <View style={s.container}>
      <CameraView ref={cameraRef} style={s.camera} facing={'front' as CameraType} mode="picture">
        <View style={s.overlay}>

          {/* Header */}
          <View style={s.header}>
            <Pressable
              style={s.closeBtn}
              onPress={() => {
                if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                if (stabilizeTimerRef.current) clearTimeout(stabilizeTimerRef.current);
                router.back();
              }}
            >
              <Text style={s.closeTxt}>✕</Text>
            </Pressable>
            <Text style={s.headerTitle}>{currentStep + 1} / {PHOTO_SEQUENCE.length}</Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Instruction */}
          <View style={s.instructionWrap}>
            <Text style={s.instruction}>{t(step.instruction)}</Text>
          </View>

          {/* Countdown */}
          {countdown !== null && (
            <View style={s.countdownWrap}>
              {countdown > 0
                ? <Text style={s.countdown}>{countdown}</Text>
                : <Text style={s.snapIcon}>📸</Text>
              }
            </View>
          )}

          {/* Alignment guide frame */}
          <View style={s.guideOverlay} pointerEvents="none">
            <View style={s.guideFrame}>
              <Text style={s.guideFrameTxt}>{guideLabel}</Text>
            </View>
          </View>

          {/* Status bar — no capture button */}
          <View style={s.statusBar}>
            {isCapturing
              ? <ActivityIndicator color="#fff" />
              : countdown !== null && countdown > 0
                ? <Text style={s.statusTxt}>Hazırlanın…</Text>
                : null
            }
          </View>

        </View>
      </CameraView>

      {uploading && (
        <View style={s.uploadOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={s.uploadTxt}>Fotoğraflar yükleniyor… ({capturedPhotos.length}/{PHOTO_SEQUENCE.length})</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center:    { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // ── Card (welcome / done / error) ────────────────────────────────────────────
  card: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#000',
  },
  icon:  { fontSize: 64, marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 12, textAlign: 'center' },
  body:  { fontSize: 15, color: '#ccc', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  btn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 40,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontSize: 17, fontWeight: '600' },

  // ── Welcome extras ────────────────────────────────────────────────────────────
  guideList:  { width: '100%', maxWidth: 400, marginBottom: 28 },
  guideItem:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18, paddingHorizontal: 8 },
  bullet:     { fontSize: 22, marginRight: 12, marginTop: 2 },
  guideText:  { flex: 1, fontSize: 14, color: '#ccc', lineHeight: 20 },
  autoNote:   { fontSize: 13, color: '#60a5fa', textAlign: 'center', marginBottom: 24, fontStyle: 'italic' },

  // ── Camera overlay ────────────────────────────────────────────────────────────
  camera:  { flex: 1 },
  overlay: { flex: 1, backgroundColor: 'transparent' },
  header:  {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
  },
  closeBtn:    { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  closeTxt:    { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '600' },

  instructionWrap: {
    position: 'absolute',
    top: '18%',
    left: 0,
    right: 0,
    paddingHorizontal: 28,
  },
  instruction: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    padding: 14,
    borderRadius: 12,
  },

  countdownWrap: {
    position: 'absolute',
    top: '45%',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  countdown: {
    fontSize: 120,
    fontWeight: '800',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 10,
  },
  snapIcon: { fontSize: 80 },

  guideOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guideFrame: {
    width: SCREEN_WIDTH * 0.75,
    height: SCREEN_HEIGHT * 0.33,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.65)',
    borderRadius: 24,
    borderStyle: 'dashed',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  guideFrameTxt: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },

  statusBar: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  statusTxt: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },

  // ── Preview ───────────────────────────────────────────────────────────────────
  previewImage: { flex: 1, width: '100%' },
  watermark: {
    position: 'absolute',
    bottom: 90,
    left: 16,
  },
  watermarkTxt:  { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  watermarkDate: { color: 'rgba(255,255,255,0.65)', fontSize: 11 },

  previewBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  stepLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 14,
  },
  previewBtns: { flexDirection: 'row', gap: 12 },
  previewBtn:  { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center' },
  retakeBtn:   { backgroundColor: '#ef4444' },
  confirmBtn:  { backgroundColor: '#16a34a' },
  previewBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '600' },

  // ── Upload overlay ────────────────────────────────────────────────────────────
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  uploadTxt: { color: '#fff', fontSize: 16, textAlign: 'center' },

  // Legacy — kept so TS doesn't complain if referenced elsewhere
  previewImageContainer: { flex: 1 },
  watermarkContainer:    { position: 'absolute', bottom: 90, left: 16 },
  watermarkText:         { color: 'rgba(255,255,255,0.85)', fontSize: 13 },
  watermarkDate:         { color: 'rgba(255,255,255,0.65)', fontSize: 11 },
});
