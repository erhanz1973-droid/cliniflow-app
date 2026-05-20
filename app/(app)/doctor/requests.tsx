// app/doctor/requests.tsx — Doctor: Incoming requests dashboard with quick-offer system
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, RefreshControl, Modal,
  TextInput, Alert, KeyboardAvoidingView, Platform, Image, Linking,
  FlatList, InteractionManager,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthSession } from '../../../lib/auth';
import { useLanguage } from '../../../lib/language-context';
import { API_BASE, setAuthToken } from '../../../lib/api';
import { isEnrolledSharedCare } from '../../../lib/canonicalChatTarget';
import { startIncomingRequestChat } from '../../../lib/incomingRequestStartChat';
import { openDoctorPatientChat } from '../../../lib/navigateCanonicalChat';
import { openDoctorCoordinationWorkspace } from '../../../lib/navigateDoctorCoordination';
import { fetchRequestMessagingMeta } from '../../../lib/offerMessagingMeta';
import { invalidateDoctorThreadSummaryCacheOnly } from '../../../lib/doctorMessaging';
import { doctorPatientPrimaryKey } from '../../../lib/doctorPatientId';
import {
  formatTreatmentRequestDescription,
  extractPhotoUrlFromDescription,
} from '../../../lib/treatmentRequestDescription';
import { useDeferredFocusRefresh } from '../../../hooks/use-deferred-focus-refresh';
import { focusPerfMark, focusPerfStart } from '../../../lib/perfFocus';
import { peekCachedResource } from '../../../lib/resourceCache';
import {
  DOCTOR_REQUESTS_LIST_CACHE_KEY,
  type DoctorRequestRow,
  type MyOfferSummary,
  type RequestPhoto,
  normalizeDoctorRequests,
  stripRequestPhotosForPaint,
} from '../../../lib/doctorRequestsCache';
import { subscribeOfferUnreadEvents } from '../../../lib/offerUnreadEvents';
import {
  clearDoctorRequestUnreadByOfferId,
  fetchDoctorOfferUnreadMap,
  handleDoctorOfferUnreadEvent,
  mergeUnreadMapIntoRows,
  sortDoctorRequestsForInbox,
  syncDoctorRequestUnreadFromServer,
} from '../../../lib/doctorRequestsUnread';
import {
  hydrateDoctorRequestsFromDisk,
  persistDoctorRequestsList,
} from '../../../lib/doctorRequestsPersistence';

// ── Quick treatment presets ───────────────────────────────────────────────────
const QUICK = [
  { value: 'IMPLANT',  labelKey: 'treatmentPlan.proc.IMPLANT',  emoji: '🦷', price: '$800–1,200',   dur: '3–5 days' },
  { value: 'CROWN',    labelKey: 'treatmentPlan.proc.CROWN',    emoji: '👑', price: '$200–350',     dur: '2–3 days' },
  { value: 'BRIDGE',   labelKey: 'treatmentPlan.proc.BRIDGE_UNIT', emoji: '🌉', price: '$400–700', dur: '3–4 days' },
  { value: 'ALL_ON_4', labelKey: 'treatReq.proc.allOn4',        emoji: '✨', price: '$5,000–8,000', dur: '5–7 days' },
];

const ALL_TYPES = [
  { value: 'IMPLANT',    labelKey: 'treatmentPlan.proc.IMPLANT' },
  { value: 'CROWN',      labelKey: 'treatmentPlan.proc.CROWN' },
  { value: 'BRIDGE',     labelKey: 'treatmentPlan.proc.BRIDGE_UNIT' },
  { value: 'VENEER',     labelKey: 'treatmentPlan.proc.VENEER' },
  { value: 'ALL_ON_4',   labelKey: 'treatReq.proc.allOn4' },
  { value: 'ALL_ON_6',   labelKey: 'treatReq.proc.allOn6' },
  { value: 'WHITENING',  labelKey: 'treatmentPlan.proc.WHITENING' },
  { value: 'EXTRACTION', labelKey: 'treatmentPlan.proc.EXTRACTION' },
  { value: 'ROOT_CANAL', labelKey: 'treatmentPlan.proc.ROOT_CANAL' },
  { value: 'CONSULT',    labelKey: 'treatmentPlan.proc.CONSULT' },
  { value: 'OTHER',      labelKey: 'treatmentPlan.proc.OTHER' },
];


function fmtTs(iso: string, t: (k: string) => string) {
  try {
    const d   = new Date(iso);
    const now = new Date();
    const diffH = (now.getTime() - d.getTime()) / 36e5;
    if (diffH < 1)  return (t('requests.time.minsAgo') || '{n}m ago').replace('{n}', String(Math.round(diffH * 60)));
    if (diffH < 24) return (t('requests.time.hoursAgo') || '{n}h ago').replace('{n}', String(Math.round(diffH)));
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  } catch { return iso; }
}

type Request = DoctorRequestRow;

const ps = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  fullImage: { width: '100%', height: '100%', maxHeight: '92%' },
});

/** Full-screen tap-to-dismiss preview for request thumbnails */
function PhotoPreviewModal({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={ps.backdrop} activeOpacity={1} onPress={onClose}>
        {uri ? (
          <Image source={{ uri }} style={ps.fullImage} resizeMode="contain" />
        ) : null}
      </TouchableOpacity>
    </Modal>
  );
}

function fmtOfferDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('tr-TR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function isEnrolledSharedCareRequest(req: Request): boolean {
  return isEnrolledSharedCare({ leadThreadIsLead: req.lead_thread_is_lead });
}

/** Sheet: doctor’s own offer text (price, duration, note) — opened from “Offer sent” chip */
function OfferDetailModal({
  visible,
  onClose,
  req,
  onOpenChat,
  onOpenEnrolledPatientMessaging,
}: {
  visible: boolean;
  onClose: () => void;
  req: Request;
  onOpenChat: () => void;
  /** After enrollment: canonical thread only — no offer-thread chat entry. */
  onOpenEnrolledPatientMessaging: () => void;
}) {
  const { t } = useLanguage();
  const router = useRouter();
  const o = req.my_offer;
  const enrolled = isEnrolledSharedCareRequest(req);

  const line = (label: string, val: string | null | undefined) =>
    val ? (
      <Text style={ods.block}>
        <Text style={ods.bold}>{label}: </Text>
        {val}
      </Text>
    ) : null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={ods.wrap}>
        <TouchableOpacity style={ods.scrim} activeOpacity={1} onPress={onClose} />
        <View style={ods.card}>
          <View style={ods.cardHeader}>
            <Text style={ods.cardTitle}>{t('requests.offerDetail.title') || 'Your offer'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={ods.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={ods.scroll} keyboardShouldPersistTaps="handled">
            <Text style={ods.patientLine}>👤 {req.patient_name}</Text>
            {o?.created_at ? <Text style={ods.metaLine}>{fmtOfferDate(o.created_at)}</Text> : null}
            {!o && req.my_offer_id ? (
              <Text style={ods.hint}>
                {enrolled
                  ? (t('requests.offerDetail.enrolledNoPayloadHint') ||
                    'This request is archived for context. Messaging continues under Patients → Messages.')
                  : (t('requests.offerDetail.noPayload') ||
                    'Details will appear after you refresh; conversation is still available.')}
              </Text>
            ) : null}
            {line(t('requests.offerDetail.treatment') || 'Treatment', o?.treatment_type ? (t(`treatmentPlan.proc.${o.treatment_type}`) || o.treatment_type) : null)}
            {line(t('requests.offerDetail.price') || 'Price', o?.price_text ?? o?.price_range ?? null)}
            {line(t('requests.offerDetail.duration') || 'Duration', o?.duration ?? null)}
            {o?.note ? line(t('requests.offerDetail.note') || 'Note', o.note) : null}
            {enrolled ? (
              <View style={ods.enrolledBox}>
                <View style={ods.convertedBadge}>
                  <Text style={ods.convertedBadgeTxt}>
                    {t('requests.enrolled.convertedBadge')}
                  </Text>
                </View>
                <Text style={ods.enrolledGuidance}>{t('requests.enrolled.continueFromPatientsTab')}</Text>
                <TouchableOpacity
                  style={ods.primaryBtn}
                  onPress={() => {
                    onClose();
                    router.push('/doctor/patients');
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={ods.primaryBtnTxt}>
                    {t('requests.enrolled.openPatientsList') || 'Open Patients'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={ods.secondaryBtn}
                  onPress={() => {
                    onClose();
                    onOpenEnrolledPatientMessaging();
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={ods.secondaryBtnTxt}>
                    {t('requests.enrolled.openPatientChatSecondary')}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
            <TouchableOpacity
              style={ods.primaryBtn}
              onPress={() => {
                onClose();
                onOpenChat();
              }}
              activeOpacity={0.85}
            >
              <Text style={ods.primaryBtnTxt}>
                {t('requests.offerDetail.openChat') || 'Open conversation'}
              </Text>
            </TouchableOpacity>
            )}
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Quick Offer Modal ─────────────────────────────────────────────────────────
function QuickOfferModal({
  request, preset, token, onClose, onSent,
}: {
  request: Request;
  preset: typeof QUICK[0] | null;
  token?: string;
  onClose: () => void;
  onSent: (offerId?: string) => void;
}) {
  const { t } = useLanguage();

  const [treatType, setTreatType]   = useState(preset?.value || '');
  const [price,     setPrice]       = useState(preset?.price || '');
  const [duration,  setDuration]    = useState(preset?.dur   || '');
  const [note,      setNote]        = useState('');
  const [showMore,  setShowMore]    = useState(!preset);
  const [saving,    setSaving]      = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const submit = async () => {
    if (isEnrolledSharedCareRequest(request)) {
      Alert.alert(t('doctor.inbox.enrolledNoticeTitle'), t('doctor.inbox.enrolledNoticeBody'), [
        { text: t('common.ok'), onPress: () => onClose() },
      ]);
      return;
    }
    if (!treatType) {
      Alert.alert(t('requests.modal.selectType') || 'Select treatment type first');
      return;
    }
    if (price.trim().length > 0 && price.trim().length < 2) {
      Alert.alert(t('common.error') || 'Error', t('requests.modal.priceTooShort') || 'Please enter a valid price.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/doctor/treatment-requests/${request.id}/offer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            treatment_type: treatType,
            price_text:     price.trim()    || null,
            duration:       duration.trim() || null,
            note:           note.trim()     || null,
          }),
        }
      );
      const data = await res.json();
      if (!data?.ok) throw new Error(data?.error || 'Error');
      onSent(data?.offer_id ? String(data.offer_id) : undefined);
    } catch (e: any) {
      Alert.alert(t('common.error'), e.message);
    } finally {
      setSaving(false);
    }
  };

  const modalTitle = preset
    ? `${preset.emoji} ${t(preset.labelKey) || preset.value} ${t('requests.modal.sendOffer') || 'Send Offer'}`
    : (t('requests.modal.makeOffer') || 'Make an Offer');

  const patientSummaryText = formatTreatmentRequestDescription(request.description);
  const summaryFallbackPhoto = extractPhotoUrlFromDescription(request.description);
  const summaryPhotos: RequestPhoto[] =
    request.photos && request.photos.length > 0
      ? request.photos
      : summaryFallbackPhoto
        ? [{ url: summaryFallbackPhoto, type: 'image' }]
        : [];

  return (
    <>
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={ms.overlay}
      >
        <View style={ms.sheet}>
          <View style={ms.handleBar} />
          <View style={ms.header}>
            <View style={{ flex: 1 }}>
              <Text style={ms.title}>{modalTitle}</Text>
              <Text style={ms.patientRow} numberOfLines={1}>
                👤 {request.patient_name}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={ms.closeBtn}>
              <Text style={ms.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={ms.scroll} keyboardShouldPersistTaps="handled">

            {/* Patient request summary */}
            <View style={ms.summaryBox}>
              <Text style={ms.summaryLabel}>{t('requests.modal.patientRequest') || 'PATIENT REQUEST'}</Text>
              <Text style={ms.summaryText} numberOfLines={3}>{patientSummaryText || '—'}</Text>
              {request.budget && (
                <Text style={ms.summaryBudget}>{t('requests.modal.budget') || 'Budget: '}{request.budget}</Text>
              )}
              {summaryPhotos.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={ms.summaryPhotosRow}
                >
                  {summaryPhotos.filter(p => !!p.url).map((p, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setPreviewUri(p.url)}
                      activeOpacity={0.8}
                    >
                      <Image source={{ uri: p.url }} style={ms.summaryPhotoThumb} resizeMode="cover" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Treatment type */}
            {showMore ? (
              <View style={ms.typePicker}>
                <Text style={ms.fieldLabel}>{t('requests.modal.treatmentType') || 'Treatment type'}</Text>
                <View style={ms.typeGrid}>
                  {ALL_TYPES.map(tp => (
                    <TouchableOpacity
                      key={tp.value}
                      style={[ms.typeChip, treatType === tp.value && ms.typeChipActive]}
                      onPress={() => setTreatType(tp.value)}
                    >
                      <Text style={[ms.typeChipText, treatType === tp.value && ms.typeChipTextActive]}>
                        {t(tp.labelKey) || tp.value}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <View style={ms.presetRow}>
                <Text style={ms.presetBadge}>{preset?.emoji} {preset ? t(preset.labelKey) || preset.value : ''}</Text>
                <TouchableOpacity onPress={() => setShowMore(true)}>
                  <Text style={ms.changeTypeLink}>{t('requests.modal.changeType') || 'Change type'}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Price */}
            <Text style={ms.fieldLabel}>
              {t('requests.modal.price') || 'Price'}
            </Text>
            <TextInput
              style={ms.input}
              value={price}
              onChangeText={setPrice}
              placeholder={t('requests.modal.pricePlaceholder') || 'Örn: 5000-7000 TL veya muayene sonrası netleşir'}
              placeholderTextColor="#9CA3AF"
              maxLength={120}
            />

            {/* Duration */}
            <Text style={ms.fieldLabel}>{t('requests.modal.duration') || 'Duration'}</Text>
            <TextInput
              style={ms.input}
              value={duration}
              onChangeText={setDuration}
              placeholder={t('requests.modal.durationPlaceholder') || 'e.g. 3–5 days'}
              placeholderTextColor="#9CA3AF"
              maxLength={80}
            />

            {/* Note */}
            <Text style={ms.fieldLabel}>{t('requests.modal.note') || 'Note (optional)'}</Text>
            <TextInput
              style={ms.textarea}
              value={note}
              onChangeText={setNote}
              placeholder={t('requests.modal.notePlaceholder') || 'Any special notes for the patient...'}
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              maxLength={500}
              textAlignVertical="top"
            />

            {/* Disclaimer */}
            <View style={ms.disclaimer}>
              <Text style={ms.disclaimerText}>
                {t('requests.modal.disclaimer') || '⚠️ Preliminary estimate — final diagnosis requires clinical examination.'}
              </Text>
            </View>

            {/* Send */}
            <TouchableOpacity
              style={[ms.sendBtn, saving && ms.sendBtnDisabled]}
              onPress={submit}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={ms.sendBtnText}>{t('requests.modal.sendOffer') || 'Send Offer'}</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
    <PhotoPreviewModal uri={previewUri} onClose={() => setPreviewUri(null)} />
    </>
  );
}

function RequestCardSkeleton() {
  return (
    <View style={[cs.card, cs.skeletonCard]}>
      <View style={cs.skeletonLineWide} />
      <View style={cs.skeletonLine} />
      <View style={[cs.skeletonLine, { width: '72%' }]} />
      <View style={cs.skeletonThumbRow}>
        <View style={cs.skeletonThumb} />
        <View style={cs.skeletonThumb} />
      </View>
    </View>
  );
}

// ── Request Card ──────────────────────────────────────────────────────────────
const RequestCard = memo(function RequestCard({
  req,
  token,
  onOfferSent,
  onLeadOfferChat,
  onOpenEnrolledPatientMessaging,
  onOpenCoordination,
  isChatsFilter,
  startingChat,
}: {
  req: Request;
  token?: string;
  onOfferSent: (offerId?: string, request?: Request) => void;
  /** Opens offer-thread chat (bootstrap + navigate). */
  onLeadOfferChat: (offerId: string | null, request: Request) => void;
  startingChat?: boolean;
  /** Canonical enrolled / shared-care messaging (Patients → patient-chat). */
  onOpenEnrolledPatientMessaging: (request: Request) => void;
  /** AI coordination supervision feed for this request's patient. */
  onOpenCoordination: (request: Request) => void;
  isChatsFilter?: boolean;
}) {
  const { t } = useLanguage();
  const router = useRouter();

  const [preset, setPreset] = useState<typeof QUICK[0] | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [expanded, setExpanded]   = useState(false);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [offerDetailOpen, setOfferDetailOpen] = useState(false);

  const isPending  = req.status === 'pending';
  const hasMyOffer = !!req.my_offer_id;
  const enrolledShared = isEnrolledSharedCareRequest(req);

  const openQuick = (q: typeof QUICK[0]) => { setPreset(q); setShowModal(true); };
  const openFull  = () => { setPreset(null); setShowModal(true); };

  const offerCountLabel = req.offer_count === 1
    ? (t('requests.card.offerSent1') || '1 offer sent')
    : (t('requests.card.offersSent') || '{n} offers sent').replace('{n}', String(req.offer_count));

  const displayDesc = formatTreatmentRequestDescription(req.description);
  const fallbackPhotoUrl = extractPhotoUrlFromDescription(req.description);
  const photosForUi: RequestPhoto[] =
    req.photos && req.photos.length > 0
      ? req.photos
      : fallbackPhotoUrl
        ? [{ url: fallbackPhotoUrl, type: 'image' }]
        : [];

  const unreadN = Math.max(0, Number(req.unread_count) || 0);
  const hasUnread = !enrolledShared && hasMyOffer && unreadN > 0;

  return (
    <View style={[
      cs.card,
      enrolledShared && cs.cardEnrolled,
      isPending && !hasMyOffer && !enrolledShared && cs.cardUrgent,
      hasUnread && cs.cardUnread,
    ]}>
      {enrolledShared && (
        <View style={cs.enrolledRibbon} accessibilityRole="text">
          <Text style={cs.enrolledRibbonText}>{t('doctor.inbox.enrolledRequestsRibbon')}</Text>
        </View>
      )}

      {/* Top row */}
      <View style={cs.topRow}>
        <View style={cs.topLeft}>
          {enrolledShared ? (
            <View style={cs.convertedBadge}>
              <Text style={cs.convertedBadgeTxt}>{t('requests.enrolled.convertedBadge')}</Text>
            </View>
          ) : req.is_assigned_to_me ? (
            <View style={cs.assignedBadge}>
              <Text style={cs.assignedText}>{t('requests.card.assignedToMe') || '📌 Assigned to me'}</Text>
            </View>
          ) : null}
          <Text style={cs.patientName}>👤 {req.patient_name}</Text>
        </View>
        <View style={cs.topRight}>
          <Text style={cs.ts}>{fmtTs(req.created_at, t)}</Text>
          {enrolledShared ? (
            <View style={cs.convertedStatusDot} accessibilityLabel={t('requests.enrolled.convertedBadge')} />
          ) : unreadN > 0 ? (
            <View style={cs.unreadBadge}>
              <Text style={cs.unreadBadgeText}>{unreadN > 99 ? '99+' : unreadN}</Text>
            </View>
          ) : (
            <View style={[cs.statusDot, isPending ? cs.statusDotPending : cs.statusDotAnswered]} />
          )}
        </View>
      </View>

      {/* Description */}
      <TouchableOpacity onPress={() => setExpanded(e => !e)} activeOpacity={0.8}>
        <Text style={cs.description} numberOfLines={expanded ? undefined : 2}>
          {displayDesc || '—'}
        </Text>
        {!expanded && displayDesc.length > 80 && (
          <Text style={cs.readMore}>{t('requests.card.readMore') || 'more ▾'}</Text>
        )}
      </TouchableOpacity>

      {/* Attachments (photos / files) sent by patient */}
      {photosForUi.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={cs.photosRow}>
          {photosForUi.filter(p => !!p.url).map((p, i) => {
            const isImage = p.type === 'image' || p.type === 'xray' ||
              /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(p.url || '');
            return isImage ? (
              <TouchableOpacity
                key={i}
                onPress={() => setPreviewUri(p.url)}
                activeOpacity={0.8}
              >
                <Image source={{ uri: p.url }} style={cs.photoThumb} resizeMode="cover" />
                {p.type === 'xray' && (
                  <Text style={cs.photoLabel}>X-ray</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                key={i}
                style={cs.docThumb}
                onPress={() => Linking.openURL(p.url).catch(() =>
                  Alert.alert('Hata', 'Dosya açılamadı.')
                )}
                activeOpacity={0.8}
              >
                <Text style={cs.docThumbIcon}>📄</Text>
                <Text style={cs.docThumbName} numberOfLines={1}>
                  {(p.url || '').split('/').pop() || 'file'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Metadata chips */}
      <View style={cs.metaRow}>
        {hasUnread && (
          <View style={cs.metaChipUnread}>
            <Text style={cs.metaChipUnreadText}>
              {t('requests.card.newMessageChip') !== 'requests.card.newMessageChip'
                ? t('requests.card.newMessageChip').replace('{n}', String(unreadN))
                : `💬 ${unreadN} new message${unreadN === 1 ? '' : 's'}`}
            </Text>
          </View>
        )}
        {req.preferred_treatment && (
          <View style={cs.metaChip}>
            <Text style={cs.metaChipText}>🦷 {t(`treatmentPlan.proc.${req.preferred_treatment}`) || req.preferred_treatment}</Text>
          </View>
        )}
        {req.budget && (
          <View style={cs.metaChip}>
            <Text style={cs.metaChipText}>💰 {req.budget}</Text>
          </View>
        )}
        {req.offer_count > 0 && (
          <View style={[cs.metaChip, cs.metaChipGray]}>
            <Text style={cs.metaChipText}>{offerCountLabel}</Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={cs.coordinationBtn}
        onPress={() => onOpenCoordination(req)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={
          t('doctor.requests.openCoordination') !== 'doctor.requests.openCoordination'
            ? t('doctor.requests.openCoordination')
            : 'AI koordinasyon süpervizyonu'
        }
      >
        <Text style={cs.coordinationBtnText}>
          🤖{' '}
          {t('doctor.requests.openCoordination') !== 'doctor.requests.openCoordination'
            ? t('doctor.requests.openCoordination')
            : 'AI koordinasyon süpervizyonu'}
        </Text>
      </TouchableOpacity>

      {/* Quick action buttons — only for pending requests (not enrolled clinic patients) */}
      {isPending && !hasMyOffer && !enrolledShared && (
        <>
          <View style={cs.quickRow}>
            {QUICK.map(q => (
              <TouchableOpacity
                key={q.value}
                style={cs.quickBtn}
                onPress={() => openQuick(q)}
                activeOpacity={0.75}
              >
                <Text style={cs.quickEmoji}>{q.emoji}</Text>
                <Text style={cs.quickLabel}>{t(q.labelKey) || q.value}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={cs.quickBtnMore} onPress={openFull} activeOpacity={0.75}>
              <Text style={cs.quickMoreTxt}>···</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={cs.startMessagingPendingBtn}
            onPress={() => onLeadOfferChat(null, req)}
            disabled={startingChat}
            activeOpacity={0.85}
          >
            <Text style={cs.startMessagingPendingTxt}>
              {startingChat
                ? (t('requests.card.openingChat') || 'Opening…')
                : `💬 ${t('requests.card.startMessaging') || 'Start Messaging'}`}
            </Text>
          </TouchableOpacity>
        </>
      )}

      {/* After enrollment: no request-thread messaging — Patients tab is the only home */}
      {enrolledShared && (
        <View style={cs.enrolledBanner}>
          <Text style={cs.enrolledGuidance}>{t('requests.enrolled.continueFromPatientsTab')}</Text>
          <TouchableOpacity
            style={cs.enrolledPatientsBtn}
            onPress={() => router.push('/doctor/patients')}
            activeOpacity={0.85}
          >
            <Text style={cs.enrolledPatientsBtnTxt}>
              {t('requests.enrolled.openPatientsList') || 'Open Patients'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={cs.enrolledSecondaryLink}
            onPress={() => onOpenEnrolledPatientMessaging(req)}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={t('requests.enrolled.openPatientChatSecondary')}
          >
            <Text style={cs.enrolledSecondaryLinkTxt}>
              {t('requests.enrolled.openPatientChatSecondary')}
            </Text>
          </TouchableOpacity>
          {hasMyOffer ? (
            <TouchableOpacity style={cs.archivedOfferLink} onPress={() => setOfferDetailOpen(true)} activeOpacity={0.75}>
              <Text style={cs.archivedOfferLinkText}>
                📋 {t('requests.enrolled.viewArchivedOffer')}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Answered state — lead phase only: offer chat + resend */}
      {hasMyOffer && !enrolledShared && (
        isChatsFilter ? (
          <>
            <TouchableOpacity
              style={[cs.chatBtnFull, unreadN > 0 && cs.chatBtnFullUnread]}
              onPress={() => onLeadOfferChat(req.my_offer_id, req)}
              disabled={startingChat}
              activeOpacity={0.85}
            >
              <Text style={cs.chatBtnFullText}>
                💬 {t('requests.card.startMessaging') !== 'requests.card.startMessaging'
                  ? t('requests.card.startMessaging')
                  : (t('requests.card.openChat') || 'Open Conversation')}
                {unreadN > 0 ? `  •  ${unreadN} ${t('requests.card.newMessages') || 'new'}` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={cs.offerDetailLink} onPress={() => setOfferDetailOpen(true)} activeOpacity={0.75}>
              <Text style={cs.offerDetailLinkText}>
                📋 {t('requests.card.viewMyOffer') || 'View my offer'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <View style={cs.answeredRow}>
            <TouchableOpacity
              style={cs.answeredBadge}
              onPress={() => setOfferDetailOpen(true)}
              activeOpacity={0.75}
            >
              <Text style={cs.answeredBadgeText}>{t('requests.card.offerSentBadge') || '✓ Offer sent'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[cs.chatBtn, hasUnread && cs.chatBtnUnread]}
              onPress={() => onLeadOfferChat(req.my_offer_id, req)}
              disabled={startingChat}
            >
              <Text style={[cs.chatBtnText, hasUnread && cs.chatBtnTextUnread]}>
                {t('requests.card.startMessaging') !== 'requests.card.startMessaging'
                  ? `💬 ${t('requests.card.startMessaging')}`
                  : (t('requests.card.messages') || '💬 Messages')}
                {hasUnread ? ` (${unreadN > 99 ? '99+' : unreadN})` : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={cs.resendBtn} onPress={openFull}>
              <Text style={cs.resendBtnText}>{t('requests.card.another') || '+ Another'}</Text>
            </TouchableOpacity>
          </View>
        )
      )}

      {showModal && (
        <QuickOfferModal
          request={req}
          preset={preset}
          token={token}
          onClose={() => setShowModal(false)}
          onSent={(offerId) => { setShowModal(false); onOfferSent(offerId, req); }}
        />
      )}
      <PhotoPreviewModal uri={previewUri} onClose={() => setPreviewUri(null)} />
      <OfferDetailModal
        visible={offerDetailOpen}
        onClose={() => setOfferDetailOpen(false)}
        req={req}
        onOpenChat={() => {
          if (req.my_offer_id) onLeadOfferChat(req.my_offer_id, req);
        }}
        onOpenEnrolledPatientMessaging={() => onOpenEnrolledPatientMessaging(req)}
      />
    </View>
  );
});

// ── Dashboard Screen ──────────────────────────────────────────────────────────
type FilterKey = 'all' | 'mine' | 'pending' | 'answered' | 'chats';

const SKELETON_KEYS = ['sk1', 'sk2', 'sk3', 'sk4'] as const;

export default function DoctorRequestsScreen() {
  const router = useRouter();
  const { token } = useAuthSession();
  const { t } = useLanguage();

  const cachedList = peekCachedResource<DoctorRequestRow[]>(DOCTOR_REQUESTS_LIST_CACHE_KEY);
  const [requests, setRequests] = useState<DoctorRequestRow[]>(cachedList ?? []);
  const [loading, setLoading] = useState(cachedList == null);
  const hasDisplayedContentRef = useRef((cachedList?.length ?? 0) > 0);
  const diskHydrateStartedRef = useRef(false);
  const skipFocusRefreshOnceRef = useRef(true);
  const firstPaintMarkedRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [startingChatRequestId, setStartingChatRequestId] = useState<string | null>(null);
  const requestsRef = useRef(requests);
  requestsRef.current = requests;

  const markFirstPaint = useCallback((source: string) => {
    if (firstPaintMarkedRef.current) return;
    firstPaintMarkedRef.current = true;
    focusPerfMark('doctor:requests:first_paint', { source });
  }, []);

  const load = useCallback(
    async (opts?: { blocking?: boolean }) => {
      if (!token) return;
      const blocking = opts?.blocking === true && !hasDisplayedContentRef.current;
      if (blocking) setLoading(true);
      setAuthToken(token);
      setError(null);
      const endFetch = focusPerfStart('doctor:requests:fetch');
      try {
        const res = await fetch(
          `${API_BASE}/api/doctor/treatment-requests?lite=1`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (!data?.ok) throw new Error(data?.error || 'error');
        const rows = sortDoctorRequestsForInbox(
          normalizeDoctorRequests(Array.isArray(data.requests) ? data.requests : []),
        );

        const applyRows = (next: DoctorRequestRow[]) => {
          const sorted = sortDoctorRequestsForInbox(next);
          setRequests(sorted);
          persistDoctorRequestsList(sorted);
          hasDisplayedContentRef.current = next.length > 0 || hasDisplayedContentRef.current;
          focusPerfMark('doctor:requests:data_ready', { count: next.length });
        };

        const patchUnreadBadges = () => {
          void fetchDoctorOfferUnreadMap(token).then((byOffer) => {
            if (!byOffer || !Object.keys(byOffer).length) return;
            setRequests((prev) => {
              const merged = sortDoctorRequestsForInbox(mergeUnreadMapIntoRows(prev, byOffer));
              persistDoctorRequestsList(merged);
              return merged;
            });
          });
        };

        if (blocking && rows.length > 0) {
          applyRows(stripRequestPhotosForPaint(rows));
          patchUnreadBadges();
          InteractionManager.runAfterInteractions(() => {
            applyRows(rows);
            patchUnreadBadges();
          });
        } else {
          applyRows(rows);
          patchUnreadBadges();
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : t('common.error');
        setError(msg);
        if (!hasDisplayedContentRef.current) setRequests([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
        endFetch();
      }
    },
    [token, t]
  );

  useEffect(() => {
    if (cachedList?.length) {
      focusPerfMark('doctor:requests:data_ready', { count: cachedList.length, source: 'memory' });
    }
  }, [cachedList]);

  useEffect(() => {
    if (diskHydrateStartedRef.current) return;
    if (cachedList?.length) return;
    diskHydrateStartedRef.current = true;
    let cancelled = false;
    void hydrateDoctorRequestsFromDisk().then((rows) => {
      if (cancelled || !rows?.length || hasDisplayedContentRef.current) return;
      setRequests(sortDoctorRequestsForInbox(rows));
      hasDisplayedContentRef.current = true;
      setLoading(false);
      focusPerfMark('doctor:requests:data_ready', { count: rows.length, source: 'disk' });
      markFirstPaint('disk');
    });
    return () => {
      cancelled = true;
    };
  }, [cachedList, markFirstPaint]);

  useEffect(() => {
    if (!token) return;
    void load({ blocking: !hasDisplayedContentRef.current });
  }, [token, load]);

  useDeferredFocusRefresh(
    'doctor:requests:focus',
    () => {
      if (skipFocusRefreshOnceRef.current) {
        skipFocusRefreshOnceRef.current = false;
        return;
      }
      return load({ blocking: false });
    },
    { enabled: !!token, minIntervalMs: 55_000 }
  );

  const applyUnreadSync = useCallback(
    (next: DoctorRequestRow[] | null) => {
      if (next) setRequests(next);
    },
    [],
  );

  useEffect(() => {
    if (!token) return;
    return subscribeOfferUnreadEvents((ev) => {
      if (ev.recipient !== "doctor") return;
      if (ev.type === "offer_activity" || ev.type === "offer_realtime_update") {
        void syncDoctorRequestUnreadFromServer(token, requestsRef.current).then(applyUnreadSync);
        return;
      }
      const next = handleDoctorOfferUnreadEvent(ev);
      if (next) applyUnreadSync(next);
    });
  }, [token, applyUnreadSync]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load({ blocking: false });
  }, [load]);

  const openEnrolledPatientMessaging = useCallback(
    (req: Request) => {
      invalidateDoctorThreadSummaryCacheOnly();
      const openWithPatientId = (patientId: string | null | undefined) => {
        openDoctorPatientChat(
          router,
          {
            patientId,
            patientName: req.patient_name || 'Patient',
            offerId: req.my_offer_id,
            requestId: req.id,
            leadThreadIsLead: false,
            enrolled: true,
          },
          { source: 'doctor/requests-enrolled' },
        );
      };
      if (!token) {
        openWithPatientId(req.patient_id);
        return;
      }
      void fetchRequestMessagingMeta(token, req.id).then((meta) => {
        openWithPatientId(meta?.patient_id || req.patient_id);
      });
    },
    [router, token],
  );

  const handleOpenCoordination = useCallback(
    (req: Request) => {
      if (!token) return;
      setAuthToken(token);
      openDoctorCoordinationWorkspace(
        router,
        {
          requestId: req.id,
          patientId: req.patient_id,
          patientName: req.patient_name || 'Patient',
        },
        token,
        t,
      );
    },
    [router, token, t],
  );

  const handleLeadOfferChatPress = useCallback(
    (offerId: string | null, req: Request) => {
      if (!token || startingChatRequestId) return;
      const oid = String(offerId || req.my_offer_id || '').trim();
      if (oid) {
        const cleared = clearDoctorRequestUnreadByOfferId(oid);
        if (cleared?.length) setRequests(cleared);
      }
      setStartingChatRequestId(req.id);
      void startIncomingRequestChat({
        token,
        router,
        t,
        source: 'doctor/requests',
        ctx: {
          requestId: req.id,
          patientId: req.patient_id,
          patientName: req.patient_name || 'Patient',
          offerId,
          myOfferId: req.my_offer_id,
          leadThreadIsLead: req.lead_thread_is_lead ?? req.threadIsLead,
          preferredTreatment: req.preferred_treatment,
        },
      })
        .then((result) => {
          if (result.cacheRows) setRequests(result.cacheRows);
        })
        .finally(() => {
          setStartingChatRequestId(null);
        });
    },
    [token, router, t, startingChatRequestId],
  );

  const filtered = useMemo(() => {
    const rows = requests.filter((r) => {
      const enrolled = isEnrolledSharedCare({ leadThreadIsLead: r.lead_thread_is_lead });
      if (filter === 'mine') return !!r.my_offer_id;
      if (filter === 'pending') return r.status === 'pending';
      if (filter === 'answered') return r.status === 'answered';
      if (filter === 'chats') return !!r.my_offer_id && !enrolled;
      return true;
    });
    return sortDoctorRequestsForInbox(rows);
  }, [requests, filter]);

  const { pendingCount, mineCount, chatsCount, chatsUnreadCount } = useMemo(() => {
    let pending = 0;
    let mine = 0;
    let activeChats = 0;
    let chatsUnread = 0;
    for (const r of requests) {
      const enrolled = isEnrolledSharedCare({ leadThreadIsLead: r.lead_thread_is_lead });
      if (r.status === 'pending') pending += 1;
      if (r.my_offer_id) {
        mine += 1;
        if (!enrolled) {
          activeChats += 1;
          if ((r.unread_count ?? 0) > 0) chatsUnread += 1;
        }
      }
    }
    return {
      pendingCount: pending,
      mineCount: mine,
      chatsCount: activeChats,
      chatsUnreadCount: chatsUnread,
    };
  }, [requests]);

  const FILTERS: { key: FilterKey; label: string; count?: number }[] = useMemo(
    () => [
      {
        key: 'chats',
        label: t('requests.filter.chats') || '💬 My Chats',
        count: chatsUnreadCount > 0 ? chatsUnreadCount : chatsCount,
      },
      { key: 'all', label: t('requests.filter.all') || 'All' },
      { key: 'pending', label: t('requests.filter.pending') || 'Pending', count: pendingCount },
      { key: 'mine', label: t('requests.filter.mine') || 'Mine', count: mineCount },
      { key: 'answered', label: t('requests.filter.answered') || 'Answered' },
    ],
    [t, chatsCount, chatsUnreadCount, pendingCount, mineCount]
  );

  const handleOfferSent = useCallback(
    (offerId?: string, request?: Request) => {
      void load({ blocking: false });
      Alert.alert(
        t('requests.offerSent.title') || '✅ Offer sent!',
        t('requests.offerSent.msg') || 'The patient will be notified.',
        [
          {
            text: t('requests.card.startMessaging') || 'Start Messaging',
            onPress: () => {
              if (request) void handleLeadOfferChatPress(offerId || request.my_offer_id, request);
            },
          },
          { text: t('common.ok') || 'OK', style: 'cancel' },
        ],
      );
    },
    [load, t, handleLeadOfferChatPress],
  );

  const renderRequest = useCallback(
    ({ item }: { item: DoctorRequestRow }) => (
      <RequestCard
        req={item}
        token={token}
        isChatsFilter={filter === 'chats'}
        onOfferSent={handleOfferSent}
        onLeadOfferChat={handleLeadOfferChatPress}
        onOpenEnrolledPatientMessaging={openEnrolledPatientMessaging}
        onOpenCoordination={handleOpenCoordination}
        startingChat={startingChatRequestId === item.id}
      />
    ),
    [
      token,
      startingChatRequestId,
      filter,
      handleOfferSent,
      handleLeadOfferChatPress,
      openEnrolledPatientMessaging,
      handleOpenCoordination,
    ]
  );

  const keyExtractor = useCallback((item: DoctorRequestRow) => item.id, []);

  const showSkeleton = loading && !hasDisplayedContentRef.current && filtered.length === 0;

  return (
    <SafeAreaView
      style={ds.safe}
      onLayout={() => markFirstPaint(hasDisplayedContentRef.current ? 'cache' : 'shell')}
    >

      {/* Header */}
      <View style={ds.header}>
        <TouchableOpacity onPress={() => router.back()} style={ds.backBtn}>
          <Text style={ds.backTxt}>{t('requests.back') || '← Back'}</Text>
        </TouchableOpacity>
        <View style={ds.headerCenter}>
          <Text style={ds.headerTitle}>{t('requests.incoming') || 'Incoming Requests'}</Text>
          {pendingCount > 0 && (
            <View style={ds.badge}>
              <Text style={ds.badgeTxt}>{pendingCount}</Text>
            </View>
          )}
        </View>
        <View style={{ width: 60 }} />
      </View>

      {/* Filter tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={ds.filterBar}
        contentContainerStyle={ds.filterBarContent}
      >
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[ds.filterTab, filter === f.key && ds.filterTabActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text style={[ds.filterTabTxt, filter === f.key && ds.filterTabTxtActive]}>
              {f.label}
              {f.count !== undefined && f.count > 0 ? ` (${f.count})` : ''}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {showSkeleton ? (
        <ScrollView style={ds.scroll} contentContainerStyle={ds.content}>
          {SKELETON_KEYS.map((k) => (
            <RequestCardSkeleton key={k} />
          ))}
        </ScrollView>
      ) : (
        <FlatList
          style={ds.scroll}
          contentContainerStyle={ds.content}
          data={filtered}
          keyExtractor={keyExtractor}
          renderItem={renderRequest}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />
          }
          removeClippedSubviews
          maxToRenderPerBatch={8}
          windowSize={7}
          initialNumToRender={6}
          ListHeaderComponent={
            error ? (
              <View style={ds.errorBox}>
                <Text style={ds.errorTxt}>⚠️ {error}</Text>
                <TouchableOpacity onPress={() => void load({ blocking: false })}>
                  <Text style={ds.retryTxt}>{t('requests.retry') || 'Retry'}</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            !error ? (
              <View style={ds.emptyBox}>
                <Text style={ds.emptyIcon}>📭</Text>
                <Text style={ds.emptyTitle}>{t('requests.empty.title') || 'No requests here'}</Text>
                <Text style={ds.emptySub}>
                  {filter === 'mine'
                    ? (t('requests.empty.myOffers') ||
                      'You have not sent any offers yet. Use Pending to reply to requests.')
                    : (t('requests.empty.pull') || 'Pull down to refresh.')}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={<View style={{ height: 40 }} />}
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const ds = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F3F4F6' },
  backTxt: { color: '#374151', fontWeight: '600', fontSize: 13 },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  badge: {
    backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '800' },
  filterBar: {
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', maxHeight: 48,
  },
  filterBarContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row' },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB',
  },
  filterTabActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  filterTabTxt: { fontSize: 13, color: '#374151', fontWeight: '600' },
  filterTabTxtActive: { color: '#fff' },
  scroll: { flex: 1 },
  content: { padding: 14 },
  errorBox: {
    backgroundColor: '#FEE2E2', borderRadius: 10, padding: 14, marginBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  errorTxt: { color: '#991B1B', fontSize: 13, flex: 1 },
  retryTxt: { color: '#2563EB', fontSize: 13, fontWeight: '700', marginLeft: 8 },
  emptyBox: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#374151', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', paddingHorizontal: 24 },
});

const cs = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    borderLeftWidth: 3, borderLeftColor: 'transparent',
  },
  cardUrgent: { borderLeftColor: '#F59E0B' },
  cardUnread: { borderLeftColor: '#DC2626', backgroundColor: '#FFFBFB' },
  cardEnrolled: {
    borderLeftColor: '#7C3AED',
    backgroundColor: '#FAFAFF',
    borderWidth: 1,
    borderColor: '#EDE9FE',
    borderLeftWidth: 4,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  topLeft: { flex: 1, gap: 3 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assignedBadge: {
    alignSelf: 'flex-start', backgroundColor: '#EFF6FF', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, borderColor: '#BFDBFE',
  },
  assignedText: { fontSize: 10, color: '#1D4ED8', fontWeight: '700' },
  patientName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  ts: { fontSize: 11, color: '#9CA3AF' },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusDotPending: { backgroundColor: '#F59E0B' },
  statusDotAnswered: { backgroundColor: '#10B981' },
  description: { fontSize: 13, color: '#374151', lineHeight: 19, marginBottom: 6 },
  readMore: { fontSize: 12, color: '#2563EB', fontWeight: '600', marginBottom: 4 },
  photosRow: { flexDirection: 'row', marginBottom: 10, marginTop: 4 },
  photoThumb: { width: 72, height: 72, borderRadius: 8, marginRight: 8, backgroundColor: '#E5E7EB' },
  photoLabel: { fontSize: 9, color: '#6B7280', textAlign: 'center', marginTop: 2 },
  docThumb: { width: 72, height: 72, borderRadius: 8, marginRight: 8, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  docThumbIcon: { fontSize: 24 },
  docThumbName: { fontSize: 9, color: '#6B7280', marginTop: 2, paddingHorizontal: 4, textAlign: 'center' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  metaChip: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  metaChipGray: { backgroundColor: '#E5E7EB' },
  metaChipUnread: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  metaChipUnreadText: { fontSize: 11, color: '#B91C1C', fontWeight: '800' },
  metaChipText: { fontSize: 11, color: '#374151', fontWeight: '500' },

  quickRow: { flexDirection: 'row', gap: 6 },
  quickBtn: {
    flex: 1, backgroundColor: '#EFF6FF', borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE',
    paddingVertical: 8, alignItems: 'center', gap: 2,
  },
  quickEmoji: { fontSize: 18 },
  quickLabel: { fontSize: 10, color: '#1D4ED8', fontWeight: '700' },
  quickBtnMore: {
    width: 40, backgroundColor: '#F3F4F6', borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB',
    alignItems: 'center', justifyContent: 'center',
  },
  quickMoreTxt: { fontSize: 18, color: '#6B7280', fontWeight: '700', lineHeight: 24 },

  answeredRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  answeredBadge: {
    backgroundColor: '#D1FAE5', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  answeredBadgeText: { fontSize: 12, fontWeight: '700', color: '#065F46' },
  chatBtn: {
    flex: 1, backgroundColor: '#EFF6FF', borderRadius: 8, borderWidth: 1,
    borderColor: '#BFDBFE', paddingVertical: 7, alignItems: 'center',
  },
  chatBtnText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  chatBtnUnread: { backgroundColor: '#FEE2E2', borderColor: '#FCA5A5' },
  chatBtnTextUnread: { color: '#B91C1C' },
  resendBtn: {
    backgroundColor: '#F3F4F6', borderRadius: 8, borderWidth: 1, borderColor: '#D1D5DB',
    paddingHorizontal: 12, paddingVertical: 7,
  },
  resendBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  coordinationBtn: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#c4b5fd',
    backgroundColor: '#f5f3ff',
    alignItems: 'center',
  },
  coordinationBtnText: { fontSize: 13, fontWeight: '700', color: '#5b21b6' },
  // Chat-focused full-width button (shown in "My Chats" filter)
  chatBtnFull: {
    backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 12,
    alignItems: 'center', marginTop: 10,
  },
  chatBtnFullUnread: { backgroundColor: '#DC2626' }, // red when there are unread messages
  chatBtnFullText: { fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  startMessagingPendingBtn: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#93C5FD',
    paddingVertical: 11,
    alignItems: 'center',
    marginTop: 8,
  },
  startMessagingPendingTxt: { fontSize: 14, fontWeight: '800', color: '#1D4ED8' },
  // Unread message badge (top-right of card, replaces the status dot)
  unreadBadge: {
    backgroundColor: '#DC2626', borderRadius: 10, minWidth: 20, height: 20,
    paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center',
  },
  unreadBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  offerDetailLink: { alignItems: 'center', paddingVertical: 10, marginTop: 2 },
  offerDetailLinkText: { fontSize: 13, fontWeight: '700', color: '#2563EB' },
  enrolledRibbon: {
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#EDE9FE',
    borderWidth: 1,
    borderColor: '#C4B5FD',
  },
  enrolledRibbonText: { fontSize: 12, fontWeight: '700', color: '#5B21B6', lineHeight: 17 },
  convertedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    marginBottom: 4,
  },
  convertedBadgeTxt: { fontSize: 11, fontWeight: '800', color: '#5B21B6', letterSpacing: 0.2 },
  convertedStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#7C3AED',
    borderWidth: 2,
    borderColor: '#DDD6FE',
  },
  enrolledBanner: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  enrolledGuidance: {
    fontSize: 13,
    lineHeight: 19,
    color: '#4C1D95',
    fontWeight: '600',
    marginBottom: 12,
  },
  enrolledPatientsBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  enrolledPatientsBtnTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },
  enrolledSecondaryLink: {
    marginTop: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  enrolledSecondaryLinkTxt: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
  archivedOfferLink: { alignItems: 'center', paddingVertical: 8, marginTop: 4 },
  archivedOfferLinkText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  skeletonCard: { borderLeftColor: '#E5E7EB', opacity: 0.85 },
  skeletonLineWide: {
    height: 14,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    marginBottom: 10,
    width: '55%',
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E5E7EB',
    marginBottom: 8,
    width: '90%',
  },
  skeletonThumbRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  skeletonThumb: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
});

const ods = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  card: {
    backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18,
    maxHeight: '88%', paddingBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  cardTitle: { fontSize: 17, fontWeight: '800', color: '#111827', flex: 1 },
  closeTxt: { fontSize: 20, color: '#9CA3AF' },
  scroll: { maxHeight: 460, paddingHorizontal: 18, paddingTop: 12 },
  patientLine: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  metaLine: { fontSize: 12, color: '#6B7280', marginBottom: 12 },
  block: { fontSize: 14, color: '#374151', lineHeight: 21, marginBottom: 10 },
  bold: { fontWeight: '700', color: '#111827' },
  hint: { fontSize: 13, color: '#6B7280', marginBottom: 12, fontStyle: 'italic' },
  primaryBtn: {
    backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 8,
  },
  primaryBtnTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
  enrolledBox: {
    marginTop: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
  },
  convertedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#EDE9FE',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#C4B5FD',
    marginBottom: 10,
  },
  convertedBadgeTxt: { fontSize: 11, fontWeight: '800', color: '#5B21B6' },
  enrolledGuidance: {
    fontSize: 14,
    lineHeight: 20,
    color: '#4C1D95',
    fontWeight: '600',
    marginBottom: 14,
  },
  secondaryBtn: {
    marginTop: 8,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C4B5FD',
    backgroundColor: '#fff',
  },
  secondaryBtnTxt: { fontSize: 14, fontWeight: '700', color: '#5b21b6' },
});

const ms = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '92%',
  },
  handleBar: {
    width: 36, height: 4, backgroundColor: '#D1D5DB', borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  title: { fontSize: 17, fontWeight: '800', color: '#111827' },
  patientRow: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  closeBtn: { paddingLeft: 16, paddingTop: 2 },
  closeTxt: { fontSize: 18, color: '#9CA3AF' },
  scroll: { paddingHorizontal: 18 },

  summaryBox: {
    backgroundColor: '#F3F4F6', borderRadius: 10, padding: 12, marginTop: 14, marginBottom: 2,
  },
  summaryLabel: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.5, marginBottom: 4 },
  summaryText: { fontSize: 13, color: '#374151', lineHeight: 18 },
  summaryBudget: { fontSize: 12, color: '#6B7280', marginTop: 4, fontWeight: '600' },
  summaryPhotosRow: { flexDirection: 'row', marginTop: 10 },
  summaryPhotoThumb: {
    width: 88,
    height: 88,
    borderRadius: 10,
    marginRight: 8,
    backgroundColor: '#E5E7EB',
  },

  presetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 14,
  },
  presetBadge: { fontSize: 15, fontWeight: '700', color: '#2563EB' },
  changeTypeLink: { fontSize: 12, color: '#6B7280', fontWeight: '600', textDecorationLine: 'underline' },

  typePicker: { marginTop: 14 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  typeChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB',
  },
  typeChipActive: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  typeChipText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  typeChipTextActive: { color: '#fff' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 14, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#111827', backgroundColor: '#FAFAFA',
  },
  inputError: { borderColor: '#EF4444', borderWidth: 1.5 },
  errorHint: { fontSize: 12, color: '#DC2626', marginTop: 4, fontWeight: '600' },
  textarea: {
    borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 14,
    paddingVertical: 12, fontSize: 14, color: '#111827', backgroundColor: '#FAFAFA',
    minHeight: 72, textAlignVertical: 'top',
  },
  disclaimer: {
    backgroundColor: '#FEF9C3', borderRadius: 8, padding: 10, marginTop: 14,
    borderLeftWidth: 3, borderLeftColor: '#F59E0B',
  },
  disclaimerText: { fontSize: 11, color: '#92400E', lineHeight: 16 },
  sendBtn: {
    backgroundColor: '#2563EB', borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 18,
  },
  sendBtnDisabled: { backgroundColor: '#93C5FD' },
  sendBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
