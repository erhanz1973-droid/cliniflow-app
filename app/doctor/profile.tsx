import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, StyleSheet, SafeAreaView, Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useLanguage } from '../../lib/language-context';
import { apiGet, apiPut } from '../../lib/api';
import { SUPPORTED_LANGUAGES, LANGUAGE_NAMES, Language } from '../../lib/i18n';

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
const STATUS_LABELS: Record<string, string> = {
  APPROVED: 'Onaylı', PENDING: 'Beklemede', SUSPENDED: 'Askıda',
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
        Alert.alert('', 'Profil güncellendi');
        setEditing(false);
        await load();
      } else {
        Alert.alert('Hata', res?.error || 'Profil güncellenemedi');
      }
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Profil güncellenirken hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const statusColor = STATUS_COLORS[profile?.status?.toUpperCase() || ''] || '#9CA3AF';
  const statusLabel = STATUS_LABELS[profile?.status?.toUpperCase() || ''] || profile?.status || '';

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
        <Text style={s.headerTitle}>Profilim</Text>
        <TouchableOpacity
          style={[s.editBtn, editing && s.editBtnActive]}
          onPress={() => editing ? handleSave() : setEditing(true)}
          disabled={saving}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : (
            <Text style={s.editBtnText}>{editing ? 'Kaydet' : 'Düzenle'}</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

        {/* Identity card */}
        <View style={s.heroCard}>
          <View style={s.heroAvatar}>
            <Text style={s.heroAvatarText}>
              {(profile?.name || 'D').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={s.heroInfo}>
            {editing ? (
              <TextInput style={[s.input, { fontSize: 17, fontWeight: '700' }]}
                value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))}
                placeholder="Ad Soyad" />
            ) : (
              <Text style={s.heroName}>{profile?.name || '—'}</Text>
            )}
            {editing ? (
              <TextInput style={s.input}
                value={form.title} onChangeText={v => setForm(f => ({ ...f, title: v }))}
                placeholder="Ünvan (Diş Dr.)" />
            ) : (
              <Text style={s.heroTitle}>
                {[profile?.title, profile?.department].filter(Boolean).join(' · ') || 'Diş Hekimi'}
              </Text>
            )}
            <View style={[s.statusBadge, { backgroundColor: statusColor + '22' }]}>
              <View style={[s.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
            </View>
          </View>
        </View>

        {/* Contact info (read-only) */}
        <SectionCard title="İletişim">
          <InfoRow icon="✉️" label="Email" value={profile?.email} />
          {editing ? (
            <View style={s.fieldRow}>
              <Text style={s.fieldLabel}>📱 Telefon</Text>
              <TextInput style={s.input} value={form.phone}
                onChangeText={v => setForm(f => ({ ...f, phone: v }))}
                keyboardType="phone-pad" placeholder="+90 xxx xxx xxxx" />
            </View>
          ) : (
            <InfoRow icon="📱" label="Telefon" value={profile?.phone} />
          )}
          <InfoRow icon="🏥" label="Klinik" value={profile?.clinic_code} />
          <InfoRow icon="📜" label="Lisans No" value={profile?.license_number} />
          <InfoRow icon="📅" label="Kayıt Tarihi" value={fmtDate(profile?.created_at)} />
        </SectionCard>

        {/* Professional */}
        <SectionCard title="Mesleki">
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Deneyim</Text>
            {editing ? (
              <TextInput style={s.input} value={form.experience_years}
                onChangeText={v => setForm(f => ({ ...f, experience_years: v }))}
                keyboardType="numeric" placeholder="15" />
            ) : (
              <Text style={s.fieldValue}>
                {profile?.experience_years ? `${profile.experience_years} yıl` : 'Belirtilmedi'}
              </Text>
            )}
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Üniversite</Text>
            {editing ? (
              <TextInput style={s.input} value={form.university}
                onChangeText={v => setForm(f => ({ ...f, university: v }))}
                placeholder="Hacettepe Üniversitesi" />
            ) : (
              <Text style={s.fieldValue}>{profile?.university || 'Belirtilmedi'}</Text>
            )}
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Mezuniyet</Text>
            {editing ? (
              <TextInput style={s.input} value={form.graduation_year}
                onChangeText={v => setForm(f => ({ ...f, graduation_year: v }))}
                keyboardType="numeric" placeholder="2011" />
            ) : (
              <Text style={s.fieldValue}>{profile?.graduation_year || 'Belirtilmedi'}</Text>
            )}
          </View>
        </SectionCard>

        {/* Profil visibility */}
        <SectionCard title="Profil">
          <View style={s.switchRow}>
            <Text style={s.fieldLabel}>🌐 Profil Görünürlüğü</Text>
            {editing ? (
              <Switch
                value={form.public_profile}
                onValueChange={v => setForm(f => ({ ...f, public_profile: v }))}
                trackColor={{ false: '#D1D5DB', true: '#2563EB' }}
              />
            ) : (
              <Text style={[s.fieldValue, { color: profile?.public_profile ? '#16A34A' : '#6B7280' }]}>
                {profile?.public_profile ? 'Açık' : 'Kapalı'}
              </Text>
            )}
          </View>
        </SectionCard>

        {/* Uzmanlık */}
        <SectionCard title="Uzmanlık">
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Uzmanlık Alanları</Text>
            {editing ? (
              <TextInput style={[s.input, s.multiline]} value={form.specialties}
                onChangeText={v => setForm(f => ({ ...f, specialties: v }))}
                placeholder="Ortodonti, Pedodonti, Cerrahi" multiline />
            ) : (
              <Text style={s.fieldValue}>{profile?.specialties || 'Belirtilmedi'}</Text>
            )}
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Diller</Text>
            {editing ? (
              <TextInput style={s.input} value={form.languages}
                onChangeText={v => setForm(f => ({ ...f, languages: v }))}
                placeholder="Türkçe, İngilizce" />
            ) : (
              <Text style={s.fieldValue}>{profile?.languages || 'Belirtilmedi'}</Text>
            )}
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>Bio</Text>
            {editing ? (
              <TextInput style={[s.input, s.multiline]} value={form.bio}
                onChangeText={v => setForm(f => ({ ...f, bio: v }))}
                placeholder="Kısa özgeçmiş..." multiline />
            ) : (
              <Text style={s.fieldValue}>{profile?.bio || 'Belirtilmedi'}</Text>
            )}
          </View>
        </SectionCard>

        {/* App Language */}
        <SectionCard title="Uygulama Dili">
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
            <Text style={s.cancelBtnText}>İptal</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
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
  heroAvatar: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#2563EB', justifyContent: 'center', alignItems: 'center',
  },
  heroAvatarText: { color: '#fff', fontSize: 26, fontWeight: '700' },
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
});
