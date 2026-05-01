import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Pressable,
  Alert, ActivityIndicator, StyleSheet, SafeAreaView, Switch, Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../lib/auth';
import { useLanguage } from '../../lib/language-context';
import { apiGet, apiPut, API_BASE } from '../../lib/api';
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, Language } from '../../lib/i18n';
import {
  registerExpoPushForSession,
  syncNotificationSoundToServer,
} from '../../lib/registerExpoPush';
import {
  getMessageSoundPreference,
  setMessageSoundPreference,
} from '../../lib/messageSoundPreference';
interface DoctorProfile {
  doctorId: string;
  name: string;
  email: string;
  phone: string;
  department: string | null;
  title: string | null;
  bio: string;
  experience_years: number | null;
  languages: string | null;
  specialties: string | null;
  university: string | null;
  graduation_year: number | null;
  public_profile: boolean;
  status: string;
  clinic_code: string;
  license_number: string | null;
  created_at: string | null;
  profile_photo_url: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  APPROVED: '#16A34A', PENDING: '#F59E0B', SUSPENDED: '#EF4444',
};
const STATUS_LABEL_KEYS: Record<string, string> = {
  APPROVED: 'doctor.profile.status.approved',
  PENDING: 'doctor.profile.status.pending',
  SUSPENDED: 'doctor.profile.status.suspended',
};

function InfoRow({ icon, label, value }: { icon: string; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={s.infoRow}>
      <Text style={s.infoIcon}>{icon}</Text>
      <View style={s.infoContent}>
        <Text style={s.infoLabel}>{label}</Text>
        <Text style={s.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function DoctorProfileScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t, currentLanguage, setLanguage } = useLanguage();

  const [profile, setProfile] = useState<DoctorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [messageSoundOn, setMessageSoundOn] = useState(true);

  useEffect(() => {
    void getMessageSoundPreference().then(setMessageSoundOn);
  }, []);

  const [form, setForm] = useState({
    name: '', phone: '', title: '', bio: '', department: '',
    experience_years: '', university: '', graduation_year: '',
    languages: '', specialties: '', public_profile: false,
  });

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiGet<any>('/api/doctor/me');
      if (res?.ok && res.doctor) {
        const d = res.doctor as DoctorProfile;
        setProfile(d);
        setForm({
          name: d.name || '',
          phone: d.phone || '',
          title: d.title || '',
          bio: d.bio || '',
          department: d.department || '',
          experience_years: d.experience_years != null ? String(d.experience_years) : '',
          university: d.university || '',
          graduation_year: d.graduation_year != null ? String(d.graduation_year) : '',
          languages: Array.isArray(d.languages) ? (d.languages as any).join(', ') : (d.languages || ''),
          specialties: Array.isArray(d.specialties) ? (d.specialties as any).join(', ') : (d.specialties || ''),
          public_profile: Boolean(d.public_profile),
        });
      }
    } catch (e) {
      console.error('[Profile] load error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user?.token) load(); }, [user?.token, load]);

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await apiPut<any>('/api/doctor/me', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        title: form.title.trim() || null,
        bio: form.bio.trim() || null,
        department: form.department.trim() || null,
        experience_years: form.experience_years ? Number(form.experience_years) : null,
        university: form.university.trim() || null,
        graduation_year: form.graduation_year ? Number(form.graduation_year) : null,
        languages: form.languages.trim() || null,
        specialties: form.specialties.trim() || null,
        public_profile: form.public_profile,
      });
      if (res?.ok) {
        Alert.alert('', t('doctor.profile.updated'));
        setEditing(false);
        await load();
      } else {
        Alert.alert(t('common.error'), res?.error || t('doctor.profile.updateError'));
      }
    } catch (e: any) {
      Alert.alert(t('common.error'), e?.message || t('doctor.profile.updateError'));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('common.permissionRequired') || 'İzin Gerekli',
        'Fotoğraf seçmek için galeri izni gerekiyor.',
      );
      return;
    }

    Alert.alert(
      t('doctor.profile.changePhoto') || 'Fotoğraf Değiştir',
      '',
      [
        {
          text: t('doctor.profile.takePhoto') || 'Kamera',
          onPress: async () => {
            const cam = await ImagePicker.requestCameraPermissionsAsync();
            if (cam.status !== 'granted') return;
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
            if (!result.canceled) uploadPhoto(result.assets[0]);
          },
        },
        {
          text: t('doctor.profile.chooseFromGallery') || 'Galeriden Seç',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
            if (!result.canceled) uploadPhoto(result.assets[0]);
          },
        },
        { text: t('common.cancel') || 'İptal', style: 'cancel' },
      ],
    );
  };

  const uploadPhoto = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!user?.token) return;
    setUploadingPhoto(true);
    try {
      const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg';
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

      const formData = new FormData();
      formData.append('photo', {
        uri: asset.uri,
        name: `photo.${ext}`,
        type: mime,
      } as any);

      const response = await fetch(`${API_BASE}/api/doctor/upload-photo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
        body: formData,
      });
      const json = await response.json();

      if (json.ok && json.profilePhotoUrl) {
        setProfile(prev => prev ? { ...prev, profile_photo_url: json.profilePhotoUrl } : prev);
        Alert.alert('', t('doctor.profile.photoUpdated') || 'Fotoğraf güncellendi.');
      } else {
        Alert.alert(t('common.error') || 'Hata', json.error || 'Yükleme başarısız.');
      }
    } catch (e: any) {
      Alert.alert(t('common.error') || 'Hata', e?.message || 'Yükleme başarısız.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const statusColor = STATUS_COLORS[profile?.status?.toUpperCase() || ''] || '#9CA3AF';
  const statusLabel = t(STATUS_LABEL_KEYS[profile?.status?.toUpperCase() || ''] || '') || profile?.status || '';

  const fmtDate = (iso: string | null) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleDateString('tr-TR'); } catch { return iso; }
  };

  if (loading) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/doctor')}>
          <Text style={s.backBtnText}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{t('doctor.profile.title')}</Text>
        <TouchableOpacity
          style={[s.editBtn, editing && s.editBtnActive]}
          onPress={() => editing ? handleSave() : setEditing(true)}
          disabled={saving}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : (
            <Text style={s.editBtnText}>{editing ? t('doctor.profile.save') : t('doctor.profile.edit')}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Identity card */}
        <View style={s.heroCard}>
          <TouchableOpacity onPress={handleChangePhoto} disabled={uploadingPhoto} style={s.avatarWrap}>
            {profile?.profile_photo_url ? (
              <Image source={{ uri: profile.profile_photo_url }} style={s.heroAvatarImg} />
            ) : (
              <View style={s.heroAvatar}>
                <Text style={s.heroAvatarText}>
                  {(profile?.name || 'D').charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={s.cameraBadge}>
              {uploadingPhoto
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={s.cameraBadgeText}>📷</Text>
              }
            </View>
          </TouchableOpacity>
          <View style={s.heroInfo}>
            {editing ? (
              <TextInput style={[s.input, { fontSize: 17, fontWeight: '700' }]}
                value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))}
                placeholder={t('doctor.profile.title')} />
            ) : (
              <Text style={s.heroName}>{profile?.name || '—'}</Text>
            )}
            {editing ? (
              <TextInput style={s.input}
                value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))}
                placeholder={t('doctor.profile.dentist')} />
            ) : (
              <Text style={s.heroTitle}>
                {[profile?.title, profile?.department].filter(Boolean).join(' · ') || t('doctor.profile.dentist')}
              </Text>
            )}
            <View style={[s.statusBadge, { backgroundColor: statusColor + '22' }]}>
              <View style={[s.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
        </View>

        {/* Contact info (read-only) */}
        <SectionCard title={t('doctor.profile.contact')}>
          <InfoRow icon="✉️" label={t('doctor.profile.email')} value={profile?.email} />
          {editing ? (
            <View style={s.fieldRow}>
              <Text style={s.fieldLabel}>{t('doctor.profile.phone')}</Text>
              <TextInput style={s.input} value={form.phone}
                onChangeText={v => setForm(f => ({ ...f, phone: v }))}
                keyboardType="phone-pad" placeholder="+90 xxx xxx xxxx" />
            </View>
          ) : (
            <InfoRow icon="📱" label={t('doctor.profile.phone')} value={profile?.phone} />
          )}
          <InfoRow icon="🏥" label={t('doctor.profile.clinic')} value={profile?.clinic_code} />
          <InfoRow icon="📜" label={t('doctor.profile.license')} value={profile?.license_number} />
          <InfoRow icon="📅" label={t('doctor.profile.registrationDate')} value={fmtDate(profile?.created_at)} />
        </SectionCard>

        {/* Professional */}
        <SectionCard title={t('doctor.profile.professional')}>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>{t('doctor.profile.experience')}</Text>
            {editing ? (
              <TextInput style={s.input} value={form.experience_years}
                onChangeText={v => setForm(f => ({ ...f, experience_years: v }))}
                keyboardType="numeric" placeholder="15" />
            ) : (
              <Text style={s.fieldValue}>
                {profile?.experience_years ? `${profile.experience_years} ${t('doctor.profile.years')}` : t('doctor.profile.notSpecified')}
              </Text>
            )}
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>{t('doctor.profile.university')}</Text>
            {editing ? (
              <TextInput style={s.input} value={form.university}
                onChangeText={v => setForm(f => ({ ...f, university: v }))}
                placeholder={t('doctor.profile.university')} />
            ) : (
              <Text style={s.fieldValue}>{profile?.university || t('doctor.profile.notSpecified')}</Text>
            )}
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>{t('doctor.profile.graduation')}</Text>
            {editing ? (
              <TextInput style={s.input} value={form.graduation_year}
                onChangeText={v => setForm(f => ({ ...f, graduation_year: v }))}
                keyboardType="numeric" placeholder="2011" />
            ) : (
              <Text style={s.fieldValue}>{profile?.graduation_year || t('doctor.profile.notSpecified')}</Text>
            )}
          </View>
        </SectionCard>

        {/* Profile visibility */}
        <SectionCard title={t('doctor.profile.visibility')}>
          <View style={s.switchRow}>
            <Text style={s.fieldLabel}>{t('doctor.profile.publicProfile')}</Text>
            {editing ? (
              <Switch
                value={form.public_profile}
                onValueChange={v => setForm(f => ({ ...f, public_profile: v }))}
                trackColor={{ false: '#D1D5DB', true: '#2563EB' }}
              />
            ) : (
              <Text style={[s.fieldValue, { color: profile?.public_profile ? '#16A34A' : '#6B7280' }]}>
                {profile?.public_profile ? t('doctor.profile.open') : t('doctor.profile.closed')}
              </Text>
            )}
          </View>
        </SectionCard>

        {/* Specialties */}
        <SectionCard title={t('doctor.profile.specialties')}>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>{t('doctor.profile.specialtyAreas')}</Text>
            {editing ? (
              <TextInput style={[s.input, s.multiline]} value={form.specialties}
                onChangeText={v => setForm(f => ({ ...f, specialties: v }))}
                placeholder={t('doctor.profile.specialtyAreas')} multiline />
            ) : (
              <Text style={s.fieldValue}>{profile?.specialties || t('doctor.profile.notSpecified')}</Text>
            )}
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>{t('doctor.profile.languages')}</Text>
            {editing ? (
              <TextInput style={s.input} value={form.languages}
                onChangeText={v => setForm(f => ({ ...f, languages: v }))}
                placeholder={t('doctor.profile.languages')} />
            ) : (
              <Text style={s.fieldValue}>
                {Array.isArray(profile?.languages)
                  ? (profile.languages as any[]).map((l: any) => l?.name ?? l).filter(Boolean).join(', ') || t('doctor.profile.notSpecified')
                  : profile?.languages || t('doctor.profile.notSpecified')}
              </Text>
            )}
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>{t('doctor.profile.bio')}</Text>
            {editing ? (
              <TextInput style={[s.input, s.multiline]} value={form.bio}
                onChangeText={v => setForm(f => ({ ...f, bio: v }))}
                placeholder={t('doctor.profile.bio')} multiline />
            ) : (
              <Text style={s.fieldValue}>{profile?.bio || t('doctor.profile.notSpecified')}</Text>
            )}
          </View>
        </SectionCard>

        {/* Chat message sounds */}
        <SectionCard title={t('doctor.profile.messageSoundTitle')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ flex: 1, fontSize: 13, color: '#6B7280', lineHeight: 18 }}>
              {t('doctor.profile.messageSoundSub')}
            </Text>
            <Switch
              value={messageSoundOn}
              onValueChange={async (v) => {
                setMessageSoundOn(v);
                await setMessageSoundPreference(v);
                if (!user?.token) return;
                await syncNotificationSoundToServer({
                  role: 'doctor',
                  authToken: user.token,
                  messageSound: v,
                });
                await registerExpoPushForSession({ role: 'doctor', authToken: user.token });
              }}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={messageSoundOn ? '#2563EB' : '#F3F4F6'}
            />
          </View>
        </SectionCard>

        <SectionCard title={t('doctor.profile.appLanguage')}>
          <View style={s.langRow}>
            {SUPPORTED_LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang}
                style={[s.langBtn, currentLanguage === lang && s.langBtnActive]}
                onPress={() => setLanguage(lang as Language)}
              >
                <Text style={[s.langBtnText, currentLanguage === lang && s.langBtnTextActive]}>
                  {LANGUAGE_NAMES[lang as Language]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SectionCard>

        {editing && (
          <TouchableOpacity style={s.cancelBtn} onPress={() => { setEditing(false); load(); }}>
            <Text style={s.cancelBtnText}>{t('doctor.profile.cancel')}</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      <View style={s.bottomNav}>
        <Pressable style={s.navItem} onPress={() => router.replace('/doctor')}>
          <Text style={s.navIcon}>🏠</Text>
          <Text style={s.navLabel}>{t('nav.dashboard')}</Text>
        </Pressable>
        <Pressable style={s.navItem} onPress={() => router.push('/doctor/patients')}>
          <Text style={s.navIcon}>👥</Text>
          <Text style={s.navLabel}>{t('nav.patients')}</Text>
        </Pressable>
        <Pressable style={[s.navItem, s.navItemActive]}>
          <Text style={s.navIcon}>👤</Text>
          <Text style={[s.navLabel, s.navLabelActive]}>{t('nav.profile')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  content: { padding: 14, gap: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backBtnText: { fontSize: 22, color: '#111827' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  editBtn: {
    backgroundColor: '#2563EB', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  editBtnActive: { backgroundColor: '#16A34A' },
  editBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  heroCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'flex-start', gap: 14,
  },
  avatarWrap: { position: 'relative', width: 68, height: 68 },
  heroAvatar: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center',
  },
  heroAvatarImg: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#E5E7EB',
  },
  heroAvatarText: { color: '#fff', fontSize: 28, fontWeight: '700' },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#2563EB', borderWidth: 2, borderColor: '#fff',
    justifyContent: 'center', alignItems: 'center',
  },
  cameraBadgeText: { fontSize: 11 },
  heroInfo: { flex: 1, gap: 4 },
  heroName: { fontSize: 17, fontWeight: '700', color: '#111827' },
  heroTitle: { fontSize: 13, color: '#6B7280' },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginTop: 4,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10,
  },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#374151', marginBottom: 2 },

  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoIcon: { fontSize: 16, width: 24, textAlign: 'center', marginTop: 1 },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase' },
  infoValue: { fontSize: 14, color: '#111827', fontWeight: '500', marginTop: 1 },

  fieldRow: { gap: 4 },
  fieldLabel: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  fieldValue: { fontSize: 14, color: '#111827' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },

  input: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#111827',
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },

  cancelBtn: {
    backgroundColor: '#F3F4F6', borderRadius: 10, padding: 14, alignItems: 'center',
    borderWidth: 1, borderColor: '#D1D5DB',
  },
  cancelBtnText: { color: '#6B7280', fontWeight: '600' },

  langRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  langBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB',
  },
  langBtnActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  langBtnText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  langBtnTextActive: { color: '#fff' },

  bottomNav: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
    paddingBottom: 8, paddingTop: 6,
  },
  navItem: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  navItemActive: {},
  navIcon: { fontSize: 22, marginBottom: 2 },
  navLabel: { fontSize: 11, color: '#6B7280' },
  navLabelActive: { color: '#2563EB', fontWeight: '600' },
});
