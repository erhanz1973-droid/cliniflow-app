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
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/language-context';
import { fireIntraoralPhotoReady } from '../lib/photoCallbacks';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const COUNTDOWN_SECONDS = 3;

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
  const [isCapturing, setIsCapturing]   = useState(false);
  const [countdown, setCountdown]       = useState<number | null>(null);
  const [previewUri, setPreviewUri]     = useState<string | null>(null);
  const [showWelcome, setShowWelcome]   = useState(true);

  const cameraRef            = useRef<CameraView>(null);
  const countdownRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const stabilizeRef         = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current)  clearInterval(countdownRef.current);
      if (stabilizeRef.current)  clearTimeout(stabilizeRef.current);
    };
  }, []);

  // Auto-start countdown when camera is ready
  useEffect(() => {
    if (showWelcome || previewUri !== null || !permission?.granted) return;

    if (stabilizeRef.current) clearTimeout(stabilizeRef.current);
    stabilizeRef.current = setTimeout(() => {
      beginCountdown(COUNTDOWN_SECONDS);
    }, 800);

    return () => {
      if (stabilizeRef.current) clearTimeout(stabilizeRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showWelcome, previewUri, permission?.granted]);

  function beginCountdown(seconds: number) {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setCountdown(seconds);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev === null || prev <= 1) {
          if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
          return 0;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        return prev - 1;
      });
    }, 1000);
  }

  // Auto-capture when countdown hits 0
  useEffect(() => {
    if (countdown === 0 && !isCapturing && !previewUri) capturePhoto();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown]);

  async function capturePhoto() {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.92, base64: false });
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
    if (countdownRef.current) clearInterval(countdownRef.current);
    setPreviewUri(null);
    setCountdown(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!previewUri) return;
    const name = `intraoral_front_${Date.now()}.jpg`;
    // Hand off to MessagesScreen AI pipeline via the bridge
    fireIntraoralPhotoReady(previewUri, name, 'image/jpeg', 'front');
    router.back();
  }, [previewUri, router]);

  const handleClose = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (stabilizeRef.current) clearTimeout(stabilizeRef.current);
    router.back();
  }, [router]);

  // ── Gate renders ─────────────────────────────────────────────────────────────

  if (!permission) {
    return <View style={s.container}><ActivityIndicator size="large" color="#2563EB" /></View>;
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
          <Text style={s.body}>Fotoğraf çekmek için kamera erişimine ihtiyacımız var.</Text>
          <Pressable style={s.btn} onPress={requestPermission}>
            <Text style={s.btnTxt}>İzin Ver</Text>
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
          <Text style={s.icon}>🦷</Text>
          <Text style={s.title}>Diş Fotoğrafı Çek</Text>
          <Text style={s.body}>
            Ön dişlerinizi kameraya doğrultun.{'\n'}
            Fotoğraf otomatik çekilecek.{'\n\n'}
            AI analiziniz birkaç saniye içinde hazır olacak.
          </Text>
          <Pressable style={s.btn} onPress={() => setShowWelcome(false)}>
            <Text style={s.btnTxt}>Başla</Text>
          </Pressable>
          <Pressable style={s.skipBtn} onPress={handleClose}>
            <Text style={s.skipTxt}>Vazgeç</Text>
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
          <Image source={{ uri: previewUri }} style={s.previewImage} resizeMode="cover" />
          <View style={s.watermark}>
            <Text style={s.watermarkTxt}>Clinifly</Text>
            <Text style={s.watermarkDate}>{currentDate}</Text>
          </View>
        </View>
        <View style={s.previewBar}>
          <Text style={s.previewHint}>Fotoğraf uygunsa onaylayın, aksi hâlde tekrar çekin.</Text>
          <View style={s.previewBtns}>
            <Pressable style={[s.previewBtn, s.retakeBtn]} onPress={handleRetake}>
              <Text style={s.previewBtnTxt}>🔄 Tekrar Çek</Text>
            </Pressable>
            <Pressable style={[s.previewBtn, s.confirmBtn]} onPress={handleConfirm}>
              <Text style={s.previewBtnTxt}>✓ Analiz Et</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ── Camera screen ─────────────────────────────────────────────────────────────

  return (
    <View style={s.container}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFillObject}
        facing={'front' as CameraType}
        mode="picture"
      />

      <View style={s.overlay} pointerEvents="box-none">

        {/* Header */}
        <View style={s.header}>
          <Pressable style={s.closeBtn} onPress={handleClose}>
            <Text style={s.closeTxt}>✕</Text>
          </Pressable>
          <Text style={s.headerTitle}>Diş Fotoğrafı</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* Instruction */}
        <View style={s.instructionWrap}>
          <Text style={s.instruction}>Ön dişlerinizi çerçeve içine hizalayın</Text>
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

        {/* Guide frame */}
        <View style={s.guideOverlay} pointerEvents="none">
          <View style={s.guideFrame}>
            <Text style={s.guideFrameTxt}>Ön Diş</Text>
          </View>
        </View>

        {/* Status */}
        <View style={s.statusBar}>
          {isCapturing
            ? <ActivityIndicator color="#fff" />
            : countdown !== null && countdown > 0
              ? <Text style={s.statusTxt}>Hazırlanın…</Text>
              : null
          }
        </View>

      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // ── Card ──────────────────────────────────────────────────────────────────────
  card: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    padding: 32, backgroundColor: '#000',
  },
  icon:  { fontSize: 64, marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 12, textAlign: 'center' },
  body:  { fontSize: 15, color: '#ccc', textAlign: 'center', lineHeight: 24, marginBottom: 36 },
  btn: {
    backgroundColor: '#2563EB', paddingHorizontal: 48, paddingVertical: 16,
    borderRadius: 14, minWidth: 220, alignItems: 'center', marginBottom: 12,
  },
  btnTxt:  { color: '#fff', fontSize: 17, fontWeight: '700' },
  skipBtn: { paddingVertical: 10 },
  skipTxt: { color: '#6b7280', fontSize: 15 },

  // ── Camera overlay ────────────────────────────────────────────────────────────
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, paddingTop: Platform.OS === 'ios' ? 54 : 16,
  },
  closeBtn:    { padding: 8, minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  closeTxt:    { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },

  instructionWrap: {
    position: 'absolute', top: '16%', left: 0, right: 0, paddingHorizontal: 28,
  },
  instruction: {
    color: '#fff', fontSize: 17, fontWeight: '600', textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)', padding: 14, borderRadius: 12,
  },

  countdownWrap: {
    position: 'absolute', top: '44%', left: 0, right: 0, alignItems: 'center',
  },
  countdown: {
    fontSize: 120, fontWeight: '800', color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 10,
  },
  snapIcon: { fontSize: 80 },

  guideOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    justifyContent: 'center', alignItems: 'center',
  },
  guideFrame: {
    width: SCREEN_WIDTH * 0.75, height: SCREEN_HEIGHT * 0.32,
    borderWidth: 3, borderColor: 'rgba(255,255,255,0.65)',
    borderRadius: 24, borderStyle: 'dashed',
    justifyContent: 'flex-end', alignItems: 'center',
    paddingBottom: 12, backgroundColor: 'rgba(0,0,0,0.12)',
  },
  guideFrameTxt: {
    color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10,
  },

  statusBar: { position: 'absolute', bottom: 50, left: 0, right: 0, alignItems: 'center' },
  statusTxt: {
    color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20,
  },

  // ── Preview ───────────────────────────────────────────────────────────────────
  previewImage: { flex: 1, width: '100%' },
  watermark: { position: 'absolute', bottom: 100, left: 16 },
  watermarkTxt:  { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' },
  watermarkDate: { color: 'rgba(255,255,255,0.65)', fontSize: 11 },
  previewBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.88)', padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 38 : 20,
  },
  previewHint: {
    color: 'rgba(255,255,255,0.75)', fontSize: 13, textAlign: 'center', marginBottom: 14,
  },
  previewBtns: { flexDirection: 'row', gap: 12 },
  previewBtn:  { flex: 1, padding: 16, borderRadius: 14, alignItems: 'center' },
  retakeBtn:   { backgroundColor: '#ef4444' },
  confirmBtn:  { backgroundColor: '#16a34a' },
  previewBtnTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
