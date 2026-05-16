/** Lightweight pub/sub for offer-thread unread changes (push, poll, mark-read). */

export type OfferUnreadEvent =
  | {
      type: "offer_activity";
      offerId?: string;
      requestId?: string;
      recipient: "doctor" | "patient";
    }
  | {
      type: "offer_mark_read";
      offerId?: string;
      recipient: "doctor" | "patient";
    }
  | {
      type: "offer_realtime_update";
      offerId?: string;
      requestId?: string;
      recipient: "doctor" | "patient";
    };

type Listener = (event: OfferUnreadEvent) => void;

const listeners = new Set<Listener>();

export function emitOfferUnreadEvent(event: OfferUnreadEvent): void {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch {
      /* ignore subscriber errors */
    }
  }
}

export function subscribeOfferUnreadEvents(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
