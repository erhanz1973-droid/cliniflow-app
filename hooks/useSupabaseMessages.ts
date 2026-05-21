/**
 * Hasta ↔ klinik chat — `public.patient_messages` + `public.messages` + Supabase Realtime.
 * Backend `fetchMessagesFromSupabase` ile aynı mantık: her iki tablo da `patient_id` ile yüklenir
 * (doktor satırları çoğu zaman `messages.message` veya yalnızca `messages` tablosunda).
 *
 * `ready`: initial select TAMAM **ve** SUBSCRIBED status geldi → iki koşul birden.
 * `timedOut`: 8 sn içinde SUBSCRIBED gelmedi → ekran Railway fallback'e düşer.
 *
 * useEffect deps: [patientId, clinicId, configured] — SADECE BUNLAR.
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
  /** messages tablosunda gövde çoğunlukla burada */
  message?: string | null;
  message_text?: string | null;
  text?: string | null;
  content?: string | null;
  body?: string | null;
  msg?: string | null;
  payload?: unknown;
  data?: unknown;
  /** messages table */
  sender_type?: string | null;
  /** patient_messages table */
  from_role?: string | null;
  patient_id?: string | null;
  clinic_id?: string | null;
  attachment?: unknown | null;
  thread_id?: string | null;
};

function extractRowBodyText(row: MessagesRow): string {
  const keys = [
    'message',
    'text',
    'content',
    'message_text',
    'body',
    'msg',
  ] as const;
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    const s = typeof v === 'string' ? v.trim() : String(v).trim();
    if (s !== '') return s;
  }
  if (row.payload != null) {
    try {
      const p =
        typeof row.payload === 'string' ? JSON.parse(row.payload) : (row.payload as Record<string, unknown>);
      if (p && typeof p === 'object') {
        for (const k of ['text', 'message', 'body', 'content'] as const) {
          const v = p[k];
          if (v != null && String(v).trim() !== '') return String(v).trim();
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (row.data != null) {
    try {
      const d =
        typeof row.data === 'string' ? JSON.parse(row.data) : (row.data as Record<string, unknown>);
      if (d && typeof d === 'object') {
        for (const k of ['text', 'message', 'body', 'content'] as const) {
          const v = d[k];
          if (v != null && String(v).trim() !== '') return String(v).trim();
        }
      }
    } catch {
      /* ignore */
    }
  }
  return '';
}

function parseRowAttachment(row: MessagesRow): SupabasePatientMessage['attachment'] {
  const raw = row.attachment ?? (row as { attachments?: unknown }).attachments;
  if (raw == null) return undefined;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return parsed as SupabasePatientMessage['attachment'];
    } catch {
      return undefined;
    }
  }
  if (typeof raw === 'object') return raw as SupabasePatientMessage['attachment'];
  return undefined;
}

function rowToMessage(row: MessagesRow): SupabasePatientMessage {
  // patient_messages uses from_role; messages uses sender_type
  const senderType = String(row.from_role ?? row.sender_type ?? '').toLowerCase();
  const text = extractRowBodyText(row);
  // patient_messages uses message_id as logical key; messages uses id
  const id = String(row.message_id || row.id || '');
  const attachment = parseRowAttachment(row);
  const explicitType = String(row.type || '').trim().toLowerCase();
  const type =
    explicitType ||
    (attachment &&
    typeof attachment === 'object' &&
    ((attachment as { aiResult?: unknown }).aiResult ||
      (attachment as { ai_result?: unknown }).ai_result))
      ? 'ai_result'
      : 'text';

  return {
    id,
    from: senderType === 'patient' ? 'PATIENT' : 'CLINIC',
    text,
    type,
    attachment,
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
  /** false: no Supabase load/subscribe (e.g. doctor tab viewing a patient — hook must still run). */
  enabled = true,
}: {
  patientId: string;
  /** Opsiyonel; realtime kanal adını ayırt etmek için. Birleşik akış `patient_id` ile yüklenir — `messages` clinicId ile filtrelenmez (backend ile aynı). */
  clinicId?: string;
  enabled?: boolean;
}): UseSupabaseMessagesResult {
  const [messages, setMessages] = useState<SupabasePatientMessage[]>([]);
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const configured = isSupabaseRealtimeConfigured();

  useEffect(() => {
    if (!enabled) {
      setMessages([]);
      setReady(false);
      setTimedOut(false);
      return;
    }

    if (!configured || !patientId) {
      setMessages([]);
      setReady(false);
      setTimedOut(false);
      return;
    }

    const clinicScope = String(clinicId || '').trim();

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

    // İlk yükleme: `patient_messages` + `messages` (patient_id — backend ile aynı birleşik akış)
    void (async () => {
      const rows: MessagesRow[] = [];
      try {
        const pm = await sb
          .from('patient_messages')
          .select('*')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: true })
          .limit(80);
        if (pm.error && __DEV__) console.log('[useSupabaseMessages] patient_messages SELECT:', pm.error.message);
        if (Array.isArray(pm.data)) rows.push(...(pm.data as MessagesRow[]));
      } catch (e) {
        if (__DEV__) console.warn('[useSupabaseMessages] patient_messages load:', e);
      }
      try {
        const res = await sb
          .from('messages')
          .select('*')
          .eq('patient_id', patientId)
          .order('created_at', { ascending: true })
          .limit(120);
        if (res.error && __DEV__) console.log('[useSupabaseMessages] messages SELECT:', res.error.message);
        if (Array.isArray(res.data)) rows.push(...(res.data as MessagesRow[]));
      } catch (e) {
        if (__DEV__) console.warn('[useSupabaseMessages] messages load:', e);
      }
      if (!disposed) {
        setMessages(sortAndDedupe(rows.map(rowToMessage)));
      }
      selectDone = true;
      maybeSetReady();
    })();

    // Realtime — server-side filter: sadece bu hasta'nın olayları gelir
    const topic = `messages-${patientId}-${clinicScope || 'noclinic'}`;

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
          // Catch-up: subscribe sırasında kaçan satırlar (canonical id = rowToMessage id)
          void (async () => {
            const rows: MessagesRow[] = [];
            try {
              const pm = await sb
                .from('patient_messages')
                .select('*')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: true })
                .limit(80);
              if (Array.isArray(pm.data)) rows.push(...(pm.data as MessagesRow[]));
            } catch (_) { /* noop */ }
            try {
              const res = await sb
                .from('messages')
                .select('*')
                .eq('patient_id', patientId)
                .order('created_at', { ascending: true })
                .limit(120);
              if (Array.isArray(res.data)) rows.push(...(res.data as MessagesRow[]));
            } catch (_) { /* noop */ }
            if (disposed || rows.length === 0) return;
            setMessages(prev => {
              const seen = new Set(prev.map((m) => String(m.id)));
              const appended = rows
                .map(rowToMessage)
                .filter((m) => m.id && !seen.has(String(m.id)));
              if (appended.length === 0) return prev;
              if (__DEV__) console.log('[useSupabaseMessages] catch-up +', appended.length);
              return sortAndDedupe([...prev, ...appended]);
            });
          })();
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
  }, [patientId, clinicId, configured, enabled]); // ✅ SADECE BUNLAR — messages/state/function ekleme

  return { messages, ready, configured, timedOut };
}
