import { useCallback, useSyncExternalStore } from "react";

type SmilePhotoPairState = {
  smileUri: string | null;
  teethUri: string | null;
};

let state: SmilePhotoPairState = { smileUri: null, teethUri: null };
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SmilePhotoPairState {
  return state;
}

function emit() {
  listeners.forEach((l) => l());
}

export function getSmilePhotoPairSnapshot(): SmilePhotoPairState {
  return state;
}

export function setSmilePhotoUri(uri: string | null) {
  const next = String(uri || "").trim() || null;
  if (state.smileUri === next) return;
  state = { ...state, smileUri: next };
  emit();
}

export function setTeethPhotoUri(uri: string | null) {
  const next = String(uri || "").trim() || null;
  if (state.teethUri === next) return;
  state = { ...state, teethUri: next };
  emit();
}

export function setSmilePhotoPair(pair: Partial<SmilePhotoPairState>) {
  const smileUri =
    pair.smileUri !== undefined
      ? String(pair.smileUri || "").trim() || null
      : state.smileUri;
  const teethUri =
    pair.teethUri !== undefined
      ? String(pair.teethUri || "").trim() || null
      : state.teethUri;
  if (state.smileUri === smileUri && state.teethUri === teethUri) return;
  state = { smileUri, teethUri };
  emit();
}

export function clearSmilePhotoPair() {
  if (!state.smileUri && !state.teethUri) return;
  state = { smileUri: null, teethUri: null };
  emit();
}

export function useSmilePhotoPair(): SmilePhotoPairState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useSmilePhotoPairActions() {
  const pair = useSmilePhotoPair();
  const setSmile = useCallback((uri: string | null) => setSmilePhotoUri(uri), []);
  const setTeeth = useCallback((uri: string | null) => setTeethPhotoUri(uri), []);
  const setPair = useCallback((p: Partial<SmilePhotoPairState>) => setSmilePhotoPair(p), []);
  const clear = useCallback(() => clearSmilePhotoPair(), []);
  return { ...pair, setSmilePhotoUri: setSmile, setTeethPhotoUri: setTeeth, setSmilePhotoPair: setPair, clearSmilePhotoPair: clear };
}
