// app/my-requests.tsx — Patient: View my treatment requests + doctor offers
import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '../lib/auth';
import { useLanguage } from '../lib/language-context';
import { API_BASE } from '../lib/api';
import { saveSelectedChatClinic } from '../lib/selectedChatClinic';

// DISCLAIMER — always use the translation key; this fallback is only used if i18n is unavailable
const DISCLAIMER_FALLBACK = 'This is a preliminary estimate. Final diagnosis requires clinical examination.';

/**
 * Translate duration units in a duration string to the current locale.
 * e.g. "3–5 days" → "3–5 gün" (TR), "2–3 nights" → "2–3 gece" (TR)
 * Leaves numeric parts and separators untouched.
 */
function translateDuration(raw: string | null, t: (k: string) => string): string | null {
  if (!raw) return null;
  return raw
    .replace(/\bdays?\b/gi,   t('duration.days')   || 'days')
    .replace(/\bnights?\b/gi, t('duration.nights') || 'nights')
    .replace(/\bweeks?\b/gi,  t('duration.weeks')  || 'weeks')
    .replace(/\bmonths?\b/gi, t('duration.months') || 'months');
}

// Price minimums — used for offer scoring
const MIN_PRICE: Record<string, number> = {
  IMPLANT: 600, CROWN: 150, BRIDGE: 300, VENEER: 200,
  ALL_ON_4: 4000, ALL_ON_6: 5000, WHITENING: 100,
  EXTRACTION: 50, ROOT_CANAL: 200, CONSULT: 30,
};

function parsePriceMin(str: string): number | null {
  const nums = str.replace(/,(\d{3})/g, '$1').replace(/[^\d.]/g, ' ').trim().split(/\s+/)
    .map(Number).filter(n => !isNaN(n) && n > 0);
  return nums.length > 0 ? Math.min(...nums) : null;
}

// Parse a duration string to an approximate number of days for sorting.
// e.g. "3-5 days" → 4, "2 weeks" → 14, "1 month" → 30, "3-4 nights" → 3.5
function parseDurationDays(str: string): number {
  if (!str) return 999;
  const s = str.toLowerCase();
  const nums = s.replace(/[^\d.]/g, ' ').trim().split(/\s+/).map(Number).filter(n => !isNaN(n) && n > 0);
  const avg  = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 999;
  if (s.includes('month')) return avg * 30;
  if (s.includes('week'))  return avg * 7;
  return avg; // assume days / nights
}

/**
 * Score an offer for sorting — lower is better.
 * Penalise suspiciously low prices (below min), reward shorter duration.
 */
function scoreOffer(offer: Offer): number {
  const key      = offer.treatment_type?.toUpperCase() || '';
  const minAllow = MIN_PRICE[key] ?? 0;
  const priceMin = offer.price_range ? parsePriceMin(offer.price_range) : null;
  const duration = offer.duration    ? parseDurationDays(offer.duration) : 999;

  let score = 0;

  // Price component (50%): normalise price; below minimum → heavy penalty
  if (priceMin !== null && minAllow > 0) {
    if (priceMin < minAllow) {
      score += 200; // suspicious — bump to bottom
    } else {
      // Prefer lower price within a reasonable band (cap at 3× min)
      const normalised = Math.min(priceMin / minAllow, 3);
      score += normalised * 50;
    }
  }

  // Duration component (50%): shorter treatment = better
  score += Math.min(duration / 30, 3) * 50;

  return score;
}

type Offer = {
  id: string;
  clinic_id: string | null;
  clinic_name: string | null;
  treatment_type: string;
  price_range: string | null;
  duration: string | null;
  note: string | null;
  disclaimer: string;
  created_at: string;
  doctor_name: string | null;
};

// Key = `${clinicId}:${type}` (or `offer:${offerId}:${type}` for marketplace offers)
type RatingKey = string;

type Request = {
  id: string;
  clinic_id: string | null;
  clinic_name: string | null;
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
  const { user, signIn } = useAuth();
  const { t } = useLanguage();

  const [requests, setRequests]       = useState<Request[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [joiningClinic, setJoiningClinic] = useState<string | null>(null); // offer.id being joined
  // Set of "clinicId:type" (or "offer:offerId:type") keys for already-rated entries
  const [ratedKeys, setRatedKeys]     = useState<Set<RatingKey>>(new Set());

  // Patient's current clinic — check both UUID and code, either means they're attached
  const currentClinicId = String((user as any)?.clinicId || '').trim();
  const hasClinic = !!(currentClinicId || String((user as any)?.clinicCode || '').trim());

  const joinClinic = useCallback(async (clinicId: string, clinicName: string, offerId: string) => {
    Alert.alert(
      t('treatReq.joinClinic.title') || 'Kliniğe Katıl',
      (t('treatReq.joinClinic.confirm') || '{clinic} kliniği ile devam etmek istiyor musunuz?').replace('{clinic}', clinicName),
      [
        { text: t('common.cancel') || 'İptal', style: 'cancel' },
        {
          text: t('treatReq.joinClinic.yes') || 'Evet, Katıl',
          onPress: async () => {
            setJoiningClinic(offerId);
            try {
              const res = await fetch(`${API_BASE}/api/patient/clinic`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${user?.token}`,
                },
                body: JSON.stringify({ clinic_id: clinicId }),
              });
              const data = await res.json();
              if (!data?.ok) throw new Error(data?.error || 'error');
              // Update stored auth token so clinic association is reflected immediately
              await signIn({ ...user, token: data.token, clinicId: data.clinic.id, clinicCode: data.clinic.clinic_code });
              await saveSelectedChatClinic({
                id: String(data.clinic.id),
                clinic_code: data.clinic.clinic_code,
                name: data.clinic.name,
              });
              Alert.alert(
                t('treatReq.joinClinic.successTitle') || '✅ Klinik Eklendi',
                (t('treatReq.joinClinic.successMsg') || '{clinic} kliniğinize eklendi.').replace('{clinic}', data.clinic.name)
              );
            } catch (e: any) {
              Alert.alert(t('common.error'), e.message || t('common.pleaseRetry'));
            } finally {
              setJoiningClinic(null);
            }
          },
        },
      ]
    );
  }, [user, signIn, t]);

  /** Safe fetch → JSON: uses text() first so we always get a parseable error. */
  const safeFetch = useCallback(async (url: string, retries = 2): Promise<any> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${user?.token}` },
        });
        const text = await res.text();
        // Render warm-up: 502/503/504 return HTML, not JSON → wait and retry
        if ((res.status === 502 || res.status === 503 || res.status === 504) && attempt < retries) {
          await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
          continue;
        }
        try {
          return JSON.parse(text);
        } catch {
          // Server returned non-JSON (HTML error page, etc.)
          if (attempt < retries) {
            await new Promise(r => setTimeout(r, 1500));
            continue;
          }
          throw new Error(`Sunucu geçersiz yanıt döndürdü (${res.status}). Lütfen tekrar deneyin.`);
        }
      } catch (e: any) {
        if (attempt < retries && (e.message?.includes('Network') || e.message?.includes('fetch'))) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        throw e;
      }
    }
  }, [user?.token]);

  const load = useCallback(async () => {
    if (!user?.token) return;
    setError(null);
    try {
      const [reqData, ratData] = await Promise.all([
        safeFetch(`${API_BASE}/api/patient/treatment-requests`),
        safeFetch(`${API_BASE}/api/patient/ratings`).catch(() => ({ ok: true, ratings: [] })),
      ]);
      if (!reqData?.ok) {
        const errKey = reqData?.error || 'error';
        // Translate known server error codes to Turkish
        const errMsg: Record<string, string> = {
          db_error:          'Veritabanı hatası. Lütfen tekrar deneyin.',
          patientId_required:'Kimlik doğrulama hatası. Lütfen çıkış yapıp tekrar giriş yapın.',
          bad_token:         'Oturum süresi dolmuş. Lütfen tekrar giriş yapın.',
          not_found:         'Sayfa bulunamadı. Uygulama güncellenmiş olabilir.',
        };
        throw new Error(errMsg[errKey] || `Hata: ${errKey}`);
      }
      setRequests(reqData.requests || []);
      // Build a set of already-rated keys (clinic-level: 1 patient × 1 clinic × 1 type)
      const keys = new Set<RatingKey>(
        ((ratData as any)?.ratings || []).map((r: any) =>
          r.clinic_id ? `${r.clinic_id}:${r.type}` : `offer:${r.offer_id}:${r.type}`
        )
      );
      setRatedKeys(keys);
    } catch (e: any) {
      setError(e.message || t('common.error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.token, t, safeFetch]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load();
    // Mark all answered offers as seen — clears the home screen badge
    if (user?.token) {
      fetch(`${API_BASE}/api/patient/treatment-requests/mark-seen`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
      }).catch(() => {});
    }
  }, [load, user?.token]));

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
        {/* New request button — hidden once patient has a clinic */}
        {!hasClinic ? (
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => router.push('/request-treatment')}
          >
            <Text style={styles.newBtnText}>+</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 36 }} />
        )}
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

        {/* MORE CLINICS BANNER — hidden once patient has joined a clinic */}
        {!error && !hasClinic && requests.length > 0 && (() => {
          const MAX = 3;
          const contacted = new Set(requests.map(r => r.clinic_id).filter(Boolean)).size;
          const remaining = MAX - contacted;
          if (remaining <= 0) return null;
          return (
            <TouchableOpacity
              style={styles.moreBanner}
              onPress={() => router.push('/clinic-onboarding' as any)}
              activeOpacity={0.85}
            >
              <View style={styles.moreBannerLeft}>
                <Text style={styles.moreBannerSlots}>
                  {contacted}/{MAX}
                </Text>
                <Text style={styles.moreBannerSlotsLabel}>{t('treatReq.moreBanner.clinics') || 'clinics'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.moreBannerTitle}>
                  {remaining === 1
                    ? t('treatReq.moreBanner.oneSlot') || '1 more clinic slot available!'
                    : (t('treatReq.moreBanner.manySlots') || '{n} more clinic slots available!').replace('{n}', String(remaining))}
                </Text>
                <Text style={styles.moreBannerSub}>
                  {t('treatReq.moreBanner.sub') || 'Get more quotes to compare offers →'}
                </Text>
              </View>
              <Text style={styles.moreBannerArrow}>›</Text>
            </TouchableOpacity>
          );
        })()}

        {!error && requests.length === 0 && (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={styles.emptyTitle}>{t('treatReq.noRequests')}</Text>
            <Text style={styles.emptySub}>{t('treatReq.noRequestsSub')}</Text>
            {/* New request button — hidden once patient has a clinic */}
            {!hasClinic && (
              <TouchableOpacity
                style={styles.newRequestBtn}
                onPress={() => router.push('/request-treatment')}
              >
                <Text style={styles.newRequestBtnText}>+ {t('treatReq.newRequest')}</Text>
              </TouchableOpacity>
            )}
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
                  {/* Show target clinic name if the request was sent to a specific clinic */}
                  {req.clinic_name ? (
                    <Text style={styles.cardClinic}>🏥 {req.clinic_name}</Text>
                  ) : null}
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
                      <Text style={styles.offersTitle}>
                        {t('treatReq.doctorOffers')} · {t('treatReq.sortedByBestMatch') || 'sorted by best match'}
                      </Text>
                      {[...req.offers]
                        .sort((a, b) => scoreOffer(a) - scoreOffer(b))
                        .map((offer, idx) => {
                        const isBest = idx === 0 && req.offers.length > 1;
                        return (
                        <View key={offer.id} style={[styles.offerCard, isBest && styles.offerCardBest]}>
                          {/* Clinic name header */}
                          {offer.clinic_name && (
                            <View style={styles.offerClinicRow}>
                              <Text style={styles.offerClinicName}>🏥 {offer.clinic_name}</Text>
                              {isBest && (
                                <View style={styles.bestBadge}>
                                  <Text style={styles.bestBadgeText}>⭐ {t('treatReq.bestMatch') || 'Best Match'}</Text>
                                </View>
                              )}
                            </View>
                          )}
                          <View style={styles.offerHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                              <Text style={styles.offerDoctor}>
                                👨‍⚕️ {offer.doctor_name || t('treatReq.doctor')}
                              </Text>
                              {!offer.clinic_name && isBest && (
                                <View style={styles.bestBadge}>
                                  <Text style={styles.bestBadgeText}>⭐ {t('treatReq.bestMatch') || 'Best Match'}</Text>
                                </View>
                              )}
                            </View>
                            <Text style={styles.offerDate}>{fmtDate(offer.created_at)}</Text>
                          </View>
                          <Text style={styles.offerType}>
                            {t(`treatmentPlan.proc.${offer.treatment_type}`) || offer.treatment_type}
                          </Text>
                          {offer.price_range && (
                            <Text style={styles.offerRow}>💰 {offer.price_range}</Text>
                          )}
                          {offer.duration && (
                            <Text style={styles.offerRow}>📅 {translateDuration(offer.duration, t)}</Text>
                          )}
                          {offer.note && (
                            <Text style={styles.offerNote}>📝 {offer.note}</Text>
                          )}
                          <View style={styles.disclaimerBox}>
                            <Text style={styles.disclaimerText}>
                              ⚠️ {t('treatReq.disclaimer') || DISCLAIMER_FALLBACK}
                            </Text>
                          </View>

                          {/* Rating badges */}
                          {(() => {
                            const rk = offer.clinic_id
                              ? (tok: string) => `${offer.clinic_id}:${tok}`
                              : (tok: string) => `offer:${offer.id}:${tok}`;
                            const hasExp = ratedKeys.has(rk('experience'));
                            const hasTrt = ratedKeys.has(rk('treatment'));
                            const atThisClinic =
                              !!offer.clinic_id &&
                              !!currentClinicId &&
                              String(offer.clinic_id) === String(currentClinicId);
                            const canRateTreatmentOutcome = hasExp && !hasTrt && atThisClinic;
                            return (
                              <>
                                <View style={styles.ratingBadgeRow}>
                                  {hasExp && (
                                    <View style={styles.ratingBadge}>
                                      <Text style={styles.ratingBadgeText}>✓ {t('treatReq.visitedClinic') || 'Visited clinic'}</Text>
                                    </View>
                                  )}
                                  {hasTrt && (
                                    <View style={[styles.ratingBadge, styles.ratingBadgeTrt]}>
                                      <Text style={[styles.ratingBadgeText, styles.ratingBadgeTextTrt]}>✓ {t('treatReq.completedTreatment') || 'Completed treatment'}</Text>
                                    </View>
                                  )}
                                </View>

                                {/* Action buttons row */}
                                <View style={styles.actionRow}>
                                  {/* Join Clinic — hidden once the patient has any clinic */}
                                  {!hasClinic && offer.clinic_id && offer.clinic_id !== currentClinicId && (
                                    <TouchableOpacity
                                      style={[styles.joinBtn, styles.actionBtn]}
                                      disabled={joiningClinic === offer.id}
                                      onPress={() => joinClinic(offer.clinic_id!, offer.clinic_name || t('treatReq.clinic') || 'Clinic', offer.id)}
                                    >
                                      {joiningClinic === offer.id ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                      ) : (
                                        <Text style={styles.joinBtnText}>🏥 {t('treatReq.joinClinic.btn') || 'Kliniğe Katıl'}</Text>
                                      )}
                                    </TouchableOpacity>
                                  )}

                                  {/* Message Doctor */}
                                  <TouchableOpacity
                                    style={[styles.msgBtn, styles.actionBtn]}
                                    onPress={() =>
                                      router.push({
                                        pathname: '/offer-chat',
                                        params: {
                                          offerId: offer.id,
                                          otherName: encodeURIComponent(offer.doctor_name || t('treatReq.doctor')),
                                          treatmentType: offer.treatment_type,
                                        },
                                      })
                                    }
                                  >
                                    <Text style={styles.msgBtnText}>💬 {t('offerChat.messageDoctor')}</Text>
                                  </TouchableOpacity>

                                  {/* Rate Experience (if not yet rated for this clinic) */}
                                  {!hasExp && (
                                    <TouchableOpacity
                                      style={[styles.rateBtn, styles.actionBtn]}
                                      onPress={() =>
                                        router.push({
                                          pathname: '/rate',
                                          params: {
                                            offerId:       offer.id,
                                            type:          'experience',
                                            clinicName:    encodeURIComponent(offer.clinic_name || 'Clinic'),
                                            doctorName:    encodeURIComponent(offer.doctor_name || ''),
                                            treatmentDone: hasTrt ? '1' : '0',
                                          },
                                        })
                                      }
                                    >
                                      <Text style={styles.rateBtnText}>
                                        {t('treatReq.rateCommunicationBtn') || '💬 Rate communication'}
                                      </Text>
                                    </TouchableOpacity>
                                  )}

                                  {/* Treatment outcome — only after communication rating AND patient joined this clinic */}
                                  {canRateTreatmentOutcome && (
                                    <TouchableOpacity
                                      style={[styles.rateBtnTrt, styles.actionBtn]}
                                      onPress={() =>
                                        router.push({
                                          pathname: '/rate',
                                          params: {
                                            offerId:       offer.id,
                                            type:          'treatment',
                                            clinicName:    encodeURIComponent(offer.clinic_name || 'Clinic'),
                                            doctorName:    encodeURIComponent(offer.doctor_name || ''),
                                            treatmentDone: '1',
                                          },
                                        })
                                      }
                                    >
                                      <Text style={styles.rateBtnTrtText}>
                                        {t('treatReq.rateTreatmentBtn') || '🦷 Rate treatment outcome'}
                                      </Text>
                                    </TouchableOpacity>
                                  )}
                                </View>
                              </>
                            );
                          })()}
                        </View>
                        );
                      })}
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
  cardClinic: { fontSize: 12, fontWeight: '600', color: '#2563EB', marginTop: 2 },
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
  offerCardBest: {
    borderColor: '#2563EB', borderWidth: 1.5,
    backgroundColor: '#EFF6FF',
  },
  bestBadge: {
    backgroundColor: '#2563EB', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  bestBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  offerClinicRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    marginBottom: 8,
  },
  offerClinicName: { fontSize: 13, fontWeight: '700', color: '#1D4ED8', flex: 1 },
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
  // Action row
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  actionBtn: { flex: 1, minWidth: 80 },
  joinBtn: {
    backgroundColor: '#16A34A', borderRadius: 8, paddingVertical: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  joinBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },

  msgBtn: {
    backgroundColor: '#EFF6FF', borderRadius: 8, borderWidth: 1,
    borderColor: '#BFDBFE', paddingVertical: 8, alignItems: 'center',
  },
  msgBtnText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },

  // Rate buttons
  rateBtn: {
    backgroundColor: '#FEF9C3', borderRadius: 8, borderWidth: 1,
    borderColor: '#FDE68A', paddingVertical: 8, alignItems: 'center',
  },
  rateBtnText: { fontSize: 12, fontWeight: '700', color: '#92400E' },

  rateBtnTrt: {
    backgroundColor: '#F0FDF4', borderRadius: 8, borderWidth: 1,
    borderColor: '#BBF7D0', paddingVertical: 8, alignItems: 'center',
  },
  rateBtnTrtText: { fontSize: 12, fontWeight: '700', color: '#15803D' },

  // More clinics banner
  moreBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#f0fdf4', borderWidth: 1.5, borderColor: '#86efac',
    borderRadius: 12, padding: 14, marginBottom: 12,
  },
  moreBannerLeft: { alignItems: 'center', minWidth: 36 },
  moreBannerSlots: { fontSize: 20, fontWeight: '800', color: '#15803d', lineHeight: 24 },
  moreBannerSlotsLabel: { fontSize: 10, color: '#16a34a', fontWeight: '600' },
  moreBannerTitle: { fontSize: 14, fontWeight: '700', color: '#166534', marginBottom: 2 },
  moreBannerSub: { fontSize: 12, color: '#15803d', lineHeight: 17 },
  moreBannerArrow: { fontSize: 22, color: '#16a34a', fontWeight: '700' },

  // Rating badges
  ratingBadgeRow: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  ratingBadge: {
    backgroundColor: '#DBEAFE', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 3,
  },
  ratingBadgeText: { fontSize: 11, fontWeight: '700', color: '#1D4ED8' },
  ratingBadgeTrt: { backgroundColor: '#D1FAE5' },
  ratingBadgeTextTrt: { color: '#065F46' },
});
