// app/my-requests.tsx — Patient: View my treatment requests + doctor offers
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, RefreshControl, Alert, Image, BackHandler,
} from 'react-native';
import { useRouter, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useLanguage } from '../../lib/language-context';
import { API_BASE } from '../../lib/api';
import { saveSelectedChatClinic } from '../../lib/selectedChatClinic';
import { buildJoinClinicPatchBody } from '../../lib/patientJoinClinic';
import { invalidatePatientClinicMembership } from '../../lib/patientClinicMembershipSync';
import { refreshActiveClinicFromApi } from '../../lib/fetchPatientMyClinic';
import {
  formatTreatmentRequestDescription,
  resolveRequestImageUrl,
} from '../../lib/treatmentRequestDescription';
import { goToOfferChat } from '../../lib/goToOfferChat';
import { openRequestCoordinationChat } from '../../lib/patientCoordinationChat';
import { subscribeOfferUnreadEvents } from '../../lib/offerUnreadEvents';
import { schedulePatientInboxSummaryRefresh } from '../../lib/patientInboxUnread';

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
 * Rewards shorter treatment duration.
 */
function scoreOffer(offer: Offer): number {
  const duration = offer.duration ? parseDurationDays(offer.duration) : 999;
  return Math.min(duration / 30, 3) * 100;
}

type Offer = {
  id: string;
  clinic_id: string | null;
  clinic_name: string | null;
  /** From GET /api/patient/treatment-requests — required for PATCH join (clinic_code only). */
  clinic_code?: string | null;
  treatment_type: string;
  price_text: string | null;
  price_range: string | null;
  duration: string | null;
  note: string | null;
  disclaimer: string;
  created_at: string;
  doctor_name: string | null;
  last_message?: string | null;
  last_message_at?: string | null;
  last_message_role?: string | null;
  unread_count?: number;
};

// Key = `${clinicId}:${type}` (or `offer:${offerId}:${type}` for marketplace offers)
type RatingKey = string;

type Request = {
  id: string;
  clinic_id: string | null;
  clinic_name: string | null;
  clinic_code?: string | null;
  description: string;
  /** Sunucu (GET treatment-requests) — ham açıklamadaki URL yerine */
  image_url?: string | null;
  photos?: { url?: string }[] | null;
  budget: string | null;
  preferred_treatment: string | null;
  status: 'pending' | 'answered' | 'closed';
  proposal_status?: string | null;
  proposal_status_label?: string | null;
  proposal_waiting_minutes?: number | null;
  created_at: string;
  offers: Offer[];
  coordination_offer_id?: string | null;
  can_open_chat?: boolean;
  awaiting_clinic_doctor?: boolean;
  coordination_last_message?: string | null;
  coordination_unread_count?: number;
  chat_route?: 'offer_chat' | 'patient_chat' | string | null;
  enrolled?: boolean;
  is_clinic_member?: boolean;
};

function firstRouteParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  return String(Array.isArray(v) ? v[0] : v).trim();
}

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('tr-TR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    });
  } catch { return iso; }
}

export default function MyRequestsScreen() {
  const router = useRouter();
  const refParams = useLocalSearchParams<{
    referral_code?: string;
    referralCode?: string;
    inviterReferralCode?: string;
    ref?: string;
  }>();
  const referralFromRoute =
    firstRouteParam(refParams.referral_code) ||
    firstRouteParam(refParams.referralCode) ||
    firstRouteParam(refParams.inviterReferralCode) ||
    firstRouteParam(refParams.ref);
  const { user, signIn } = useAuth();
  const { t } = useLanguage();

  const [requests, setRequests]       = useState<Request[]>([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [joiningClinic, setJoiningClinic] = useState<string | null>(null); // offer.id being joined
  const [openingCoordinationId, setOpeningCoordinationId] = useState<string | null>(null);
  // Set of "clinicId:type" (or "offer:offerId:type") keys for already-rated entries
  const [ratedKeys, setRatedKeys]     = useState<Set<RatingKey>>(new Set());

  // Patient's current clinic — check both UUID and code, either means they're attached
  const currentClinicId = String((user as any)?.clinicId || '').trim();
  const hasClinic = !!(currentClinicId || String((user as any)?.clinicCode || '').trim());

  const joinClinic = useCallback(async (clinicCode: string, clinicName: string, offerId: string) => {
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
              const patchBody = buildJoinClinicPatchBody(clinicCode, referralFromRoute || undefined);
              const res = await fetch(`${API_BASE}/api/patient/clinic`, {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${user?.token}`,
                },
                body: JSON.stringify(patchBody),
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
              invalidatePatientClinicMembership("my_requests_join_clinic");
              void refreshActiveClinicFromApi(data.token);
              const refOk = data.referral?.linked === true || data.referral?.duplicate === true;
              const refBad = data.referral?.attempted && data.referral?.error;
              const baseMsg = (t('treatReq.joinClinic.successMsg') || '{clinic} kliniğinize eklendi.').replace(
                '{clinic}',
                data.clinic.name
              );
              const msg =
                refOk
                  ? `${baseMsg} ${t('treatReq.joinClinic.referralOk') || 'Referans kaydı uygulandı.'}`
                  : refBad
                    ? `${baseMsg} ${t('treatReq.joinClinic.referralSkip') || 'Referans kodu uygulanamadı.'}`
                    : baseMsg;
              Alert.alert(t('treatReq.joinClinic.successTitle') || '✅ Klinik Eklendi', msg);
            } catch (e: any) {
              Alert.alert(t('common.error'), e.message || t('common.pleaseRetry'));
            } finally {
              setJoiningClinic(null);
            }
          },
        },
      ]
    );
  }, [user, signIn, t, referralFromRoute]);

  const openCoordination = useCallback(
    async (req: Request) => {
      const token = String(user?.token || '').trim();
      if (!token) {
        Alert.alert(t('common.error'), t('common.pleaseRetry'));
        return;
      }
      setOpeningCoordinationId(req.id);
      try {
        await openRequestCoordinationChat(router, {
          token,
          requestId: req.id,
          clinicName: req.clinic_name,
          clinicId: req.clinic_id,
          clinicCode: req.clinic_code,
          treatmentType: req.preferred_treatment,
          coordinationOfferId: req.coordination_offer_id,
        });
      } catch (e: unknown) {
        const code = e instanceof Error ? e.message : String(e);
        if (code === 'clinic_doctor_not_assigned' || code === 'no_clinic_doctor') {
          Alert.alert(
            t('treatReq.errors.clinicDoctorTitle'),
            t('treatReq.errors.clinicDoctorNotAssigned'),
          );
          return;
        }
        Alert.alert(t('common.error'), code || t('common.pleaseRetry'));
      } finally {
        setOpeningCoordinationId(null);
      }
    },
    [router, t, user?.token],
  );

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

  const applyRatings = useCallback((ratData: { ratings?: unknown[] }) => {
    const keys = new Set<RatingKey>(
      ((ratData?.ratings || []) as any[]).map((r: any) =>
        r.clinic_id ? `${r.clinic_id}:${r.type}` : `offer:${r.offer_id}:${r.type}`
      )
    );
    setRatedKeys(keys);
  }, []);

  const load = useCallback(async () => {
    if (!user?.token) return;
    setError(null);
    try {
      const reqData = await safeFetch(`${API_BASE}/api/patient/treatment-requests`, 1);
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
      const rawList = (reqData.requests || []) as Request[];
      setRequests(
        rawList.map((r) => ({
          ...r,
          image_url: r.image_url ?? null,
          photos: Array.isArray(r.photos) ? r.photos : null,
        }))
      );
      void safeFetch(`${API_BASE}/api/patient/ratings`, 0)
        .then((ratData) => applyRatings(ratData))
        .catch(() => applyRatings({ ratings: [] }));
    } catch (e: any) {
      setError(e.message || t('common.error'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.token, t, safeFetch, applyRatings]);

  useFocusEffect(useCallback(() => {
    if (requests.length === 0) setLoading(true);
    else {
      setLoading(false);
      setRefreshing(true);
    }
    load();
    // Mark all answered offers as seen — clears the home screen badge
    if (user?.token) {
      fetch(`${API_BASE}/api/patient/treatment-requests/mark-seen`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.token}` },
      })
        .then(() => schedulePatientInboxSummaryRefresh(user.token!))
        .catch(() => {});
    }
  }, [load, user?.token, requests.length]));

  useEffect(() => {
    if (!user?.token) return;
    return subscribeOfferUnreadEvents((ev) => {
      if (ev.recipient !== 'patient') return;
      if (ev.type === 'offer_mark_read') return;
      void load();
      schedulePatientInboxSummaryRefresh(user.token!);
    });
  }, [load, user?.token]);

  const onRefresh = () => { setRefreshing(true); load(); };

  /** Teklif akışı my-requests'i `replace` ile açabiliyor — yığında geri yok; GO_BACK hatasını önle. */
  const leaveScreen = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(patient)" as any);
    }
  }, [router]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      leaveScreen();
      return true;
    });
    return () => sub.remove();
  }, [leaveScreen]);

  const statusColor = (s: string) => {
    if (s === 'answered') return { bg: '#D1FAE5', text: '#065F46' };
    if (s === 'closed')   return { bg: '#E5E7EB', text: '#374151' };
    return { bg: '#FEF3C7', text: '#92400E' }; // pending
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={leaveScreen} style={styles.backBtn}>
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
        <TouchableOpacity onPress={leaveScreen} style={styles.backBtn}>
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
          const displayDescription = formatTreatmentRequestDescription(req.description);
          const requestPhotoUrl = resolveRequestImageUrl(req);
          const awaitingDoctor = req.awaiting_clinic_doctor === true;
          const showCoordinationChat =
            !awaitingDoctor &&
            req.can_open_chat !== false &&
            req.status !== 'closed' &&
            (req.offers.length === 0 ||
              !!req.coordination_offer_id ||
              !!req.coordination_last_message?.trim());
          return (
            <View key={req.id} style={styles.card}>
              {/* Card header */}
              <TouchableOpacity
                style={styles.cardHeader}
                onPress={() => setExpandedId(isExpanded ? null : req.id)}
                activeOpacity={0.75}
              >
                <View style={styles.cardHeaderLeft}>
                  <View style={styles.cardHeaderMetaRow}>
                    <View style={[styles.statusPill, { backgroundColor: sc.bg }]}>
                      <Text style={[styles.statusText, { color: sc.text }]}>
                        {req.status === 'answered' ? t('treatReq.status.answered') :
                         req.status === 'closed'   ? t('treatReq.status.closed') :
                         awaitingDoctor
                           ? t('treatReq.status.awaitingClinicDoctor')
                           : t('treatReq.status.pending')}
                      </Text>
                    </View>
                    {req.clinic_name ? (
                      <Text style={styles.cardClinic}>🏥 {req.clinic_name}</Text>
                    ) : null}
                    <Text style={styles.cardDate}>{fmtDate(req.created_at)}</Text>
                  </View>
                  {awaitingDoctor ? (
                    <Text style={styles.awaitingDoctorHint}>
                      {t('treatReq.awaitingClinicDoctorHint')}
                    </Text>
                  ) : null}
                  {showCoordinationChat ? (
                    <View style={styles.coordCtaBelowStatus}>
                      {!!req.coordination_last_message?.trim() && (
                        <Text style={styles.coordPreviewTop} numberOfLines={1}>
                          💬 {req.coordination_last_message}
                        </Text>
                      )}
                      <TouchableOpacity
                        style={[styles.msgBtn, styles.coordChatBtnTop]}
                        disabled={openingCoordinationId === req.id}
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          void openCoordination(req);
                        }}
                      >
                        {openingCoordinationId === req.id ? (
                          <ActivityIndicator size="small" color="#2563EB" />
                        ) : (
                          <Text style={styles.msgBtnText}>
                            💬{' '}
                            {req.coordination_last_message?.trim()
                              ? t('offerChat.viewMessages')
                              : t('treatReq.openCoordination')}
                            {(req.coordination_unread_count ?? 0) > 0
                              ? ` (${req.coordination_unread_count})`
                              : ''}
                          </Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  ) : null}
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

              {/* Mesaj / özet — ham JSON veya imzalı URL satırı gösterilmez */}
              <Text style={styles.description} numberOfLines={isExpanded ? undefined : 3}>
                {displayDescription || '—'}
              </Text>
              {requestPhotoUrl ? (
                <Image
                  source={{ uri: requestPhotoUrl }}
                  style={styles.requestPhoto}
                  resizeMode="cover"
                />
              ) : null}

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
                      <Text style={styles.noOffersText}>
                        {req.proposal_status_label ||
                          (req.proposal_status && req.proposal_status !== 'quote_sent'
                            ? t('treatReq.preparingEstimate')
                            : t('treatReq.coordinationInProgress'))}
                      </Text>
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
                          {(offer.price_text ?? offer.price_range) && (
                            <Text style={styles.offerRow}>💰 {offer.price_text ?? offer.price_range}</Text>
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

                          {!!offer.last_message?.trim() && (
                            <View style={styles.offerThreadPreview}>
                              <Text style={styles.offerThreadPreviewLabel}>
                                💬 {t('offerChat.viewMessages')}
                              </Text>
                              <Text style={styles.offerThreadPreviewText} numberOfLines={2}>
                                {offer.last_message_role === 'patient'
                                  ? `${t('offerChat.you')}: `
                                  : offer.last_message_role === 'doctor'
                                    ? `${offer.doctor_name || t('treatReq.doctor')}: `
                                    : ''}
                                {offer.last_message}
                              </Text>
                            </View>
                          )}

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
                                  {!hasClinic && !!offer.clinic_code?.trim() && (
                                    <TouchableOpacity
                                      style={[styles.joinBtn, styles.actionBtn]}
                                      disabled={joiningClinic === offer.id}
                                      onPress={() =>
                                        joinClinic(
                                          String(offer.clinic_code).trim(),
                                          offer.clinic_name || t('treatReq.clinic') || 'Clinic',
                                          offer.id
                                        )
                                      }
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
                                      goToOfferChat(
                                        router,
                                        {
                                          offerId: offer.id,
                                          otherNameRaw: offer.doctor_name || t('treatReq.doctor'),
                                          treatmentType: offer.treatment_type,
                                        },
                                        'my-requests'
                                      )
                                    }
                                  >
                                    <Text style={styles.msgBtnText}>
                                      💬{' '}
                                      {offer.last_message?.trim()
                                        ? t('offerChat.viewMessages')
                                        : t('offerChat.messageDoctor')}
                                      {(offer.unread_count ?? 0) > 0
                                        ? ` (${offer.unread_count})`
                                        : ''}
                                    </Text>
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
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  cardHeaderLeft: { flex: 1, minWidth: 0, marginRight: 8 },
  cardHeaderMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 },
  coordCtaBelowStatus: { marginTop: 8, width: '100%' },
  awaitingDoctorHint: {
    fontSize: 12,
    color: '#92400E',
    marginTop: 8,
    lineHeight: 18,
  },
  coordPreviewTop: { fontSize: 12, color: '#475569', marginBottom: 6 },
  coordChatBtnTop: { alignSelf: 'stretch' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  cardDate: { fontSize: 12, color: '#9CA3AF' },
  cardClinic: { fontSize: 12, fontWeight: '600', color: '#2563EB', marginTop: 2 },
  offerBadge: { backgroundColor: '#DBEAFE', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  offerBadgeText: { fontSize: 11, color: '#1D4ED8', fontWeight: '700' },
  chevron: { fontSize: 12, color: '#9CA3AF' },
  description: { fontSize: 14, color: '#374151', lineHeight: 20 },
  requestPhoto: {
    width: '100%',
    height: 168,
    borderRadius: 10,
    marginTop: 10,
    backgroundColor: '#E5E7EB',
  },

  details: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  detailRow: { fontSize: 13, color: '#6B7280', marginBottom: 6 },

  noOffers: { paddingVertical: 16, alignItems: 'center', gap: 10 },
  noOffersText: { fontSize: 13, color: '#64748b', textAlign: 'center' },
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
  offerThreadPreview: {
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  offerThreadPreviewLabel: { fontSize: 11, fontWeight: '800', color: '#0369A1', marginBottom: 4 },
  offerThreadPreviewText: { fontSize: 13, color: '#0C4A6E', lineHeight: 18 },
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
