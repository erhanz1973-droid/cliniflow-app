import React, { useState, useEffect, useRef } from 'react';
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
import { API_BASE } from '../lib/api';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type PhotoStep = {
  id: number;
  instruction: string;
  countdown: number;
  guide: 'front' | 'right' | 'left' | 'upper' | 'lower';
};

const PHOTO_SEQUENCE: PhotoStep[] = [
  {
    id: 0,
    instruction: 'chat.intraoralCameraInstruction1',
    countdown: 3,
    guide: 'front',
  },
  {
    id: 1,
    instruction: 'chat.intraoralCameraInstruction2',
    countdown: 4,
    guide: 'right',
  },
  {
    id: 2,
    instruction: 'chat.intraoralCameraInstruction3',
    countdown: 4,
    guide: 'left',
  },
  {
    id: 3,
    instruction: 'chat.intraoralCameraInstruction4',
    countdown: 5,
    guide: 'upper',
  },
  {
    id: 4,
    instruction: 'chat.intraoralCameraInstruction5',
    countdown: 5,
    guide: 'lower',
  },
];

export default function IntraoralCameraScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user } = useAuth();
  const { t } = useLanguage();
  const patientId = (params.patientId as string) || (params.patient_id as string);
  const chatId = (params.chatId as string) || (params.chat_id as string) || patientId;
  
  console.log('[CAMERA] Params:', { patientId, chatId, allParams: params });
  console.log('[CAMERA] User:', user ? { id: user.id, hasToken: !!user.token } : 'null');

  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [currentStep, setCurrentStep] = useState(0);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [clinicName, setClinicName] = useState<string>('');

  const cameraRef = useRef<CameraView>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const patientIdRef = useRef<string | null>(patientId);
  const chatIdRef = useRef<string | null>(chatId);

  // Update refs when params change
  useEffect(() => {
    patientIdRef.current = patientId;
    chatIdRef.current = chatId;
    console.log('[CAMERA] Screen mounted with params:', { patientId, chatId, allParams: params });
    if (!patientId) {
      console.warn('[CAMERA] WARNING: No patientId found in params!');
    }
  }, [patientId, chatId, params]);

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (countdown === 0 && !isCapturing && !previewUri) {
      capturePhoto();
    }
  }, [countdown, isCapturing, previewUri]);

  if (!permission) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </View>
    );
  }
  
  if (!patientId) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionIcon}>⚠️</Text>
          <Text style={styles.permissionTitle}>Hasta Bilgisi Bulunamadı</Text>
          <Text style={styles.permissionText}>
            Hasta bilgisi eksik. Lütfen chat sayfasından tekrar deneyin.
            {'\n\n'}
            Parametreler: {JSON.stringify(params)}
          </Text>
          <Pressable style={styles.permissionBtn} onPress={() => router.back()}>
            <Text style={styles.permissionBtnText}>Geri Dön</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Text style={styles.permissionIcon}>📷</Text>
          <Text style={styles.permissionTitle}>Kamera İzni Gerekli</Text>
          <Text style={styles.permissionText}>
            İntraoral fotoğraf çekmek için kamera erişimine ihtiyacımız var.
            {'\n'}
            Lütfen kamera iznini verin.
          </Text>
          <Pressable style={styles.permissionBtn} onPress={requestPermission}>
            <Text style={styles.permissionBtnText}>İzin Ver</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Welcome screen with pre-capture guidance
  if (showWelcome) {
    return (
      <View style={styles.container}>
        <View style={styles.welcomeContainer}>
          <Text style={styles.welcomeIcon}>📸</Text>
          <Text style={styles.welcomeTitle}>{t('chat.intraoralPhotoGuideTitle')}</Text>
          
          <View style={styles.guidanceList}>
            <View style={styles.guidanceItem}>
              <Text style={styles.guidanceBullet}>💧</Text>
              <Text style={styles.guidanceText}>
                {t('chat.intraoralPhotoGuide1')}
              </Text>
            </View>
            
            <View style={styles.guidanceItem}>
              <Text style={styles.guidanceBullet}>💡</Text>
              <Text style={styles.guidanceText}>
                {t('chat.intraoralPhotoGuide2')}
              </Text>
            </View>
            
            <View style={styles.guidanceItem}>
              <Text style={styles.guidanceBullet}>📋</Text>
              <Text style={styles.guidanceText}>
                {t('chat.intraoralPhotoGuide3')}
              </Text>
            </View>
          </View>
          
          <Pressable 
            style={styles.welcomeBtn} 
            onPress={() => setShowWelcome(false)}
          >
            <Text style={styles.welcomeBtnText}>{t('common.understood')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (previewUri) {
    const currentPhoto = PHOTO_SEQUENCE[currentStep];
    const currentDate = new Date().toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    const watermarkText = clinicName ? `Clinifly • ${clinicName}` : 'Clinifly';
    
    return (
      <View style={styles.container}>
        <View style={styles.previewImageContainer}>
          <Image source={{ uri: previewUri }} style={styles.previewImage} />
          {/* Watermark overlay - bottom left corner */}
          <View style={styles.watermarkContainer}>
            <Text style={styles.watermarkText}>{watermarkText}</Text>
            <Text style={styles.watermarkDate}>{currentDate}</Text>
          </View>
        </View>
        <View style={styles.previewOverlay}>
          <Text style={styles.previewStepText}>
            {currentStep + 1} / {PHOTO_SEQUENCE.length}
          </Text>
          <View style={styles.previewButtons}>
            <Pressable
              style={[styles.previewBtn, styles.retakeBtn]}
              onPress={() => {
                setPreviewUri(null);
                setCountdown(null);
              }}
            >
              <Text style={styles.previewBtnText}>Tekrar Çek</Text>
            </Pressable>
            <Pressable
              style={[styles.previewBtn, styles.continueBtn]}
              onPress={() => {
                const newPhotos = [...capturedPhotos, previewUri];
                setCapturedPhotos(newPhotos);
                setPreviewUri(null);
                setCountdown(null);

                if (currentStep < PHOTO_SEQUENCE.length - 1) {
                  setCurrentStep(currentStep + 1);
                } else {
                  // All photos captured, upload
                  uploadPhotos(newPhotos);
                }
              }}
            >
              <Text style={styles.previewBtnText}>Devam Et</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  const currentPhoto = PHOTO_SEQUENCE[currentStep];

  async function startCountdown() {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    setCountdown(currentPhoto.countdown);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          return 0;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return prev - 1;
      });
    }, 1000);
  }

  async function capturePhoto() {
    if (!cameraRef.current || isCapturing) return;

    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.95, // High quality for clinical use, minimal compression
        base64: false,
      });

      if (photo?.uri) {
        // Use original photo - NO color changes, NO filters, NO manipulation
        // We keep original colors completely intact for clinical accuracy
        // Only compression is applied by camera (quality: 0.95)
        setPreviewUri(photo.uri);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error: any) {
      console.error('[CAMERA] Capture error:', error);
      Alert.alert('Hata', 'Fotoğraf çekilemedi: ' + (error.message || 'Bilinmeyen hata'));
    } finally {
      setIsCapturing(false);
    }
  }

  async function uploadPhotos(photos: string[]) {
    // Use ref values to ensure we have the latest patientId
    const currentPatientId = patientIdRef.current || patientId;
    const currentChatId = chatIdRef.current || chatId;
    
    console.log('[CAMERA] Upload photos called:', { 
      patientId: currentPatientId, 
      chatId: currentChatId, 
      photoCount: photos.length,
      photos: photos.map((uri, i) => ({ index: i, uri: uri.substring(0, 50) + '...' }))
    });
    
    if (!currentPatientId || photos.length === 0) {
      console.error('[CAMERA] Missing patientId or photos:', { patientId: currentPatientId, photoCount: photos.length });
      Alert.alert('Hata', `Fotoğraf veya hasta bilgisi bulunamadı. PatientId: ${currentPatientId || 'yok'}, Fotoğraf sayısı: ${photos.length}`);
      return;
    }

    setUploading(true);

    try {
      // Get auth token - prefer from useAuth hook, fallback to AsyncStorage
      let token: string | null = null;
      
      // First try to get from useAuth hook (most reliable)
      if (user?.token) {
        token = user.token;
        console.log('[CAMERA] Auth token from useAuth hook, length:', token.length);
      } else {
        // Fallback to AsyncStorage
        console.log('[CAMERA] useAuth token not available, trying AsyncStorage...');
        const AUTH_KEY = 'cliniflow.auth.v1'; // From auth.tsx
        const authData = await AsyncStorage.getItem(AUTH_KEY);
        
        if (authData) {
          try {
            const parsed = JSON.parse(authData);
            token = parsed.token || parsed.accessToken || parsed.user?.token || null;
            console.log('[CAMERA] Auth token from AsyncStorage (AUTH_KEY), length:', token?.length || 0);
          } catch (e) {
            console.error('[CAMERA] Failed to parse auth_data:', e);
          }
        }
        
        // Try other common keys
        if (!token) {
          const altAuthData = await AsyncStorage.getItem('auth_data');
          if (altAuthData) {
            try {
              const parsed = JSON.parse(altAuthData);
              token = parsed.token || parsed.accessToken || null;
              console.log('[CAMERA] Auth token from AsyncStorage (auth_data), length:', token?.length || 0);
            } catch (e) {
              console.error('[CAMERA] Failed to parse alt auth_data:', e);
            }
          }
        }
        
        if (!token) {
          token = await AsyncStorage.getItem('auth_token');
          console.log('[CAMERA] Auth token from AsyncStorage (auth_token), length:', token?.length || 0);
        }
      }
      
      if (!token) {
        console.error('[CAMERA] Auth token not found in any location');
        console.error('[CAMERA] Available AsyncStorage keys:', await AsyncStorage.getAllKeys());
        throw new Error('Authentication token not found');
      }
      
      console.log('[CAMERA] Auth token found successfully, length:', token.length);

      // Upload all photos in a single request
      const formData = new FormData();
      
      for (let i = 0; i < photos.length; i++) {
        const uri = photos[i];
        const fileName = `intraoral_${Date.now()}_${i}.jpg`;
        
        // Check file exists
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (!fileInfo.exists) {
          throw new Error(`File not found: ${uri}`);
        }

        formData.append('files', {
          uri: Platform.OS === 'ios' ? uri : uri,
          type: 'image/jpeg',
          name: fileName,
        } as any);
      }
      
      formData.append('patientId', currentPatientId);
      formData.append('isImage', 'true');

      const uploadResponse = await fetch(`${API_BASE}/api/chat/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          // Don't set Content-Type, let React Native set it automatically for FormData
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({}));
        const errorText = errorData.error || errorData.message || `Upload failed: ${uploadResponse.status}`;
        throw new Error(errorText);
      }

      const uploadResult = await uploadResponse.json();

      Alert.alert(
        'Başarılı', 
        'Fotoğraflar başarıyla gönderildi.\n\n' +
        'Bu fotoğraflar yalnızca ön değerlendirme içindir. Nihai değerlendirme klinik tarafından yapılır.',
        [
          {
            text: 'Tamam',
            onPress: () => {
              router.back();
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('[CAMERA] Upload error:', error);
      Alert.alert('Hata', 'Fotoğraflar yüklenemedi: ' + (error.message || 'Bilinmeyen hata'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode="picture"
      >
        <View style={styles.overlay}>
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              style={styles.closeBtn}
              onPress={() => {
                if (countdownIntervalRef.current) {
                  clearInterval(countdownIntervalRef.current);
                }
                router.back();
              }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </Pressable>
            <Text style={styles.headerTitle}>
              {currentStep + 1} / {PHOTO_SEQUENCE.length}
            </Text>
            <View style={{ width: 44 }} />
          </View>

          {/* Instruction */}
          <View style={styles.instructionContainer}>
            <Text style={styles.instruction}>{t(currentPhoto.instruction)}</Text>
          </View>

          {/* Countdown */}
          {countdown !== null && (
            <View style={styles.countdownContainer}>
              {countdown > 0 ? (
                <Text style={styles.countdown}>{countdown}</Text>
              ) : (
                <Text style={styles.captureText}>📸</Text>
              )}
            </View>
          )}

          {/* Guide overlay - mouth/teeth alignment guide */}
          <View style={styles.guideOverlay}>
            <View style={styles.guideFrame}>
              <Text style={styles.guideText}>
                {currentPhoto.guide === 'front' && t('chat.intraoralCameraGuideFront')}
                {currentPhoto.guide === 'right' && t('chat.intraoralCameraGuideRight')}
                {currentPhoto.guide === 'left' && t('chat.intraoralCameraGuideLeft')}
                {currentPhoto.guide === 'upper' && t('chat.intraoralCameraGuideUpper')}
                {currentPhoto.guide === 'lower' && t('chat.intraoralCameraGuideLower')}
              </Text>
            </View>
          </View>

          {/* Bottom controls */}
          <View style={styles.controls}>
            {!countdown && !isCapturing && (
              <Pressable style={styles.captureBtn} onPress={startCountdown}>
                <Text style={styles.captureBtnText}>{t('chat.intraoralCameraCapture')}</Text>
              </Pressable>
            )}
          </View>
        </View>
      </CameraView>

      {uploading && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.uploadingText}>Fotoğraflar yükleniyor...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 16,
    textAlign: 'center',
  },
  permissionText: {
    fontSize: 16,
    color: '#ccc',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  permissionBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 150,
  },
  permissionBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 16,
  },
  closeBtn: {
    padding: 8,
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  instructionContainer: {
    position: 'absolute',
    top: '20%',
    left: 0,
    right: 0,
    paddingHorizontal: 32,
  },
  instruction: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 16,
    borderRadius: 12,
  },
  countdownContainer: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdown: {
    fontSize: 120,
    fontWeight: '700',
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 10,
  },
  captureText: {
    fontSize: 80,
  },
  guideOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  guideFrame: {
    width: SCREEN_WIDTH * 0.75,
    height: SCREEN_HEIGHT * 0.35,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 24,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  guideText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginTop: 12,
  },
  welcomeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#000',
  },
  welcomeIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 24,
    textAlign: 'center',
  },
  guidanceList: {
    width: '100%',
    maxWidth: 400,
    marginBottom: 40,
  },
  guidanceItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  guidanceBullet: {
    fontSize: 24,
    marginRight: 12,
    marginTop: 2,
  },
  guidanceText: {
    flex: 1,
    fontSize: 15,
    color: '#ccc',
    lineHeight: 22,
    textAlign: 'left',
  },
  welcomeBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 48,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 200,
  },
  welcomeBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  captureBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 200,
  },
  captureBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  previewImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  previewOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 24,
  },
  previewStepText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
  },
  previewButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 16,
  },
  previewBtn: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  retakeBtn: {
    backgroundColor: '#ef4444',
  },
  continueBtn: {
    backgroundColor: '#16a34a',
  },
  previewBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadingText: {
    color: '#fff',
    fontSize: 18,
    marginTop: 16,
  },
});
