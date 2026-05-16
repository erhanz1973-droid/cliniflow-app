/**
 * Chat odak bayrakları — Railway GET'lerin Supabase Realtime'ı ezmesini önler.
 *
 * Kalıcı çözüm: Supabase yapılandırıldıktan sonra Railway mesaj fetch'lerini tamamen silmek.
 * Bu modül migration sürecinde guard sağlar.
 *
 * Supabase yapılandırılmışsa (`isSupabaseRealtimeConfigured()`) ekranlar zaten Railway'i atlıyor;
 * bu guard yalnızca Supabase ENV eksikken veya başka provider'larda fallback olarak işe yarar.
 */

declare global {
  // eslint-disable-next-line no-var, vars-on-top
  var isChatOpen: boolean | undefined;
  // eslint-disable-next-line no-var, vars-on-top
  var isOfferChatOpen: boolean | undefined;
  /** Offer-chat route focus — suppress per-card unread bump while thread is open. */
  var activeOfferChatOfferId: string | undefined;
}

export function setGlobalChatOpen(open: boolean): void {
  globalThis.isChatOpen = open;
}

export function getGlobalChatOpen(): boolean {
  return globalThis.isChatOpen === true;
}

export function setGlobalOfferChatOpen(open: boolean, offerId?: string | null): void {
  globalThis.isOfferChatOpen = open;
  if (open) {
    const oid = String(offerId ?? "").trim();
    globalThis.activeOfferChatOfferId = oid || undefined;
  } else {
    globalThis.activeOfferChatOfferId = undefined;
  }
}

export function getGlobalOfferChatOpen(): boolean {
  return globalThis.isOfferChatOpen === true;
}

export function getActiveOfferChatOfferId(): string {
  return String(globalThis.activeOfferChatOfferId ?? "").trim();
}

/** Her iki ekran da odaktayken Railway fetch'ini kes — harici provider'lar için. */
export function shouldBlockRailwayMessagesFetch(): boolean {
  return getGlobalChatOpen() || getGlobalOfferChatOpen();
}

/**
 * `GET /api/patient/me/messages` — fonksiyonun en başında çağır.
 *
 * Her iki chat ekranı da açıkken arka plan REST'i durdurur.
 * Supabase yapılandırılmışsa, ekranlar zaten `isSupabaseRealtimeConfigured()` ile atlar —
 * bu guard Supabase yokken devreye girer.
 */
export function maybeAbortRailwayMessagesFetch(): boolean {
  if (getGlobalChatOpen() || getGlobalOfferChatOpen()) {
    console.log('⛔ FETCH BLOCKED');
    return true;
  }
  return false;
}

/**
 * `GET /api/offer-messages` — fonksiyonun en başında çağır.
 *
 * Supabase yapılandırılmışsa, offer-chat.tsx zaten `isSupabaseRealtimeConfigured()` ile atlıyor;
 * bu guard Supabase yokken ve hasta ana chat odaktayken devreye girer.
 */
export function maybeAbortOfferRailwayMessagesFetch(): boolean {
  if (getGlobalChatOpen()) {
    console.log('⛔ FETCH BLOCKED');
    return true;
  }
  return false;
}
