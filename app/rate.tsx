// app/rate.tsx — Patient rates an offer (experience or treatment)
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ScrollView, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { API_BASE } from '../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────
type RatingType = 'experience' | 'treatment';

// ── Star picker ───────────────────────────────────────────────────────────────
function StarPicker({
  value, onChange, size = 32,
}: { value: number; onChange: (v: number) => void; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity key={n} onPress={() => onChange(n)} activeOpacity={0.7}>
          <Text style={{ fontSize: size, color: n <= value ? '#F59E0B' : '#D1D5DB' }}>
            ★
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Sub-score row ─────────────────────────────────────────────────────────────
function SubScore({
  label, value, onChange,
}: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={ss.subRow}>
      <Text style={ss.subLabel}>{label}</Text>
      <StarPicker value={value} onChange={onChange} size={22} />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function RateScreen() {
  const router  = useRouter();
  const { user } = useAuth();
  const params  = useLocalSearchParams<{
    offerId:    string;
    type:       string;
    clinicName: string;
    doctorName: string;
  }>();

  const offerId    = params.offerId    || '';
  const type       = (params.type === 'treatment' ? 'treatment' : 'experience') as RatingType;
  const clinicName = decodeURIComponent(params.clinicName || 'Clinic');
  const doctorName = decodeURIComponent(params.doctorName || 'Doctor');

  const isExperience = type === 'experience';

  // ── State ─────────────────────────────────────────────────────────────────
  const [overall,       setOverall]       = useState(0);
  const [communication, setCommunication] = useState(0);
  const [price,         setPrice]         = useState(0);
  const [result,        setResult]        = useState(0);
  const [comment,       setComment]       = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [done,          setDone]          = useState(false);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (overall === 0) {
      Alert.alert('Overall rating required', 'Please select at least 1 star for the overall score.');
      return;
    }
    if (!user?.token) { router.back(); return; }

    setSubmitting(true);
    try {
      const body: Record<string, any> = { offer_id: offerId, type, overall };
      if (isExperience) {
        if (communication > 0) body.communication = communication;
        if (price > 0)         body.price         = price;
      } else {
        if (result > 0) body.result = result;
      }
      if (comment.trim()) body.comment = comment.trim();

      const res  = await fetch(`${API_BASE}/api/patient/ratings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data?.ok) {
        if (data?.error === 'already_rated') {
          Alert.alert('Already rated', 'You have already submitted this rating.');
          router.back();
          return;
        }
        throw new Error(data?.error || 'Unknown error');
      }
      setDone(true);
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success state ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <SafeAreaView style={[ss.safe, ss.center]}>
        <Text style={{ fontSize: 52, marginBottom: 16 }}>
          {isExperience ? '💬' : '🦷'}
        </Text>
        <Text style={ss.doneTitle}>Thank you!</Text>
        <Text style={ss.doneSub}>
          {isExperience
            ? 'Your experience rating has been submitted.'
            : 'Your treatment rating has been submitted.'}
        </Text>
        <TouchableOpacity style={ss.doneBtn} onPress={() => router.back()}>
          <Text style={ss.doneBtnText}>Back to Requests</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={ss.safe}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={ss.scroll} keyboardShouldPersistTaps="handled">

          {/* Header */}
          <View style={ss.header}>
            <TouchableOpacity style={ss.backBtn} onPress={() => router.back()}>
              <Text style={ss.backText}>‹  Back</Text>
            </TouchableOpacity>

            {/* Type badge */}
            <View style={[ss.typeBadge, isExperience ? ss.typeBadgeExp : ss.typeBadgeTrt]}>
              <Text style={[ss.typeBadgeText, isExperience ? ss.typeBadgeTextExp : ss.typeBadgeTextTrt]}>
                {isExperience ? '💬 Experience Rating' : '🦷 Treatment Rating'}
              </Text>
            </View>

            <Text style={ss.title}>
              {isExperience ? 'Rate your experience' : 'Rate your treatment outcome'}
            </Text>
            <Text style={ss.subtitle}>
              {clinicName}{doctorName ? `  ·  Dr. ${doctorName}` : ''}
            </Text>
          </View>

          {/* Overall */}
          <View style={ss.card}>
            <Text style={ss.cardLabel}>Overall</Text>
            <StarPicker value={overall} onChange={setOverall} />
            <Text style={ss.starHint}>
              {overall === 0 ? 'Tap a star to rate' :
               overall === 1 ? 'Poor' : overall === 2 ? 'Fair' :
               overall === 3 ? 'Good' : overall === 4 ? 'Very good' : 'Excellent'}
            </Text>
          </View>

          {/* Sub-scores */}
          <View style={ss.card}>
            <Text style={ss.cardLabel}>
              {isExperience ? 'Details (optional)' : 'Treatment outcome (optional)'}
            </Text>
            {isExperience ? (
              <>
                <SubScore label="Communication" value={communication} onChange={setCommunication} />
                <SubScore label="Price / Value"  value={price}         onChange={setPrice}         />
              </>
            ) : (
              <SubScore label="Treatment result" value={result} onChange={setResult} />
            )}
          </View>

          {/* Comment */}
          <View style={ss.card}>
            <Text style={ss.cardLabel}>Your comment (optional)</Text>
            <TextInput
              style={ss.textarea}
              placeholder={
                isExperience
                  ? 'How was the communication? Were you happy with the response time?'
                  : 'How did your treatment go? Are you satisfied with the result?'
              }
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
              value={comment}
              onChangeText={setComment}
              maxLength={1000}
            />
            <Text style={ss.charCount}>{comment.length} / 1000</Text>
          </View>

          {/* Trust note */}
          <View style={ss.trustNote}>
            <Text style={ss.trustIcon}>🔒</Text>
            <Text style={ss.trustText}>
              {isExperience
                ? 'Only patients who received an offer can leave an experience rating.'
                : 'Only patients who completed treatment can leave a treatment rating.'}
            </Text>
          </View>

        </ScrollView>

        {/* Footer */}
        <View style={ss.footer}>
          <TouchableOpacity
            style={[ss.submitBtn, (submitting || overall === 0) && ss.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || overall === 0}
            activeOpacity={0.85}
          >
            {submitting
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={ss.submitText}>
                  Submit {isExperience ? 'Experience' : 'Treatment'} Rating
                </Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const ss = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#F9FAFB' },
  center: { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28 },
  scroll: { paddingBottom: 24 },

  // Header
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  backBtn: { marginBottom: 14 },
  backText: { fontSize: 15, color: '#2563EB', fontWeight: '600' },
  typeBadge: {
    alignSelf: 'flex-start', borderRadius: 20, borderWidth: 1,
    paddingHorizontal: 12, paddingVertical: 4, marginBottom: 10,
  },
  typeBadgeExp: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  typeBadgeTrt: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  typeBadgeText: { fontSize: 12, fontWeight: '700' },
  typeBadgeTextExp: { color: '#2563EB' },
  typeBadgeTextTrt: { color: '#15803D' },
  title:    { fontSize: 21, fontWeight: '800', color: '#111827', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#6B7280' },

  // Cards
  card: {
    backgroundColor: '#fff', borderRadius: 14, marginHorizontal: 16, marginTop: 12,
    padding: 16,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  cardLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 12 },

  // Stars
  starHint: { fontSize: 12, color: '#9CA3AF', marginTop: 6 },

  // Sub-scores
  subRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  subLabel: { fontSize: 14, color: '#374151', fontWeight: '500' },

  // Textarea
  textarea: {
    minHeight: 100, fontSize: 14, color: '#111827', lineHeight: 20,
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, textAlignVertical: 'top',
  },
  charCount: { fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 5 },

  // Trust note
  trustNote: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    marginHorizontal: 16, marginTop: 14,
    backgroundColor: '#F3F4F6', borderRadius: 10, padding: 12,
  },
  trustIcon: { fontSize: 14 },
  trustText: { fontSize: 12, color: '#6B7280', lineHeight: 17, flex: 1 },

  // Footer
  footer: {
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E5E7EB',
    paddingVertical: 14, paddingHorizontal: 20,
  },
  submitBtn: {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: '#93C5FD' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // Done state
  doneTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 8, textAlign: 'center' },
  doneSub:   { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  doneBtn:   {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 14, paddingHorizontal: 32, alignItems: 'center', width: '100%',
  },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
