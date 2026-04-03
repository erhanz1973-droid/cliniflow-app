// app/my-requests.tsx — Patient: View my treatment requests + doctor offers
import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/language-context';
import { API_BASE } from '../lib/api';

const DISCLAIMER = 'This is a preliminary estimate. Final diagnosis requires clinical examination.';

type Offer = {
  id: string;
  treatment_type: string;
  price_range: string | null;
  duration: string | null;
  note: string | null;
  disclaimer: string;
  created_at: string;
  doctor_name: string | null;
};

type Request = {
  id: string;
  description: string;
  budget: string | null;
  preferred_treatment: string | null;
  status: 'pending' | 'answered' | 'closed';
  created_at: string;
  offers: Offer[];
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return iso; }
}

export default function MyRequestsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.token) return;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/patient/treatment-requests`, {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'error');
      setRequests(data.requests || []);
    } catch (e: any) {
      setError(e.message || t('common.error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.token, t]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  const statusColor = (s: string) => {
    if (s === 'answered') return { bg: '#D1FAE5', text: '#065F46' };
    if (s === 'closed')   return { bg: '#E5E7EB', text: '#374151' };
    return { bg: '#FEF3C7', text: '#92400E' }; // pending
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← {t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('treatReq.myRequests')}</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← {t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('treatReq.myRequests')}</Text>
        <TouchableOpacity
          style={styles.newBtn}
          onPress={() => router.push('/request-treatment')}
        >
          <Text style={styles.newBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
              <Text style={styles.retryText}>{t('common.retry')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!error && requests.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>{t('treatReq.noRequests')}</Text>
            <Text style={styles.emptySub}>{t('treatReq.noRequestsSub')}</Text>
            <TouchableOpacity
              style={styles.newRequestBtn}
              onPress={() => router.push('/request-treatment')}
            >
              <Text style={styles.newRequestBtnText}>+ {t('treatReq.newRequest')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {requests.map(req => {
          const sc = statusColor(req.status);
          const isExpanded = expandedId === req.id;
          return (
            <View key={req.id} style={styles.card}>
              {/* Card header */}
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => setExpandedId(isExpanded ? null : req.id)}
                activeOpacity={0.75}
              >
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
                    <Text style={[styles.statusText, { color: sc.text }]}>
                      {req.status === 'answered' ? t('treatReq.status.answered') :
                       req.status === 'closed'   ? t('treatReq.status.closed') :
                       t('treatReq.status.pending')}
                    </Text>
                  </View>
                  <Text style={styles.cardDate}>{fmtDate(req.created_at)}</Text>
                </View>
                <View style={styles.cardHeaderRight}>
                  {req.offers.length > 0 && (
                    <View style={styles.offerBadge}>
                      <Text style={styles.offerBadgeText}>{req.offers.length} {t('treatReq.offers')}</Text>
                    </View>
                  )}
                  <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
                </View>
              </TouchableOpacity>

              {/* Description preview */}
              <Text style={styles.description} numberOfLines={isExpanded ? undefined : 2}>
                {req.description}
              </Text>

              {/* Details when expanded */}
              {isExpanded && (
                <View style={styles.details}>
                  {req.preferred_treatment && (
                    <Text style={styles.detailRow}>
                      🦷 {t('treatReq.preferredTreatment')}: {t(`treatmentPlan.proc.${req.preferred_treatment}`) || req.preferred_treatment}
                    </Text>
                  )}
                  {req.budget && (
                    <Text style={styles.detailRow}>💰 {t('treatReq.budget')}: {req.budget}</Text>
                  )}

                  {/* Offers */}
                  {req.offers.length === 0 ? (
                    <View style={styles.noOffers}>
                      <Text style={styles.noOffersText}>{t('treatReq.noOffers')}</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={styles.offersTitle}>{t('treatReq.doctorOffers')}</Text>
                      {req.offers.map(offer => (
                        <View key={offer.id} style={styles.offerCard}>
                          <View style={styles.offerHeader}>
                            <Text style={styles.offerDoctor}>
                              👨‍⚕️ {offer.doctor_name || t('treatReq.doctor')}
                            </Text>
                            <Text style={styles.offerDate}>{fmtDate(offer.created_at)}</Text>
                          </View>
                          <Text style={styles.offerType}>
                            {t(`treatmentPlan.proc.${offer.treatment_type}`) || offer.treatment_type}
                          </Text>
                          {offer.price_range && (
                            <Text style={styles.offerRow}>💰 {offer.price_range}</Text>
                          )}
                          {offer.duration && (
                            <Text style={styles.offerRow}>📅 {offer.duration}</Text>
                          )}
                          {offer.note && (
                            <Text style={styles.offerNote}>📝 {offer.note}</Text>
                          )}
                          <View style={styles.disclaimerBox}>
                            <Text style={styles.disclaimerText}>
                              ⚠️ {offer.disclaimer || DISCLAIMER}
                            </Text>
                          </View>
                        </View>
                      ))}
                    </>
                  )}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F3F4F6' },
  backBtnText: { color: '#374151', fontWeight: '600', fontSize: 13 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  newBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#2563EB',
    alignItems: 'center', justifyContent: 'center',
  },
  newBtnText: { color: '#fff', fontSize: 22, fontWeight: '700', lineHeight: 26 },
  scroll: { flex: 1 },
  content: { padding: 16 },

  errorBox: {
    backgroundColor: '#FEE2E2', borderRadius: 10, padding: 14, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  errorText: { color: '#991B1B', fontSize: 13, flex: 1 },
  retryText: { color: '#2563EB', fontSize: 13, fontWeight: '700', marginLeft: 8 },

  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#374151', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 20, paddingHorizontal: 20 },
  newRequestBtn: {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  newRequestBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  cardDate: { fontSize: 12, color: '#9CA3AF' },
  offerBadge: { backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  offerBadgeText: { fontSize: 11, color: '#1D4ED8', fontWeight: '700' },
  chevron: { fontSize: 12, color: '#9CA3AF' },
  description: { fontSize: 14, color: '#374151', lineHeight: 20 },

  details: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  detailRow: { fontSize: 13, color: '#6B7280', marginBottom: 6 },

  noOffers: { paddingVertical: 16, alignItems: 'center' },
  noOffersText: { fontSize: 13, color: '#9CA3AF', fontStyle: 'italic' },

  offersTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 4 },

  offerCard: {
    backgroundColor: '#F9FAFB', borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  offerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  offerDoctor: { fontSize: 13, fontWeight: '700', color: '#111827' },
  offerDate: { fontSize: 11, color: '#9CA3AF' },
  offerType: { fontSize: 14, fontWeight: '600', color: '#2563EB', marginBottom: 6 },
  offerRow: { fontSize: 13, color: '#374151', marginBottom: 4 },
  offerNote: { fontSize: 13, color: '#6B7280', marginBottom: 6, fontStyle: 'italic' },
  disclaimerBox: {
    backgroundColor: '#FEF9C3', borderRadius: 6, padding: 8, marginTop: 6,
  },
  disclaimerText: { fontSize: 11, color: '#92400E', lineHeight: 16 },
});
