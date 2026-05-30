import type { DoctorChatMessage } from './doctorPatientChatCache';

export const DOCTOR_CHAT_MESSAGE_CAP = 250;

/**
 * Merge a server fetch snapshot with local state without dropping in-flight / just-sent messages.
 */
export function mergeFetchedWithLocalMessages(
  fetched: DoctorChatMessage[],
  local: DoctorChatMessage[],
  opts: { fetchStartedAt: number; cap?: number }
): DoctorChatMessage[] {
  const cap = opts.cap ?? DOCTOR_CHAT_MESSAGE_CAP;
  const cutoff = opts.fetchStartedAt - 1000;
  const byId = new Map<string, DoctorChatMessage>();

  for (const m of fetched) {
    const id = String(m.id || '').trim();
    if (id) byId.set(id, m);
  }

  for (const m of local) {
    const id = String(m.id || '').trim();
    if (!id) continue;
    // Keep only in-flight / just-sent rows — do not re-merge stale disk cache ids missing from fetch.
    const keep = m.pending === true || m.createdAt >= cutoff;
    if (!keep) continue;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, m);
      continue;
    }
    if (m.pending && !existing.pending) continue;
    if (existing.pending && !m.pending) {
      byId.set(id, m);
      continue;
    }
    if (m.createdAt >= existing.createdAt) byId.set(id, m);
  }

  return [...byId.values()]
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-cap);
}

export function capDoctorChatMessages(
  messages: DoctorChatMessage[],
  cap: number = DOCTOR_CHAT_MESSAGE_CAP
): DoctorChatMessage[] {
  return [...messages].sort((a, b) => a.createdAt - b.createdAt).slice(-cap);
}
