/**
 * Teklif thread'i — TEK KAYNAK: `public.offer_messages` + Supabase Realtime.
 *
 * ❌ GET /api/offer-messages ([GET RAW SOURCE]) — bu hook aktifken kullanma.
 *
 * `ready`: initial select TAMAM **ve** SUBSCRIBED status geldi → iki koşul birden.
 * `timedOut`: 8 sn içinde SUBSCRIBED gelmedi → ekran Railway fallback'e düşer.
 *
 * useEffect deps: [offerId, configured] — SADECE BUNLAR.
 * ❌ messages, state, function, object ekleme.
 */
import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { io, type Socket } from 'socket.io-client';
import { getSupabaseClient, isSupabaseRealtimeConfigured } from '../lib/supabase';
import { API_BASE } from '../lib/api';

const SUBSCRIBED_TIMEOUT_MS = 8_000;
const POLL_INTERVAL_MS = 5_000;

export type SupabaseOfferMessage = {
  id: string;
  offer_id: string;
  sender_id: string;
  sender_role: 'patient' | 'doctor' | 'system';
  sender_name: string;
  text: string | null;
  attachment_url: string | null;
  attachment_type: 'image' | 'xray' | 'document' | null;
  created_at: string;
  _supabase?: true;
};

type OfferMessagesRow = Record<string, unknown> & {
  id: string;
  created_at: string;
  /** DB kolon adı henüz kesin değil — message_text veya text olabilir */
  message_text?: string | null;
  text?: string | null;
  content?: string | null;
  body?: string | null;
  message?: string | null;
  sender_id?: string | null;
  sender_role?: string | null;
  offer_id?: string | null;
  sender_name?: string | null;
  attachment?: unknown | null;
  attachment_url?: string | null;
  attachment_type?: string | null;
};

function resolveAttachmentUrl(row: OfferMessagesRow): string | null {
  if (row.attachment_url) return String(row.attachment_url);
  const att = row.attachment as Record<string, unknown> | null | undefined;
  if (att?.url) return String(att.url);
  return null;
}

function resolveAttachmentType(row: OfferMessagesRow): SupabaseOfferMessage['attachment_type'] {
  const raw =
    row.attachment_type ??
    (row.attachment as Record<string, unknown> | null | undefined)?.type;
  if (raw === 'image' || raw === 'xray' || raw === 'document') return raw;
  return null;
}

function offerRowToMessage(row: OfferMessagesRow, fallbackOfferId = ''): SupabaseOfferMessage {
  const role = String(row.sender_role ?? 'patient').toLowerCase();

  // DB kolonu `text` olduğu kanıtlandı (Railway + Supabase RAW KEYS logları).
  // message_text fallback → schema değişikliğine karşı.
  const rawText = row.text ?? row.message_text ?? row.content ?? row.body ?? row.message ?? null;
  const text = rawText != null ? String(rawText) : null;

  return {
    id: row.id,
    offer_id: String(row.offer_id ?? fallbackOfferId),
    sender_id: String(row.sender_id ?? ''),
    sender_role:
      role === 'doctor' ? 'doctor' : role === 'system' ? 'system' : 'patient',
    sender_name: String(row.sender_name ?? '').trim(),
    text,
    attachment_url: resolveAttachmentUrl(row),
    attachment_type: resolveAttachmentType(row),
    created_at: new Date(row.created_at).toISOString(),
    _supabase: true,
  };
}

function sortAndDedupe(msgs: SupabaseOfferMessage[]): SupabaseOfferMessage[] {
  const seen = new Set<string>();
  return msgs
    .filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export type UseSupabaseOfferMessagesResult = {
  messages: SupabaseOfferMessage[];
  /** initial select TAMAM + SUBSCRIBED geldi → iki koşul birden. */
  ready: boolean;
  configured: boolean;
  /** 8 sn içinde SUBSCRIBED gelmedi → Railway fallback kullan. */
  timedOut: boolean;
};

export function useSupabaseOfferMessages({
  offerId,
  token,
}: {
  offerId: string;
  /** JWT token for Socket.IO auth — enables instant push when Supabase Realtime is not configured */
  token?: string;
}): UseSupabaseOfferMessagesResult {
  const [messages, setMessages] = useState<SupabaseOfferMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const configured = isSupabaseRealtimeConfigured();

  useEffect(() => {
    if (!configured || !offerId?.trim()) {
      setMessages([]);
      setReady(false);
      setTimedOut(false);
      return;
    }

    const sb = getSupabaseClient();
    if (!sb) {
      setTimedOut(true);
      return;
    }

    // Guard: zaten bu topic için subscribe var → double subscribe engelle
    if (channelRef.current) return;

    const oid = offerId.trim();
    let disposed = false;
    setReady(false);
    setTimedOut(false);

    let selectDone = false;
    let subscribed = false;
    const maybeSetReady = () => {
      if (selectDone && subscribed && !disposed) {
        setReady(true);
      }
    };

    // 8 sn içinde SUBSCRIBED gelmezse Railway fallback.
    // `!subscribed` kullan — `!ready` stale closure'dan etkilenir.
    const timeoutId = setTimeout(() => {
      if (!disposed && !subscribed) {
        if (__DEV__) console.log('[useSupabaseOfferMessages] ⏱ SUBSCRIBED gelmedi — timedOut=true');
        setTimedOut(true);
      }
    }, SUBSCRIBED_TIMEOUT_MS);

    // İlk yükleme
    void sb
      .from('offer_messages')
      .select('*')
      .eq('offer_id', oid)
      .order('created_at', { ascending: true })
      .limit(50)
      .then(({ data, error }) => {
        if (disposed) return;
        if (error && __DEV__) console.log('[useSupabaseOfferMessages] SELECT error:', error.message);
        if (data) {
          setMessages(sortAndDedupe((data as OfferMessagesRow[]).map(r => offerRowToMessage(r, oid))));
        }
        selectDone = true;
        maybeSetReady();
      });

    // Realtime — server-side filter: sadece bu teklif'in olayları gelir
    const topic = `offer-messages-${oid}`;
    const channel = sb
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'offer_messages',
          filter: `offer_id=eq.${oid}`,
        },
        (payload) => {
          const raw = payload.new as OfferMessagesRow;
          if (!raw?.id) return;
          if (__DEV__) console.log('🔥 RT INSERT offer_messages:', raw.id);
          const msg = offerRowToMessage(raw, oid);
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;
            return sortAndDedupe([...prev, msg]);
          });
        },
      )
      .subscribe((status) => {
        if (__DEV__) console.log('🔥 RT STATUS offer_messages:', status);
        if (status === 'SUBSCRIBED' && !disposed) {
          subscribed = true;
          // Catch-up SELECT: subscribe kurulurken gelen mesajları kaçırmamak için
          void sb
            .from('offer_messages')
            .select('*')
            .eq('offer_id', oid)
            .order('created_at', { ascending: true })
            .limit(50)
            .then(({ data }) => {
              if (disposed || !data) return;
              // Filter ÖNCE map SONRA → sadece yeni satırlar map edilir, gereksiz re-render yok
              setMessages(prev => {
                const freshRows = (data as OfferMessagesRow[]).filter(
                  r => !prev.some(p => p.id === r.id),
                );
                if (freshRows.length === 0) return prev; // hiç yeni satır yok → re-render yok
                if (__DEV__) console.log('[useSupabaseOfferMessages] catch-up +', freshRows.length, 'new rows');
                return sortAndDedupe([...prev, ...freshRows.map(r => offerRowToMessage(r, oid))]);
              });
            });
          maybeSetReady();
        }
        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !disposed) {
          if (__DEV__) console.log('[useSupabaseOfferMessages] RT bağlantı hatası:', status);
          setTimedOut(true);
        }
      });

    channelRef.current = channel;

    // Güvenlik ağı: Realtime event gelmezse (RLS / network) 30 sn'de SELECT
    const pollId = setInterval(() => {
      if (disposed) return;
      void sb
        .from('offer_messages')
        .select('*')
        .eq('offer_id', oid)
        .order('created_at', { ascending: true })
        .limit(50)
        .then(({ data }) => {
          if (disposed || !data) return;
          setMessages(prev => {
            // Filter ÖNCE → sadece yeni satırlar map edilir
            const freshRows = (data as OfferMessagesRow[]).filter(
              r => !prev.some(p => p.id === r.id),
            );
            if (freshRows.length === 0) return prev; // re-render yok
            if (__DEV__) console.log('[useSupabaseOfferMessages] poll +', freshRows.length, 'new rows');
            return sortAndDedupe([...prev, ...freshRows.map(r => offerRowToMessage(r, oid))]);
          });
        });
    }, POLL_INTERVAL_MS);

    return () => {
      disposed = true;
      clearTimeout(timeoutId);
      clearInterval(pollId);
      if (channelRef.current) {
        void sb.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [offerId, configured]); // ✅ SADECE BUNLAR — messages/state/function ekleme

  // Socket.IO subscription — instant delivery when Supabase Realtime publication is not configured
  useEffect(() => {
    const tok = String(token || '').trim();
    const oid = String(offerId || '').trim();
    if (!tok || !oid) return;

    const origin = String(API_BASE ?? '').trim().replace(/\/+$/, '');
    if (!origin || !/^https?:\/\//i.test(origin)) return;

    if (socketRef.current) return; // already connected for this offerId

    const socket = io(origin, {
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      forceNew: true,
      auth: { token: tok },
      timeout: 15_000,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (__DEV__) console.log('[offer-socket] connected, joining offer:', oid);
      socket.emit('join_offer', { offerId: oid }, (resp: unknown) => {
        if (__DEV__) console.log('[offer-socket] join_offer ack:', resp);
      });
    });

    socket.on('offer_new_message', (msg: SupabaseOfferMessage) => {
      if (!msg?.id || msg.offer_id !== oid) return;
      if (__DEV__) console.log('[offer-socket] RECEIVED offer_new_message:', msg.id, msg.sender_role);
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return sortAndDedupe([...prev, { ...msg, _supabase: true }]);
      });
    });

    socket.on('connect_error', (err: unknown) => {
      if (__DEV__) console.log('[offer-socket] connect_error:', String(err));
    });

    return () => {
      try {
        socket.removeAllListeners();
        socket.disconnect();
      } catch { /* ignore */ }
      socketRef.current = null;
    };
  }, [offerId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  return { messages, ready, configured, timedOut };
}
