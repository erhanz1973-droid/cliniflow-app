import { useCallback, useSyncExternalStore } from "react";

let lastCapturedImage: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return lastCapturedImage;
}

/** Read current URI without subscribing (navigation helpers, non-React). */
export function getLastCapturedImageSnapshot(): string | null {
  return lastCapturedImage;
}

export function setLastCapturedImage(uri: string | null) {
  if (lastCapturedImage === uri) return;
  lastCapturedImage = uri;
  listeners.forEach((l) => l());
}

export function useLastCapturedImage(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useLastCapturedImageActions() {
  const uri = useLastCapturedImage();
  const set = useCallback((next: string | null) => {
    setLastCapturedImage(next);
  }, []);
  return { lastCapturedImage: uri, setLastCapturedImage: set };
}
