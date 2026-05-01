/**
 * Hasta ↔ klinik chat — TEK KAYNAK: `public.messages` + Supabase Realtime.
 *
 * ❌ Railway / fetch('/api/patient/me/messages') — bu hook aktifken kullanma.
 * ❌ Socket.IO onNewMessage — bu hook aktifken kullanma.
 *
 * `ready`: initial select TAMAM **ve** SUBSCRIBED status geldi → iki koşul birden.
 * `timedOut`: 8 sn içinde SUBSCRIBED gelmedi → ekran Railway fallback'e düşer.
 *
 * useEffect deps: [patientId, clinicId, configured] — SADECE BUNLAR.
 * ❌ messages, state, function, object ekleme.
 */
import { useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseRealtimeConfigured } from '../lib/supabase';

const SUBSCRIBED_TIMEOUT_MS = 8_000;

export type SupabasePatientMessage = {
  id: string;
  from: 'PATIENT' | 'CLINIC';
  text: string;
  type: string;
  attachment?: unknown;
  createdAt: number;
  thread_id?: string;
  _supabase?: true;
};

type MessagesRow = Record<string, unknown> & {
  id: string;
  /** patient_messages uses message_id as the logical key */
  message_id?: string | null;
  created_at: string;
  message_text?: string | null;
  text?: string | null;
  content?: string | null;
  body?: string | null;
  /** messages table */
  sender_type?: string | null;
  /** patient_messages table */
  from_role?: string | null;
  patient_id?: string | null;
  clinic_id?: string | null;
  attachment?: unknown | null;
  thread_id?: string | null;
};

function rowToMessage(row: MessagesRow): SupabasePatientMessage {
  // patient_messages uses from_role; messages uses sender_type
  const senderType = String(row.from_role ?? row.sender_type ?? '').toLowerCase();
  const text = String(row.text ?? row.message_text ?? row.content ?? row.body ?? '');
  // patient_messages uses message_id as logical key; messages uses id
  const id = String(row.message_id || row.id || '');

  return {
    id,
    from: senderType === 'patient' ? 'PATIENT' : 'CLINIC',
    text,
    type: 'text',
    attachment: row.attachment ?? undefined,
    createdAt: new Date(row.created_at).getTime(),
    _supabase: true,
    ...(row.thread_id ? { thread_id: String(row.thread_id) } : {}),
  };
}

function sortAndDedupe(msgs: SupabasePatientMessage[]): SupabasePatientMessage[] {
  const seen = new Set<string>();
  return msgs
    .filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-50);
}

export type UseSupabaseMessagesResult = {
  messages: SupabasePatientMessage[];
  /** initial select TAMAM + SUBSCRIBED geldi → iki koşul birden. */
  ready: boolean;
  /** ENV var yapılandırılmış mı? */
  configured: boolean;
  /** 8 sn içinde SUBSCRIBED gelmedi → Railway fallback kullan. */
  timedOut: boolean;
};

export function useSupabaseMessages({
  patientId,
  clinicId,
}: {
  patientId: string;
  clinicId: string;
}): UseSupabaseMessagesResult {
  const [messages, setMessages] = useState<SupabasePatientMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const configured = isSupabaseRealtimeConfigured();

  useEffect(() => {
    if (!configured || !patientId || !clinicId) {
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

    let disposed = false;
    setReady(false);
    setTimedOut(false);

    // İki koşul birden karşılanınca ready → true
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
        if (__DEV__) console.log('[useSupabaseMessages] ⏱ SUBSCRIBED gelmedi — timedOut=true');
        setTimedOut(true);
      }
    }, SUBSCRIBED_TIMEOUT_MS);

    // İlk yükleme (select)
    void sb
      .from('messages')
      .select('*')
      .eq('patient_id', patientId)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: true })
      .limit(50)
      .then(({ data, error }) => {
        if (disposed) return;
        if (error && __DEV__) console.log('[useSupabaseMessages] SELECT error:', error.message);
        if (data) {
          setMessages(sortAndDedupe((data as MessagesRow[]).map(rowToMessage)));
        }
        selectDone = true;
        maybeSetReady();
      });

    // Realtime — server-side filter: sadece bu hasta'nın olayları gelir
    const topic = `messages-${patientId}-${clinicId}`;

    function handleInsertRow(raw: MessagesRow, tableHint: string) {
      const rowId = String(raw?.message_id || raw?.id || '');
      if (!rowId) return;
      if (__DEV__) console.log(`🔥 RT INSERT ${tableHint}:`, rowId, '| clinic_id:', raw.clinic_id);
      const msg = rowToMessage(raw);
      setMessages(prev => {
        if (prev.some(m => m.id === msg.id)) return prev;
        return sortAndDedupe([...prev, msg]);
      });
    }

    const channel = sb
      .channel(topic)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `patient_id=eq.${patientId}`,
        },
        (payload) => handleInsertRow(payload.new as MessagesRow, 'messages'),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'patient_messages',
          filter: `patient_id=eq.${patientId}`,
        },
        (payload) => handleInsertRow(payload.new as MessagesRow, 'patient_messages'),
      )
      .subscribe((status) => {
        if (__DEV__) console.log('🔥 RT STATUS messages:', status);
        if (status === 'SUBSCRIBED' && !disposed) {
          subscribed = true;
          // Catch-up SELECT: subscribe kurulurken gelen mesajları kaçırmamak için
          void sb
            .from('messages')
            .select('*')
            .eq('patient_id', patientId)
            .eq('clinic_id', clinicId)
            .order('created_at', { ascending: true })
            .limit(50)
            .then(({ data }) => {
              if (disposed || !data) return;
              // Filter ÖNCE map SONRA → sadece yeni satırlar map edilir
              setMessages(prev => {
                const freshRows = (data as MessagesRow[]).filter(
                  r => !prev.some(p => p.id === r.id),
                );
                if (freshRows.length === 0) return prev;
                if (__DEV__) console.log('[useSupabaseMessages] catch-up +', freshRows.length, 'new rows');
                return sortAndDedupe([...prev, ...freshRows.map(rowToMessage)]);
              });
            });
          maybeSetReady();
        }
        if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !disposed) {
          if (__DEV__) console.log('[useSupabaseMessages] RT bağlantı hatası:', status);
          setTimedOut(true);
        }
      });

    channelRef.current = channel;

    return () => {
      disposed = true;
      clearTimeout(timeoutId);
      if (channelRef.current) {
        void sb.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [patientId, clinicId, configured]); // ✅ SADECE BUNLAR — messages/state/function ekleme

  return { messages, ready, configured, timedOut };
}
