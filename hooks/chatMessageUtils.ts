/**
 * Chat mesaj listeleri için saf (pure) yardımcı fonksiyonlar.
 *
 * KURALLAR:
 *  ✅ Her zaman YENİ array döndür — aynı referansı asla döndürme (React render tetiklenmez)
 *  ✅ id bazlı dedupe
 *  ✅ Mevcut obje asla mutate edilmez (prev.push yasak)
 *  ❌ { ...m, ...msg } / Object.assign / prev.push / return prev (duplicate dışı) YASAK
 */

/** Ortak minimum shape — hem Message (messages.tsx) hem Message (offer-chat.tsx) karşılar. */
export type MinimalMsg = { id: string; [key: string]: unknown };

/**
 * Tek bir mesajı listeye ekle.
 * - id yoksa → pas geç
 * - zaten varsa → pas geç (duplicate) → prev AYNI referansla döner (React skip eder — beklenen)
 * - yoksa → YENİ array döndür → React render tetiklenir
 */
export function appendMappedChatMessage<T extends MinimalMsg>(
  prev: T[],
  msg: T | null | undefined,
): T[] {
  if (!msg?.id) {
    if (__DEV__) console.warn('[appendMappedChatMessage] ⚠ id eksik, atlandı:', msg);
    return prev;
  }

  if (prev.some(m => m.id === msg.id)) {
    if (__DEV__) console.log('[appendMappedChatMessage] dup skip id:', msg.id);
    return prev; // duplicate → aynı referans → React re-render YOK (beklenen davranış)
  }

  if (__DEV__) {
    console.log('STATE LENGTH BEFORE:', prev.length);
  }

  const next = [...prev, msg]; // ← YENİ array referansı — React değişikliği algılar

  if (__DEV__) {
    console.log('STATE LENGTH AFTER:', next.length);
    console.log('✅ APPENDED id:', msg.id, '| text:', JSON.stringify((msg as { text?: unknown }).text));
  }

  return next;
}

/**
 * Fetch sonucu satır listesini mevcut state'e additif olarak birleştir.
 * - Her satır için mapFn çağır
 * - Zaten varsa → pas geç (mevcut objeyi ASLA değiştirme)
 * - Yoksa → push
 * - Sıralama + slice opsiyonel
 */
export function mergeIncomingRows<TRow, T extends MinimalMsg>(
  prev: T[],
  rows: TRow[],
  mapFn: (row: TRow) => T | null,
  opts?: { sortKey?: keyof T; limit?: number },
): T[] {
  const merged = [...prev]; // YENİ array başlangıcı
  let added = 0;

  for (const row of rows) {
    const msg = mapFn(row);
    if (!msg?.id) continue;
    if (merged.some(m => m.id === msg.id)) continue; // dedupe
    merged.push(msg);
    added++;
    if (__DEV__) console.log('[mergeIncomingRows] ADD id:', msg.id, '| text:', JSON.stringify((msg as { text?: unknown }).text));
  }

  if (__DEV__ && added > 0) {
    console.log('[mergeIncomingRows] STATE LENGTH BEFORE:', prev.length, '→ AFTER:', merged.length);
  }

  if (opts?.sortKey) {
    const k = opts.sortKey;
    merged.sort((a, b) => {
      const av = a[k];
      const bv = b[k];
      if (typeof av === 'number' && typeof bv === 'number') return av - bv;
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv);
      return 0;
    });
  }

  return opts?.limit ? merged.slice(-opts.limit) : merged;
}

/**
 * Supabase sbMessages ile mevcut state'i birleştir.
 * - local/pending satırları koru
 * - Supabase'den gelen satırları additif ekle (var olanları ASLA değiştirme)
 * - Her zaman YENİ array döner ([...server, ...local])
 */
export function mergeSbMessages<T extends MinimalMsg>(
  prev: T[],
  sbMessages: T[],
  isLocalOrPending: (m: T) => boolean,
): T[] {
  const merged = [...prev]; // YENİ array
  let added = 0;

  for (const msg of sbMessages) {
    if (!msg?.id) continue;
    if (merged.some(m => m.id === msg.id)) continue; // zaten var — dokunma
    merged.push(msg);
    added++;
  }

  if (__DEV__ && added > 0) {
    console.log('[mergeSbMessages] STATE LENGTH BEFORE:', prev.length, '→ AFTER:', merged.length, '(added:', added, ')');
  }

  // local/pending'i sona taşı
  const server = merged.filter(m => !isLocalOrPending(m));
  const local  = merged.filter(m => isLocalOrPending(m));
  return [...server, ...local]; // ← daima YENİ array
}
